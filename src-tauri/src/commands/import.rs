use crate::commands::search as search_cmd;
use crate::db::DbConn;
use crate::models::*;
use crate::parser::{self, ParseOptions};
use crate::rules;
use crate::search;
use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImportResult {
    pub book: Book,
    pub warnings: Vec<String>,
}

fn get_library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data dir".to_string())?;
    let library = data_dir.join("library");
    fs::create_dir_all(&library).map_err(|e| e.to_string())?;
    Ok(library)
}

fn compute_hash(path: &Path) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let hash = blake3::hash(&data);
    Ok(hash.to_hex().to_string())
}

fn get_format(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("unknown")
        .to_lowercase()
}

/// Parsed result from blocking I/O — everything needed to write to DB.
enum ParsedImport {
    Novel {
        metadata: crate::parser::DocMetadata,
        chapters: Vec<crate::parser::ParsedChapter>,
    },
    Comic {
        comic: crate::parser::comic::ParsedComic,
    },
}

#[tauri::command(async)]
pub async fn import_book(
    app: AppHandle,
    db: State<'_, DbConn>,
    file_path: String,
    encoding: Option<String>,
) -> Result<ImportResult, String> {
    let path = Path::new(&file_path).to_path_buf();
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let format = get_format(&path);
    let file_size = fs::metadata(&path).map_err(|e| e.to_string())?.len() as i64;

    // Check for duplicates (quick DB read — hold lock briefly)
    let file_hash = compute_hash(&path)?;
    {
        let conn = db.conn.lock();
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM books WHERE file_hash = ?1 AND deleted_at IS NULL",
                params![file_hash],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
            > 0;

        if exists {
            return Err("Book already imported".to_string());
        }

        // If soft-deleted, permanently remove it so we can re-import
        conn.execute(
            "DELETE FROM books WHERE file_hash = ?1 AND deleted_at IS NOT NULL",
            params![file_hash],
        )
        .map_err(|e| e.to_string())?;
    } // DB lock released

    // Copy file to library
    let library_dir = get_library_dir(&app)?;
    let bucket = &file_hash[..2];
    let bucket_dir = library_dir.join(bucket);
    fs::create_dir_all(&bucket_dir).map_err(|e| e.to_string())?;

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let dest_name = format!("{}.{}", file_hash, ext);
    let dest_path = bucket_dir.join(&dest_name);
    fs::copy(&path, &dest_path).map_err(|e| e.to_string())?;

    let relative_path = format!("{}/{}", bucket, dest_name);

    // Heavy parsing — offload to a dedicated blocking thread so we don't
    // starve the tokio async runtime (this is what caused the UI to freeze).
    let comic_cache_dir = library_dir.join("comic_cache");
    let format_for_parse = format.clone();
    let parsed = tokio::task::spawn_blocking(move || -> Result<ParsedImport, String> {
        let format = format_for_parse;
        match format.as_str() {
            "txt" => {
                let opts = ParseOptions {
                    encoding,
                    chapter_pattern: None,
                };
                let mut parsed = parser::txt::parse(&path, &opts).map_err(|e| e.to_string())?;

                // Apply preset rules (web novel noise filtering)
                let preset = rules::presets::web_novel_cleaner();
                let (cleaned_text, replacements) = rules::apply_rules(&parsed.full_text, &preset.rules);
                if replacements > 0 {
                    parsed.full_text = cleaned_text;
                    parsed.chapters = parser::txt::detect_chapters_from_text(&parsed.full_text);
                    parsed.metadata.total_chars = parsed.full_text.chars().count();
                    parsed.metadata.total_chapters = parsed.chapters.len();
                }

                Ok(ParsedImport::Novel {
                    metadata: parsed.metadata,
                    chapters: parsed.chapters,
                })
            }
            "epub" => {
                let opts = ParseOptions {
                    encoding: None,
                    chapter_pattern: None,
                };
                let parsed = parser::epub::parse(&path, &opts).map_err(|e| e.to_string())?;
                Ok(ParsedImport::Novel {
                    metadata: parsed.metadata,
                    chapters: parsed.chapters,
                })
            }
            "pdf" => {
                let opts = ParseOptions {
                    encoding: None,
                    chapter_pattern: None,
                };
                let parsed = parser::pdf::parse(&path, &opts).map_err(|e| e.to_string())?;
                Ok(ParsedImport::Novel {
                    metadata: parsed.metadata,
                    chapters: parsed.chapters,
                })
            }
            "md" | "markdown" => {
                let opts = ParseOptions {
                    encoding: None,
                    chapter_pattern: None,
                };
                let parsed = parser::markdown::parse(&path, &opts).map_err(|e| e.to_string())?;
                Ok(ParsedImport::Novel {
                    metadata: parsed.metadata,
                    chapters: parsed.chapters,
                })
            }
            "docx" => {
                let opts = ParseOptions {
                    encoding: None,
                    chapter_pattern: None,
                };
                let parsed = parser::docx::parse(&path, &opts).map_err(|e| e.to_string())?;
                Ok(ParsedImport::Novel {
                    metadata: parsed.metadata,
                    chapters: parsed.chapters,
                })
            }
            "cbz" => {
                let comic = parser::comic::parse_cbz(&path, &comic_cache_dir)
                    .map_err(|e| e.to_string())?;
                Ok(ParsedImport::Comic { comic })
            }
            "cbr" => {
                let comic = parser::comic::parse_cbr(&path, &comic_cache_dir)
                    .map_err(|e| e.to_string())?;
                Ok(ParsedImport::Comic { comic })
            }
            _ => Err(format!("Unsupported format: {}", format)),
        }
    })
    .await
    .map_err(|e| format!("Parse task failed: {}", e))??;

    let book_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // DB writes — hold the lock for the insert batch, then release.
    let book = {
        let conn = db.conn.lock();

        match parsed {
            ParsedImport::Novel { metadata, chapters } => {
                // Insert book
                conn.execute(
                    "INSERT INTO books (id, kind, title, author, file_hash, file_path, file_size, format,
                                       language, total_chapters, total_chars)
                     VALUES (?1, 'novel', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        book_id,
                        metadata.title,
                        metadata.author,
                        file_hash,
                        relative_path,
                        file_size,
                        format,
                        metadata.language,
                        metadata.total_chapters as i64,
                        metadata.total_chars as i64,
                    ],
                )
                .map_err(|e| e.to_string())?;

                // Insert chapters and index in one pass
                for (i, ch) in chapters.iter().enumerate() {
                    let chapter_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO chapters (id, book_id, title, level, sort_order, start_offset, end_offset, char_count, content)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                        params![
                            chapter_id,
                            book_id,
                            ch.title,
                            ch.level,
                            i as i64,
                            ch.start_offset as i64,
                            ch.end_offset as i64,
                            ch.char_count as i64,
                            ch.content,
                        ],
                    )
                    .map_err(|e| e.to_string())?;

                    // Index into FTS5 immediately — avoids a second query loop
                    search_cmd::index_chapter(
                        &conn,
                        &book_id,
                        &chapter_id,
                        Some(&ch.title),
                        &ch.content,
                    )?;
                }

                // Update FTS index for book title/author
                conn.execute(
                    "INSERT INTO books_fts(rowid, title, author, description)
                     SELECT rowid, ?2, ?3, description FROM books WHERE id = ?1",
                    params![
                        book_id,
                        search::tokenize(&metadata.title),
                        metadata.author.as_deref().map(|a| search::tokenize(a)).unwrap_or_default(),
                    ],
                )
                .map_err(|e| e.to_string())?;

                Book {
                    id: book_id,
                    kind: "novel".to_string(),
                    title: metadata.title,
                    author: metadata.author,
                    file_hash,
                    file_path: relative_path,
                    file_size,
                    format,
                    cover_path: None,
                    description: None,
                    language: metadata.language,
                    total_chapters: Some(metadata.total_chapters as i64),
                    total_chars: Some(metadata.total_chars as i64),
                    metadata_json: None,
                    reading_mode: None,
                    added_at: now.clone(),
                    updated_at: now,
                }
            }
            ParsedImport::Comic { comic } => {
                // Insert comic book
                conn.execute(
                    "INSERT INTO books (id, kind, title, author, file_hash, file_path, file_size, format,
                                       language, total_chapters, total_chars, cover_path, metadata_json, reading_mode)
                     VALUES (?1, 'comic', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11, ?12)",
                    params![
                        book_id,
                        comic.metadata.title,
                        comic.metadata.author,
                        file_hash,
                        relative_path,
                        file_size,
                        format,
                        comic.metadata.language,
                        comic.chapters.len() as i64,
                        comic.cover_path,
                        serde_json::to_string(&comic.metadata).unwrap_or_default(),
                        comic.metadata.reading_mode,
                    ],
                )
                .map_err(|e| e.to_string())?;

                // Insert comic chapters with page data as content
                for (i, ch) in comic.chapters.iter().enumerate() {
                    let chapter_id = Uuid::new_v4().to_string();
                    let pages_json = serde_json::to_string(&ch.pages).unwrap_or_default();
                    conn.execute(
                        "INSERT INTO chapters (id, book_id, title, level, sort_order, content)
                         VALUES (?1, ?2, ?3, 1, ?4, ?5)",
                        params![chapter_id, book_id, ch.title, i as i64, pages_json],
                    )
                    .map_err(|e| e.to_string())?;
                }

                // Update FTS index
                conn.execute(
                    "INSERT INTO books_fts(rowid, title, author, description)
                     SELECT rowid, ?2, ?3, description FROM books WHERE id = ?1",
                    params![book_id, search::tokenize(&comic.metadata.title), ""],
                )
                .map_err(|e| e.to_string())?;

                Book {
                    id: book_id,
                    kind: "comic".to_string(),
                    title: comic.metadata.title,
                    author: comic.metadata.author,
                    file_hash,
                    file_path: relative_path,
                    file_size,
                    format,
                    cover_path: comic.cover_path,
                    description: None,
                    language: comic.metadata.language,
                    total_chapters: Some(comic.chapters.len() as i64),
                    total_chars: Some(0),
                    metadata_json: None,
                    reading_mode: Some(comic.metadata.reading_mode),
                    added_at: now.clone(),
                    updated_at: now,
                }
            }
        }
    }; // DB lock released

    Ok(ImportResult {
        book,
        warnings: Vec::new(),
    })
}

#[tauri::command(async)]
pub async fn import_folder(
    app: AppHandle,
    db: State<'_, DbConn>,
    folder_path: String,
) -> Result<ImportResult, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err("Folder not found".to_string());
    }

    let library_dir = get_library_dir(&app)?;
    let cache_dir = library_dir.join("comic_cache");
    let comic = parser::comic::parse_folder(path, &cache_dir).map_err(|e| e.to_string())?;

    // Generate a hash from folder path
    let file_hash = blake3::hash(folder_path.as_bytes()).to_hex().to_string();

    // Check for duplicates (ignore soft-deleted books)
    {
        let conn = db.conn.lock();
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM books WHERE file_hash = ?1 AND deleted_at IS NULL",
                params![file_hash],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
            > 0;

        if exists {
            return Err("Folder already imported".to_string());
        }

        // If soft-deleted, permanently remove it so we can re-import
        conn.execute(
            "DELETE FROM books WHERE file_hash = ?1 AND deleted_at IS NOT NULL",
            params![file_hash],
        )
        .map_err(|e| e.to_string())?;
    }

    let book_id = Uuid::new_v4().to_string();

    // Insert into database
    {
        let conn = db.conn.lock();

        conn.execute(
            "INSERT INTO books (id, kind, title, author, file_hash, file_path, file_size, format,
                               language, total_chapters, total_chars, cover_path, metadata_json, reading_mode)
             VALUES (?1, 'comic', ?2, ?3, ?4, ?5, 0, 'folder', ?6, ?7, 0, ?8, ?9, ?10)",
            params![
                book_id,
                comic.metadata.title,
                comic.metadata.author,
                file_hash,
                folder_path,
                comic.metadata.language,
                comic.chapters.len() as i64,
                comic.cover_path,
                serde_json::to_string(&comic.metadata).unwrap_or_default(),
                comic.metadata.reading_mode,
            ],
        )
        .map_err(|e| e.to_string())?;

        for (i, ch) in comic.chapters.iter().enumerate() {
            let chapter_id = Uuid::new_v4().to_string();
            let pages_json = serde_json::to_string(&ch.pages).unwrap_or_default();
            conn.execute(
                "INSERT INTO chapters (id, book_id, title, level, sort_order, content)
                 VALUES (?1, ?2, ?3, 1, ?4, ?5)",
                params![chapter_id, book_id, ch.title, i as i64, pages_json],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.execute(
            "INSERT INTO books_fts(rowid, title, author, description)
             SELECT rowid, ?2, ?3, description FROM books WHERE id = ?1",
            params![book_id, search::tokenize(&comic.metadata.title), ""],
        )
        .map_err(|e| e.to_string())?;
    }

    let book = Book {
        id: book_id,
        kind: "comic".to_string(),
        title: comic.metadata.title,
        author: comic.metadata.author,
        file_hash,
        file_path: folder_path,
        file_size: 0,
        format: "folder".to_string(),
        cover_path: comic.cover_path,
        description: None,
        language: comic.metadata.language,
        total_chapters: Some(comic.chapters.len() as i64),
        total_chars: Some(0),
        metadata_json: None,
        reading_mode: Some(comic.metadata.reading_mode),
        added_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    Ok(ImportResult {
        book,
        warnings: Vec::new(),
    })
}
