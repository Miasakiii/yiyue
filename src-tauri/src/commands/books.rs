use crate::commands::search as search_cmd;
use crate::db::DbConn;
use crate::models::*;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_books(
    db: State<'_, DbConn>,
    filter: Option<BookFilter>,
) -> Result<Vec<BookListItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let filter = filter.unwrap_or(BookFilter {
        kind: None,
        tag: None,
        group: None,
        starred: None,
        search: None,
        sort_by: None,
    });

    let mut sql = String::from(
        "SELECT b.id, b.kind, b.title, b.author, b.format, b.cover_path, b.file_size,
                b.total_chapters, b.added_at, b.updated_at,
                COALESCE(rp.percentage, 0) as reading_percentage,
                CASE WHEN f.book_id IS NOT NULL THEN 1 ELSE 0 END as starred
         FROM books b
         LEFT JOIN reading_progress rp ON rp.book_id = b.id
         LEFT JOIN favorites f ON f.book_id = b.id
         WHERE b.deleted_at IS NULL",
    );

    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref kind) = filter.kind {
        sql.push_str(" AND b.kind = ?");
        param_values.push(Box::new(kind.clone()));
    }

    if let Some(ref search) = filter.search {
        sql.push_str(" AND (b.title LIKE ? OR b.author LIKE ?)");
        let pattern = format!("%{}%", search);
        param_values.push(Box::new(pattern.clone()));
        param_values.push(Box::new(pattern));
    }

    if filter.starred == Some(true) {
        sql.push_str(" AND f.book_id IS NOT NULL");
    }

    let sort = filter.sort_by.as_deref().unwrap_or("last_read");
    match sort {
        "title" => sql.push_str(" ORDER BY b.title ASC"),
        "author" => sql.push_str(" ORDER BY b.author ASC, b.title ASC"),
        "added" => sql.push_str(" ORDER BY b.added_at DESC"),
        "size" => sql.push_str(" ORDER BY b.file_size DESC"),
        _ => sql.push_str(" ORDER BY b.updated_at DESC"),
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(BookListItem {
                id: row.get(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                author: row.get(3)?,
                format: row.get(4)?,
                cover_path: row.get(5)?,
                file_size: row.get(6)?,
                total_chapters: row.get(7)?,
                added_at: row.get(8)?,
                updated_at: row.get(9)?,
                reading_percentage: row.get(10)?,
                starred: row.get::<_, i64>(11)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut books = Vec::new();
    for row in rows {
        books.push(row.map_err(|e| e.to_string())?);
    }
    Ok(books)
}

#[tauri::command]
pub fn get_book(db: State<'_, DbConn>, id: String) -> Result<Book, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, kind, title, author, file_hash, file_path, file_size, format,
                cover_path, description, language, total_chapters, total_chars,
                metadata_json, reading_mode, added_at, updated_at
         FROM books WHERE id = ?1 AND deleted_at IS NULL",
        params![id],
        |row| {
            Ok(Book {
                id: row.get(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                author: row.get(3)?,
                file_hash: row.get(4)?,
                file_path: row.get(5)?,
                file_size: row.get(6)?,
                format: row.get(7)?,
                cover_path: row.get(8)?,
                description: row.get(9)?,
                language: row.get(10)?,
                total_chapters: row.get(11)?,
                total_chars: row.get(12)?,
                metadata_json: row.get(13)?,
                reading_mode: row.get(14)?,
                added_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_book(
    db: State<'_, DbConn>,
    id: String,
    update: UpdateBook,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(title) = update.title {
        sets.push("title = ?");
        param_values.push(Box::new(title));
    }
    if let Some(author) = update.author {
        sets.push("author = ?");
        param_values.push(Box::new(author));
    }
    if let Some(description) = update.description {
        sets.push("description = ?");
        param_values.push(Box::new(description));
    }
    if let Some(language) = update.language {
        sets.push("language = ?");
        param_values.push(Box::new(language));
    }

    if sets.is_empty() {
        return Ok(());
    }

    sets.push("updated_at = datetime('now')");
    param_values.push(Box::new(id));

    let sql = format!("UPDATE books SET {} WHERE id = ?", sets.join(", "));
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_book(db: State<'_, DbConn>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Remove from FTS indexes
    search_cmd::remove_book_from_index(&conn, &id)?;

    // Soft delete
    conn.execute(
        "UPDATE books SET deleted_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_chapters(db: State<'_, DbConn>, book_id: String) -> Result<Vec<Chapter>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, book_id, title, level, sort_order, start_offset, end_offset, char_count
             FROM chapters WHERE book_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![book_id], |row| {
            Ok(Chapter {
                id: row.get(0)?,
                book_id: row.get(1)?,
                title: row.get(2)?,
                level: row.get(3)?,
                sort_order: row.get(4)?,
                start_offset: row.get(5)?,
                end_offset: row.get(6)?,
                char_count: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut chapters = Vec::new();
    for row in rows {
        chapters.push(row.map_err(|e| e.to_string())?);
    }
    Ok(chapters)
}

#[tauri::command]
pub fn get_progress(
    db: State<'_, DbConn>,
    book_id: String,
) -> Result<Option<ReadingProgress>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT book_id, chapter_id, scroll_offset, page_index, percentage, last_read_at
         FROM reading_progress WHERE book_id = ?1",
        params![book_id],
        |row| {
            Ok(ReadingProgress {
                book_id: row.get(0)?,
                chapter_id: row.get(1)?,
                scroll_offset: row.get(2)?,
                page_index: row.get(3)?,
                percentage: row.get(4)?,
                last_read_at: row.get(5)?,
            })
        },
    );

    match result {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn update_progress(
    db: State<'_, DbConn>,
    book_id: String,
    progress: UpdateProgress,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO reading_progress (book_id, chapter_id, scroll_offset, page_index, percentage, last_read_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(book_id) DO UPDATE SET
             chapter_id = COALESCE(?2, chapter_id),
             scroll_offset = COALESCE(?3, scroll_offset),
             page_index = COALESCE(?4, page_index),
             percentage = COALESCE(?5, percentage),
             last_read_at = datetime('now')",
        params![
            book_id,
            progress.chapter_id,
            progress.scroll_offset,
            progress.page_index,
            progress.percentage,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Also update the book's updated_at
    conn.execute(
        "UPDATE books SET updated_at = datetime('now') WHERE id = ?1",
        params![book_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn toggle_favorite(db: State<'_, DbConn>, book_id: String) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM favorites WHERE book_id = ?1",
            params![book_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if exists {
        conn.execute("DELETE FROM favorites WHERE book_id = ?1", params![book_id])
            .map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        conn.execute(
            "INSERT INTO favorites (book_id) VALUES (?1)",
            params![book_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn get_chapter_content(
    db: State<'_, DbConn>,
    chapter_id: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT content FROM chapters WHERE id = ?1",
        params![chapter_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}
