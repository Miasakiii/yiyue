use crate::commands::search as search_cmd;
use crate::error::{AppError, AppResult};
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

fn get_library_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::Internal("Failed to resolve app data dir".to_string()))?;
    let library = data_dir.join("library");
    fs::create_dir_all(&library)?;
    Ok(library)
}

fn compute_hash(path: &Path) -> AppResult<String> {
    let data = fs::read(path)?;
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
) -> AppResult<ImportResult> {
    let started = std::time::Instant::now();
    let path = Path::new(&file_path).to_path_buf();
    if !path.exists() {
        return Err(AppError::NotFound("File not found".to_string()));
    }

    let format = get_format(&path);
    let file_size = fs::metadata(&path)?.len() as i64;
    crate::logging::log_start("book.import", &[("path", &file_path), ("format", &format)], "import started");

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
            ?
            > 0;

        if exists {
            return Err(AppError::InvalidInput("Book already imported".to_string()));
        }

        // If soft-deleted, permanently remove it so we can re-import
        conn.execute(
            "DELETE FROM books WHERE file_hash = ?1 AND deleted_at IS NOT NULL",
            params![file_hash],
        )
        ?;
    } // DB lock released

    // Copy file to library
    let library_dir = get_library_dir(&app)?;
    let bucket = &file_hash[..2];
    let bucket_dir = library_dir.join(bucket);
    fs::create_dir_all(&bucket_dir)?;

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let dest_name = format!("{}.{}", file_hash, ext);
    let dest_path = bucket_dir.join(&dest_name);
    fs::copy(&path, &dest_path)?;

    let relative_path = format!("{}/{}", bucket, dest_name);

    // Heavy parsing — offload to a dedicated blocking thread so we don't
    // starve the tokio async runtime (this is what caused the UI to freeze).
    let comic_cache_dir = library_dir.join("comic_cache");
    let format_for_parse = format.clone();
    let parsed = tokio::task::spawn_blocking(move || -> AppResult<ParsedImport> {
        let format = format_for_parse;
        match format.as_str() {
            "txt" => {
                let opts = ParseOptions {
                    encoding,
                    chapter_pattern: None,
                };
                let mut parsed = parser::txt::parse(&path, &opts)?;

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
                let parsed = parser::epub::parse(&path, &opts)?;
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
                let parsed = parser::pdf::parse(&path, &opts)?;
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
                let parsed = parser::markdown::parse(&path, &opts)?;
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
                let parsed = parser::docx::parse(&path, &opts)?;
                Ok(ParsedImport::Novel {
                    metadata: parsed.metadata,
                    chapters: parsed.chapters,
                })
            }
            "cbz" => {
                let comic = parser::comic::parse_cbz(&path, &comic_cache_dir)
                    ?;
                Ok(ParsedImport::Comic { comic })
            }
            "cbr" => {
                let comic = parser::comic::parse_cbr(&path, &comic_cache_dir)
                    ?;
                Ok(ParsedImport::Comic { comic })
            }
            _ => Err(AppError::InvalidInput(format!("Unsupported format: {}", format))),
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("Parse task failed: {}", e)))??;

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
                ?;

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
                    ?;

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
                let book_pinyin_title = search::to_pinyin_abbr(&metadata.title);
                conn.execute(
                    "INSERT INTO books_fts(rowid, title, author, description)
                     SELECT rowid, ?2, ?3, description FROM books WHERE id = ?1",
                    params![
                        book_id,
                        search::tokenize(&metadata.title),
                        metadata.author.as_deref().map(|a| search::tokenize(a)).unwrap_or_default(),
                    ],
                )
                ?;

                // Store pinyin for book title search
                conn.execute(
                    "UPDATE books SET pinyin_title = ?1 WHERE id = ?2",
                    params![book_pinyin_title, book_id],
                )
                ?;

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
                // ComicInfo.xml 元数据（PLAN 3.4.2）：Writer 优先于推断作者，Summary 入简介，
                // series/volume/year 等并入 metadata_json
                let comic_info_author = comic
                    .comic_info
                    .as_ref()
                    .and_then(|ci| ci.writer.clone())
                    .or_else(|| comic.metadata.author.clone());
                let comic_summary = comic.comic_info.as_ref().and_then(|ci| ci.summary.clone());
                let mut comic_meta_json = serde_json::to_value(&comic.metadata).unwrap_or_default();
                if let Some(ci) = &comic.comic_info {
                    comic_meta_json["comic_info"] = serde_json::to_value(ci).unwrap_or_default();
                }
                conn.execute(
                    "INSERT INTO books (id, kind, title, author, file_hash, file_path, file_size, format,
                                       language, total_chapters, total_chars, cover_path, metadata_json, reading_mode,
                                       description)
                     VALUES (?1, 'comic', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11, ?12, ?13)",
                    params![
                        book_id,
                        comic.metadata.title,
                        comic_info_author,
                        file_hash,
                        relative_path,
                        file_size,
                        format,
                        comic.metadata.language,
                        comic.chapters.len() as i64,
                        comic.cover_path,
                        comic_meta_json.to_string(),
                        comic.metadata.reading_mode,
                        comic_summary,
                    ],
                )
                ?;

                // Insert comic chapters with page data as content
                for (i, ch) in comic.chapters.iter().enumerate() {
                    let chapter_id = Uuid::new_v4().to_string();
                    let pages_json = serde_json::to_string(&ch.pages).unwrap_or_default();
                    conn.execute(
                        "INSERT INTO chapters (id, book_id, title, level, sort_order, content)
                         VALUES (?1, ?2, ?3, 1, ?4, ?5)",
                        params![chapter_id, book_id, ch.title, i as i64, pages_json],
                    )
                    ?;
                }

                // Update FTS index
                conn.execute(
                    "INSERT INTO books_fts(rowid, title, author, description)
                     SELECT rowid, ?2, ?3, description FROM books WHERE id = ?1",
                    params![book_id, search::tokenize(&comic.metadata.title), ""],
                )
                ?;

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

    crate::logging::log_end(
        "book.import",
        &[("path", &file_path), ("bookId", &book.id)],
        started.elapsed().as_millis(),
        "import completed",
    );

    // 元数据自动抓取（PLAN 3.1）：异步后台执行，不阻塞导入返回
    let meta_app = app.clone();
    let meta_conn = db.conn.clone();
    let meta_book_id = book.id.clone();
    tauri::async_runtime::spawn(async move {
        crate::commands::metadata::enrich_auto(meta_app, meta_conn, &meta_book_id).await;
    });

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
) -> AppResult<ImportResult> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err(AppError::NotFound("Folder not found".to_string()));
    }

    let library_dir = get_library_dir(&app)?;
    let cache_dir = library_dir.join("comic_cache");
    let comic = parser::comic::parse_folder(path, &cache_dir)?;

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
            ?
            > 0;

        if exists {
            return Err(AppError::InvalidInput("Folder already imported".to_string()));
        }

        // If soft-deleted, permanently remove it so we can re-import
        conn.execute(
            "DELETE FROM books WHERE file_hash = ?1 AND deleted_at IS NOT NULL",
            params![file_hash],
        )
        ?;
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
        ?;

        for (i, ch) in comic.chapters.iter().enumerate() {
            let chapter_id = Uuid::new_v4().to_string();
            let pages_json = serde_json::to_string(&ch.pages).unwrap_or_default();
            conn.execute(
                "INSERT INTO chapters (id, book_id, title, level, sort_order, content)
                 VALUES (?1, ?2, ?3, 1, ?4, ?5)",
                params![chapter_id, book_id, ch.title, i as i64, pages_json],
            )
            ?;
        }

        conn.execute(
            "INSERT INTO books_fts(rowid, title, author, description)
             SELECT rowid, ?2, ?3, description FROM books WHERE id = ?1",
            params![book_id, search::tokenize(&comic.metadata.title), ""],
        )
        ?;
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
