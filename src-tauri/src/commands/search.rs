use crate::error::AppResult;
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
/// Supports pinyin search: when the query is ASCII-only, it falls back to
/// matching against the `pinyin_title` / `pinyin_content` columns populated
/// during import.
#[tauri::command]
pub fn search_all(
    db: State<'_, DbConn>,
    query: String,
    scope: Option<String>, // "all", "books", "content", "annotations"
) -> AppResult<Vec<SearchResult>> {
    let conn = db.conn.lock();
    let scope = scope.as_deref().unwrap_or("all");
    let mut results = Vec::new();

    let tokenized = search::tokenize_query(&query);
    let is_pinyin = search::is_pinyin_query(&query);

    if is_pinyin {
        // Pinyin mode: search in pinyin columns via LIKE
        if scope == "all" || scope == "books" {
            search_pinyin_books(&conn, &query, &mut results)?;
        }
        if scope == "all" || scope == "content" {
            search_pinyin_chapters(&conn, &query, &mut results)?;
        }
        // Annotations are not pinyin-indexed; fall back to FTS5 for mixed queries
        if scope == "all" || scope == "annotations" {
            search_fts_annotations(&conn, &tokenized, &mut results)?;
        }
    } else {
        // Default FTS5 search
        search_fts_books(&conn, &tokenized, scope, &mut results)?;
        search_fts_chapters(&conn, &tokenized, scope, &mut results)?;
        search_fts_annotations(&conn, &tokenized, &mut results)?;
    }

    Ok(results)
}

// ---- FTS5 search helpers ----

fn search_fts_books(
    conn: &rusqlite::Connection,
    tokenized: &str,
    scope: &str,
    results: &mut Vec<SearchResult>,
) -> AppResult<()> {
    if scope != "all" && scope != "books" {
        return Ok(());
    }
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
        ?;

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
        ?;

    for row in rows {
        if let Ok(r) = row {
            results.push(r);
        }
    }
    Ok(())
}

fn search_fts_chapters(
    conn: &rusqlite::Connection,
    tokenized: &str,
    scope: &str,
    results: &mut Vec<SearchResult>,
) -> AppResult<()> {
    if scope != "all" && scope != "content" {
        return Ok(());
    }
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
        ?;

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
        ?;

    for row in rows {
        if let Ok(r) = row {
            results.push(r);
        }
    }
    Ok(())
}

fn search_fts_annotations(
    conn: &rusqlite::Connection,
    tokenized: &str,
    results: &mut Vec<SearchResult>,
) -> AppResult<()> {
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
        ?;

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
        ?;

    for row in rows {
        if let Ok(r) = row {
            results.push(r);
        }
    }
    Ok(())
}

// ---- Pinyin search helpers ----

fn search_pinyin_books(
    conn: &rusqlite::Connection,
    query: &str,
    results: &mut Vec<SearchResult>,
) -> AppResult<()> {
    let like = format!("%{}%", query.replace(" ", ""));
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.title, b.author, b.pinyin_title
             FROM books b
             WHERE b.deleted_at IS NULL
             AND (b.pinyin_title LIKE ?1)
             ORDER BY b.updated_at DESC
             LIMIT 20",
        )
        ?;

    let rows = stmt
        .query_map(rusqlite::params![like], |row| {
            Ok(SearchResult {
                result_type: "book".to_string(),
                id: row.get(0)?,
                book_id: None,
                book_title: row.get(1)?,
                chapter_id: None,
                chapter_title: None,
                matched_text: row.get::<_, String>(1)?,
                snippet: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                color: None,
            })
        })
        ?;

    for row in rows {
        if let Ok(r) = row {
            results.push(r);
        }
    }
    Ok(())
}

fn search_pinyin_chapters(
    conn: &rusqlite::Connection,
    query: &str,
    results: &mut Vec<SearchResult>,
) -> AppResult<()> {
    let like = format!("%{}%", query.replace(" ", ""));
    let mut stmt = conn
        .prepare(
            "SELECT f.chapter_id, f.book_id, f.title as ch_title, b.title as book_title, f.pinyin_title
             FROM chapters f
             JOIN books b ON b.id = f.book_id
             WHERE b.deleted_at IS NULL
             AND (f.pinyin_title LIKE ?1 OR f.pinyin_content LIKE ?2)
             ORDER BY f.sort_order
             LIMIT 30",
        )
        ?;

    let rows = stmt
        .query_map(rusqlite::params![like, like], |row| {
            Ok(SearchResult {
                result_type: "content".to_string(),
                id: row.get::<_, String>(0)?,
                book_id: Some(row.get(1)?),
                book_title: row.get(3)?,
                chapter_id: Some(row.get(0)?),
                chapter_title: row.get(2)?,
                matched_text: String::new(),
                snippet: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                color: None,
            })
        })
        ?;

    for row in rows {
        if let Ok(r) = row {
            results.push(r);
        }
    }
    Ok(())
}

/// Index a chapter into the FTS5 table (called during import).
pub fn index_chapter(
    conn: &rusqlite::Connection,
    book_id: &str,
    chapter_id: &str,
    title: Option<&str>,
    content: &str,
) -> AppResult<()> {
    let tokenized_title = title.map(|t| search::tokenize(t));
    let tokenized_content = search::tokenize(content);
    let pinyin_title = title.map(|t| search::to_pinyin_abbr(t)).unwrap_or_default();
    let pinyin_content = search::to_pinyin_abbr(content);

    conn.execute(
        "INSERT INTO chapters_fts (book_id, chapter_id, title, content) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            book_id,
            chapter_id,
            tokenized_title.as_deref().unwrap_or(""),
            tokenized_content
        ],
    )
    ?;

    // Store pinyin search text in the chapters table
    conn.execute(
        "UPDATE chapters SET pinyin_title = ?1, pinyin_content = ?2 WHERE id = ?3",
        rusqlite::params![pinyin_title, pinyin_content, chapter_id],
    )
    ?;

    Ok(())
}

/// Remove a book's chapters from the FTS5 index.
pub fn remove_book_from_index(
    conn: &rusqlite::Connection,
    book_id: &str,
) -> AppResult<()> {
    conn.execute(
        "DELETE FROM chapters_fts WHERE book_id = ?1",
        rusqlite::params![book_id],
    )
    ?;

    Ok(())
}
