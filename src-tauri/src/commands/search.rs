use crate::db::DbConn;
use crate::search;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub result_type: String, // "book", "chapter", "annotation"
    pub id: String,
    pub book_id: Option<String>,
    pub book_title: String,
    pub chapter_id: Option<String>,
    pub chapter_title: Option<String>,
    pub matched_text: String,
    pub snippet: String,
    pub color: Option<String>,
}

/// Search across books, chapter content, and annotations.
#[tauri::command]
pub fn search_all(
    db: State<'_, DbConn>,
    query: String,
    scope: Option<String>, // "all", "books", "content", "annotations"
) -> Result<Vec<SearchResult>, String> {
    let conn = db.conn.lock();
    let scope = scope.as_deref().unwrap_or("all");
    let mut results = Vec::new();

    let tokenized = search::tokenize_query(&query);

    // Search books
    if scope == "all" || scope == "books" {
        let mut stmt = conn
            .prepare(
                "SELECT b.id, b.title, b.author, snippet(books_fts, 0, '<mark>', '</mark>', '…', 32) as snip
                 FROM books_fts
                 JOIN books b ON b.rowid = books_fts.rowid
                 WHERE books_fts MATCH ?1
                 AND b.deleted_at IS NULL
                 ORDER BY rank
                 LIMIT 20",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![tokenized], |row| {
                Ok(SearchResult {
                    result_type: "book".to_string(),
                    id: row.get(0)?,
                    book_id: None,
                    book_title: row.get(1)?,
                    chapter_id: None,
                    chapter_title: None,
                    matched_text: row.get::<_, String>(1)?,
                    snippet: row.get(3)?,
                    color: None,
                })
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            if let Ok(r) = row {
                results.push(r);
            }
        }
    }

    // Search chapter content
    if scope == "all" || scope == "content" {
        let mut stmt = conn
            .prepare(
                "SELECT f.chapter_id, f.book_id, f.title as ch_title, b.title as book_title,
                        snippet(chapters_fts, 3, '<mark>', '</mark>', '…', 32) as snip
                 FROM chapters_fts f
                 JOIN books b ON b.id = f.book_id
                 WHERE chapters_fts MATCH ?1
                 AND b.deleted_at IS NULL
                 ORDER BY rank
                 LIMIT 30",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![tokenized], |row| {
                Ok(SearchResult {
                    result_type: "content".to_string(),
                    id: row.get::<_, String>(0)?,
                    book_id: Some(row.get(1)?),
                    book_title: row.get(3)?,
                    chapter_id: Some(row.get(0)?),
                    chapter_title: row.get(2)?,
                    matched_text: String::new(),
                    snippet: row.get(4)?,
                    color: None,
                })
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            if let Ok(r) = row {
                results.push(r);
            }
        }
    }

    // Search annotations
    if scope == "all" || scope == "annotations" {
        let mut stmt = conn
            .prepare(
                "SELECT a.id, a.book_id, a.chapter_id, b.title as book_title,
                        a.selected_text, a.content, a.color,
                        snippet(annotations_fts, 0, '<mark>', '</mark>', '…', 32) as snip
                 FROM annotations_fts
                 JOIN annotations a ON a.rowid = annotations_fts.rowid
                 JOIN books b ON b.id = a.book_id
                 WHERE annotations_fts MATCH ?1
                 AND a.deleted_at IS NULL
                 AND b.deleted_at IS NULL
                 ORDER BY rank
                 LIMIT 30",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![tokenized], |row| {
                let selected_text: Option<String> = row.get(4)?;
                Ok(SearchResult {
                    result_type: "annotation".to_string(),
                    id: row.get(0)?,
                    book_id: Some(row.get(1)?),
                    book_title: row.get(3)?,
                    chapter_id: row.get(2)?,
                    chapter_title: None,
                    matched_text: selected_text.unwrap_or_default(),
                    snippet: row.get(7)?,
                    color: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            if let Ok(r) = row {
                results.push(r);
            }
        }
    }

    Ok(results)
}

/// Index a chapter into the FTS5 table (called during import).
pub fn index_chapter(
    conn: &rusqlite::Connection,
    book_id: &str,
    chapter_id: &str,
    title: Option<&str>,
    content: &str,
) -> Result<(), String> {
    let tokenized_title = title.map(|t| search::tokenize(t));
    let tokenized_content = search::tokenize(content);

    conn.execute(
        "INSERT INTO chapters_fts (book_id, chapter_id, title, content) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            book_id,
            chapter_id,
            tokenized_title.as_deref().unwrap_or(""),
            tokenized_content
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Remove a book's chapters from the FTS5 index.
pub fn remove_book_from_index(
    conn: &rusqlite::Connection,
    book_id: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM chapters_fts WHERE book_id = ?1",
        rusqlite::params![book_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
