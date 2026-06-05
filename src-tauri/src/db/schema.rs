use rusqlite::Connection;

pub fn initialize(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS books (
            id            TEXT PRIMARY KEY,
            kind          TEXT NOT NULL DEFAULT 'novel',
            title         TEXT NOT NULL,
            author        TEXT,
            file_hash     TEXT NOT NULL UNIQUE,
            file_path     TEXT NOT NULL,
            file_size     INTEGER NOT NULL,
            format        TEXT NOT NULL,
            cover_path    TEXT,
            description   TEXT,
            language      TEXT DEFAULT 'zh',
            total_chapters INTEGER,
            total_chars   INTEGER,
            metadata_json TEXT,
            reading_mode  TEXT,
            added_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at    TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id        TEXT PRIMARY KEY,
            name      TEXT NOT NULL,
            color     TEXT DEFAULT '#6B7280',
            parent_id TEXT REFERENCES tags(id),
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS book_tags (
            book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (book_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS groups (
            id        TEXT PRIMARY KEY,
            name      TEXT NOT NULL,
            parent_id TEXT REFERENCES groups(id),
            icon      TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS book_groups (
            book_id  TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (book_id, group_id)
        );

        CREATE TABLE IF NOT EXISTS favorites (
            book_id    TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
            starred_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id          TEXT PRIMARY KEY,
            book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            title       TEXT,
            level       INTEGER DEFAULT 1,
            sort_order  INTEGER NOT NULL,
            start_offset INTEGER,
            end_offset  INTEGER,
            char_count  INTEGER,
            content     TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, sort_order);

        CREATE TABLE IF NOT EXISTS reading_progress (
            book_id       TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
            chapter_id    TEXT,
            scroll_offset REAL DEFAULT 0,
            page_index    INTEGER DEFAULT 0,
            percentage    REAL DEFAULT 0,
            last_read_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id            TEXT PRIMARY KEY,
            book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            chapter_id    TEXT,
            start_offset  INTEGER NOT NULL,
            end_offset    INTEGER NOT NULL,
            selected_text TEXT,
            region_x      REAL,
            region_y      REAL,
            region_w      REAL,
            region_h      REAL,
            color         TEXT NOT NULL DEFAULT '#FFEB3B',
            type          TEXT NOT NULL DEFAULT 'highlight',
            content       TEXT,
            tags          TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at    TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id, chapter_id);

        CREATE TABLE IF NOT EXISTS rules (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            pattern     TEXT NOT NULL,
            replacement TEXT NOT NULL DEFAULT '',
            scope       TEXT NOT NULL DEFAULT 'global',
            is_regex    INTEGER NOT NULL DEFAULT 1,
            enabled     INTEGER NOT NULL DEFAULT 1,
            priority    INTEGER DEFAULT 0,
            group_id    TEXT,
            description TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rule_groups (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT,
            is_preset   INTEGER DEFAULT 0,
            enabled     INTEGER DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS reading_sessions (
            id          TEXT PRIMARY KEY,
            book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            start_time  TEXT NOT NULL,
            end_time    TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            chars_read  INTEGER DEFAULT 0,
            chapters_read INTEGER DEFAULT 0,
            pages_read  INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_book ON reading_sessions(book_id, start_time);
        CREATE INDEX IF NOT EXISTS idx_sessions_time ON reading_sessions(start_time);

        CREATE TABLE IF NOT EXISTS sync_log (
            id          TEXT PRIMARY KEY,
            table_name  TEXT NOT NULL,
            record_id   TEXT NOT NULL,
            operation   TEXT NOT NULL,
            payload     TEXT NOT NULL,
            synced      INTEGER DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reading_profiles (
            book_id       TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
            font_size     INTEGER DEFAULT 18,
            line_height   REAL DEFAULT 1.8,
            font_family   TEXT DEFAULT 'default',
            content_width TEXT DEFAULT 'medium',
            paragraph_spacing REAL DEFAULT 0.8,
            text_align    TEXT DEFAULT 'left',
            page_animation TEXT DEFAULT 'none',
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )?;

    // FTS5 virtual tables
    conn.execute_batch(
        "
        CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
            title, author, description, content='books', content_rowid='rowid'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS annotations_fts USING fts5(
            selected_text, content, tags
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS chapters_fts USING fts5(
            book_id, chapter_id, title, content
        );
        ",
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialize_creates_all_tables() {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn).unwrap();

        // Verify all core tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        let expected = [
            "annotations", "book_groups", "book_tags", "books", "chapters",
            "favorites", "groups", "reading_progress", "reading_sessions",
            "rule_groups", "rules", "settings", "sync_log", "tags",
        ];
        for table in &expected {
            assert!(tables.contains(&table.to_string()), "Missing table: {}", table);
        }
    }

    #[test]
    fn test_initialize_creates_fts_tables() {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn).unwrap();

        // Verify FTS5 virtual tables exist
        let fts_tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%fts5%'")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(fts_tables.contains(&"books_fts".to_string()));
        assert!(fts_tables.contains(&"annotations_fts".to_string()));
        assert!(fts_tables.contains(&"chapters_fts".to_string()));
    }

    #[test]
    fn test_initialize_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        // Should not fail on second call (CREATE IF NOT EXISTS)
        initialize(&conn).unwrap();
        initialize(&conn).unwrap();
    }

    #[test]
    fn test_foreign_keys_enforced() {
        let conn = Connection::open_in_memory().unwrap();
        initialize(&conn).unwrap();

        // Insert a book first
        conn.execute(
            "INSERT INTO books (id, kind, title, file_hash, file_path, file_size, format) VALUES ('b1', 'novel', 'Test', 'hash1', 'path1', 100, 'txt')",
            [],
        ).unwrap();

        // Insert chapter with valid FK should work
        conn.execute(
            "INSERT INTO chapters (id, book_id, title, sort_order) VALUES ('c1', 'b1', 'Ch1', 0)",
            [],
        ).unwrap();

        // Insert chapter with invalid FK should fail
        let result = conn.execute(
            "INSERT INTO chapters (id, book_id, title, sort_order) VALUES ('c2', 'nonexistent', 'Ch2', 1)",
            [],
        );
        assert!(result.is_err(), "Foreign key constraint should reject invalid book_id");
    }
}
