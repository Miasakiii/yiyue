//! 成就/阅读里程碑系统（PLAN 3.2）：
//! 基于 reading_sessions / annotations / bookmarks / books 等本地数据计算解锁状态，
//! 解锁记录持久化到 achievements 表。纯本地计算，无外部依赖。

use crate::db::DbConn;
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct Achievement {
    pub key: String,
    pub name: String,
    pub description: String,
    /// lucide 图标名（前端映射）
    pub icon: String,
    pub unlocked_at: Option<String>,
}

struct Def {
    key: &'static str,
    name: &'static str,
    desc: &'static str,
    icon: &'static str,
}

const DEFS: &[Def] = &[
    Def { key: "first_finish", name: "初次读完", desc: "读完第一本书", icon: "BookCheck" },
    Def { key: "finish_10", name: "十卷在手", desc: "累计读完 10 本书", icon: "Library" },
    Def { key: "first_highlight", name: "灵光一现", desc: "写下第一条划线笔记", icon: "Highlighter" },
    Def { key: "highlights_100", name: "批注满篇", desc: "累计 100 条划线/笔记", icon: "StickyNote" },
    Def { key: "first_bookmark", name: "标记时刻", desc: "添加第一个书签", icon: "Bookmark" },
    Def { key: "hours_10", name: "阅读新手", desc: "累计阅读 10 小时", icon: "Clock" },
    Def { key: "hours_50", name: "阅读达人", desc: "累计阅读 50 小时", icon: "Hourglass" },
    Def { key: "hours_200", name: "阅读大师", desc: "累计阅读 200 小时", icon: "Medal" },
    Def { key: "streak_7", name: "一周不辍", desc: "连续阅读 7 天", icon: "Flame" },
    Def { key: "streak_30", name: "月读如常", desc: "连续阅读 30 天", icon: "Crown" },
    Def { key: "chars_100w", name: "百万字征程", desc: "累计阅读 100 万字", icon: "BookOpenText" },
    Def { key: "sessions_100", name: "百次开卷", desc: "累计 100 次阅读", icon: "Repeat" },
    Def { key: "library_20", name: "藏书渐丰", desc: "书库藏书 20 本", icon: "LibraryBig" },
    Def { key: "library_100", name: "图书馆长", desc: "书库藏书 100 本", icon: "Landmark" },
    Def { key: "comic_fan", name: "漫画时光", desc: "读过一部漫画", icon: "Image" },
];

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0)
}

/// 计算当前满足条件的成就 key 集合（与 stats.rs 的 date(start_time) 口径一致）。
fn compute_unlocked(conn: &Connection) -> Vec<&'static str> {
    let mut keys: Vec<&'static str> = Vec::new();

    let finished = count(
        conn,
        "SELECT COUNT(*) FROM reading_progress WHERE percentage >= 100",
    );
    let highlights = count(conn, "SELECT COUNT(*) FROM annotations");
    let bookmarks = count(conn, "SELECT COUNT(*) FROM bookmarks");
    let hours = count(conn, "SELECT COALESCE(SUM(duration_ms), 0) FROM reading_sessions") / 3_600_000;
    let chars = count(conn, "SELECT COALESCE(SUM(chars_read), 0) FROM reading_sessions");
    let sessions = count(conn, "SELECT COUNT(*) FROM reading_sessions");
    let library = count(conn, "SELECT COUNT(*) FROM books WHERE deleted_at IS NULL");
    let comic = count(
        conn,
        "SELECT COUNT(*) FROM reading_progress rp JOIN books b ON b.id = rp.book_id
         WHERE b.kind = 'comic' AND rp.percentage > 0",
    );

    // 连续阅读天数（复用 stats 的 date() 口径与 streak 算法）
    let mut stmt = conn
        .prepare("SELECT DISTINCT date(start_time) AS d FROM reading_sessions ORDER BY d DESC")
        .ok();
    let dates: Vec<String> = stmt
        .as_mut()
        .and_then(|s| s.query_map([], |row| row.get(0)).ok())
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();
    let (_, longest_streak) = crate::commands::stats::calculate_streaks(&dates);

    if finished >= 1 { keys.push("first_finish"); }
    if finished >= 10 { keys.push("finish_10"); }
    if highlights >= 1 { keys.push("first_highlight"); }
    if highlights >= 100 { keys.push("highlights_100"); }
    if bookmarks >= 1 { keys.push("first_bookmark"); }
    if hours >= 10 { keys.push("hours_10"); }
    if hours >= 50 { keys.push("hours_50"); }
    if hours >= 200 { keys.push("hours_200"); }
    if longest_streak >= 7 { keys.push("streak_7"); }
    if longest_streak >= 30 { keys.push("streak_30"); }
    if chars >= 1_000_000 { keys.push("chars_100w"); }
    if sessions >= 100 { keys.push("sessions_100"); }
    if library >= 20 { keys.push("library_20"); }
    if library >= 100 { keys.push("library_100"); }
    if comic >= 1 { keys.push("comic_fan"); }

    keys
}

fn def_to_achievement(def: &Def, unlocked_at: Option<String>) -> Achievement {
    Achievement {
        key: def.key.to_string(),
        name: def.name.to_string(),
        description: def.desc.to_string(),
        icon: def.icon.to_string(),
        unlocked_at,
    }
}

/// IPC：全部成就 + 解锁状态（统计页展示）。
#[tauri::command]
pub fn get_achievements(db: State<'_, DbConn>) -> AppResult<Vec<Achievement>> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT key, unlocked_at FROM achievements")
        .map_err(crate::error::AppError::Sqlite)?;
    let unlocked: std::collections::HashMap<String, String> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(crate::error::AppError::Sqlite)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(DEFS
        .iter()
        .map(|d| def_to_achievement(d, unlocked.get(d.key).cloned()))
        .collect())
}

/// IPC：检查成就，返回【新解锁】的成就（并持久化）。
/// 前端在阅读 session 记录后与统计页加载时调用；无新解锁时返回空数组。
#[tauri::command]
pub fn check_achievements(db: State<'_, DbConn>) -> AppResult<Vec<Achievement>> {
    let conn = db.conn.lock();
    let newly = compute_unlocked(&conn);
    let mut result = Vec::new();
    for key in newly {
        let existing: Option<String> = conn
            .query_row(
                "SELECT unlocked_at FROM achievements WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .optional()
            .map_err(crate::error::AppError::Sqlite)?;
        if existing.is_none() {
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO achievements (key, unlocked_at) VALUES (?1, ?2)",
                params![key, now],
            )
            .map_err(crate::error::AppError::Sqlite)?;
            if let Some(def) = DEFS.iter().find(|d| d.key == key) {
                result.push(def_to_achievement(def, Some(now)));
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::schema::initialize(&conn).unwrap();
        conn
    }

    #[test]
    fn none_unlocked_on_empty_library() {
        let conn = fresh_conn();
        let keys = compute_unlocked(&conn);
        assert!(keys.is_empty(), "空书库不应解锁任何成就: {:?}", keys);
    }

    #[test]
    fn first_highlight_unlocks() {
        let conn = fresh_conn();
        conn.execute(
            "INSERT INTO books (id, title, file_hash, file_path, file_size, format)
             VALUES ('b1', '测试书', 'h1', '/x', 1, 'txt')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO annotations (id, book_id, color, start_offset, end_offset)
             VALUES ('a1', 'b1', 'yellow', 0, 5)",
            [],
        )
        .unwrap();
        let keys = compute_unlocked(&conn);
        assert!(keys.contains(&"first_highlight"));
        assert!(!keys.contains(&"first_finish"));
    }

    #[test]
    fn finished_book_and_sessions_unlock() {
        let conn = fresh_conn();
        conn.execute(
            "INSERT INTO books (id, title, file_hash, file_path, file_size, format)
             VALUES ('b1', '测试书', 'h1', '/x', 1, 'txt')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO reading_progress (book_id, percentage) VALUES ('b1', 100)",
            [],
        )
        .unwrap();
        // 24 小时时长 + 100 次 session
        for i in 0..100 {
            conn.execute(
                "INSERT INTO reading_sessions (id, book_id, start_time, end_time, duration_ms, chars_read)
                 VALUES (?1, 'b1', '2026-01-01T10:00:00Z', '2026-01-01T10:15:00Z', 900000, 3000)",
                params![format!("s{}", i)],
            )
            .unwrap();
        }
        let keys = compute_unlocked(&conn);
        assert!(keys.contains(&"first_finish"), "读完书应解锁");
        assert!(keys.contains(&"hours_10"), "24 小时应解锁 hours_10");
        assert!(!keys.contains(&"hours_50"), "24 小时不应解锁 hours_50");
        assert!(keys.contains(&"sessions_100"), "100 次 session 应解锁");
    }

    #[test]
    fn check_achievements_persists_only_once() {
        let conn = fresh_conn();
        conn.execute(
            "INSERT INTO books (id, title, file_hash, file_path, file_size, format)
             VALUES ('b1', '测试书', 'h1', '/x', 1, 'txt')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO annotations (id, book_id, color, start_offset, end_offset)
             VALUES ('a1', 'b1', 'yellow', 0, 5)",
            [],
        )
        .unwrap();
        // 直接调内部逻辑两次：第二次不应重复返回
        let mut newly = Vec::new();
        for _ in 0..2 {
            for key in compute_unlocked(&conn) {
                let existing: Option<String> = conn
                    .query_row(
                        "SELECT unlocked_at FROM achievements WHERE key = ?1",
                        params![key],
                        |r| r.get(0),
                    )
                    .optional()
                    .unwrap();
                if existing.is_none() {
                    conn.execute(
                        "INSERT INTO achievements (key, unlocked_at) VALUES (?1, 'now')",
                        params![key],
                    )
                    .unwrap();
                    newly.push(key);
                }
            }
        }
        assert!(newly.contains(&"first_highlight"));
        assert_eq!(newly.len(), 1, "重复检查不应重复解锁");
    }
}
