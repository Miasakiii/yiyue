use crate::db::DbConn;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub book_id: String,
    pub chapter_id: Option<String>,
    pub scroll_offset: f64,
    pub title: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBookmark {
    pub book_id: String,
    pub chapter_id: Option<String>,
    pub scroll_offset: Option<f64>,
    pub title: Option<String>,
}

#[tauri::command]
pub fn get_bookmarks(
    db: State<'_, DbConn>,
    book_id: String,
) -> Result<Vec<Bookmark>, String> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare(
            "SELECT id, book_id, chapter_id, scroll_offset, title, created_at
             FROM bookmarks WHERE book_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![book_id], |row| {
            Ok(Bookmark {
                id: row.get(0)?,
                book_id: row.get(1)?,
                chapter_id: row.get(2)?,
                scroll_offset: row.get(3)?,
                title: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn create_bookmark(
    db: State<'_, DbConn>,
    bookmark: CreateBookmark,
) -> Result<Bookmark, String> {
    let conn = db.conn.lock();
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let scroll_offset = bookmark.scroll_offset.unwrap_or(0.0);

    conn.execute(
        "INSERT INTO bookmarks (id, book_id, chapter_id, scroll_offset, title, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            bookmark.book_id,
            bookmark.chapter_id,
            scroll_offset,
            bookmark.title,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Bookmark {
        id,
        book_id: bookmark.book_id,
        chapter_id: bookmark.chapter_id,
        scroll_offset,
        title: bookmark.title,
        created_at: now,
    })
}

#[tauri::command]
pub fn delete_bookmark(db: State<'_, DbConn>, id: String) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_bookmark(
    db: State<'_, DbConn>,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute(
        "UPDATE bookmarks SET title = ?1 WHERE id = ?2",
        params![title, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
