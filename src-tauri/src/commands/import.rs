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

#[tauri::command]
pub fn import_book(
    app: AppHandle,
    db: State<'_, DbConn>,
    file_path: String,
    encoding: Option<String>,
) -> Result<ImportResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let format = get_format(path);
    let file_size = fs::metadata(path).map_err(|e| e.to_string())?.len() as i64;
    let file_hash = compute_hash(path)?;

    // Check for duplicates
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM books WHERE file_hash = ?1",
                params![file_hash],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
            > 0;

        if exists {
            return Err("Book already imported".to_string());
        }
    }

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
    fs::copy(path, &dest_path).map_err(|e| e.to_string())?;

    let relative_path = format!("{}/{}", bucket, dest_name);

    // Parse based on format
    let (metadata, chapters, _full_text) = match format.as_str() {
        "txt" => {
            let opts = ParseOptions {
                encoding,
                chapter_pattern: None,
            };
            let mut parsed = parser::txt::parse(path, &opts).map_err(|e| e.to_string())?;

            // Apply preset rules (web novel noise filtering)
            let preset = rules::presets::web_novel_cleaner();
            let (cleaned_text, replacements) = rules::apply_rules(&parsed.full_text, &preset.rules);
            if replacements > 0 {
                parsed.full_text = cleaned_text;
                parsed.chapters = parser::txt::detect_chapters_from_text(&parsed.full_text);
                parsed.metadata.total_chars = parsed.full_text.chars().count();
                parsed.metadata.total_chapters = parsed.chapters.len();
            }

            (parsed.metadata, parsed.chapters, parsed.full_text)
        }
        "epub" => {
            let opts = ParseOptions {
                encoding: None,
                chapter_pattern: None,
            };
            let parsed = parser::epub::parse(path, &opts).map_err(|e| e.to_string())?;
            (parsed.metadata, parsed.chapters, parsed.full_text)
        }
        "pdf" => {
            let opts = ParseOptions {
                encoding: None,
                chapter_pattern: None,
            };
            let parsed = parser::pdf::parse(path, &opts).map_err(|e| e.to_string())?;
            (parsed.metadata, parsed.chapters, parsed.full_text)
        }
        "md" | "markdown" => {
            let opts = ParseOptions {
                encoding: None,
                chapter_pattern: None,
            };
            let parsed = parser::markdown::parse(path, &opts).map_err(|e| e.to_string())?;
            (parsed.metadata, parsed.chapters, parsed.full_text)
        }
        "cbz" => {
            let cache_dir = get_library_dir(&app)?.join("comic_cache");
            let comic = parser::comic::parse_cbz(path, &cache_dir).map_err(|e| e.to_string())?;

            let book_id = Uuid::new_v4().to_string();
            let conn = db.conn.lock().map_err(|e| e.to_string())?;

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

            let book = Book {
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
                added_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            };

            return Ok(ImportResult {
                book,
                warnings: Vec::new(),
            });
        }
        _ => {
            return Err(format!("Unsupported format: {}", format));
        }
    };

    let book_id = Uuid::new_v4().to_string();

    // Insert into database
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

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

        // Insert chapters
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
        }

        // Update FTS index for books (tokenize title/author)
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

        // Index chapters into FTS5
        for (i, ch) in chapters.iter().enumerate() {
            let chapter_id: String = conn
                .query_row(
                    "SELECT id FROM chapters WHERE book_id = ?1 AND sort_order = ?2",
                    params![book_id, i as i64],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            search_cmd::index_chapter(
                &conn,
                &book_id,
                &chapter_id,
                Some(&ch.title),
                &ch.content,
            )?;
        }
    }

    // Return the created book
    let book = Book {
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
        added_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    Ok(ImportResult {
        book,
        warnings: Vec::new(),
    })
}

#[tauri::command]
pub fn import_folder(
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

    // Check for duplicates
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM books WHERE file_hash = ?1",
                params![file_hash],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
            > 0;

        if exists {
            return Err("Folder already imported".to_string());
        }
    }

    let book_id = Uuid::new_v4().to_string();

    // Insert into database
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

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
