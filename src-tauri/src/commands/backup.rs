//! 全量数据导入/导出（PLAN 3.4.1）：
//! 导出 = 全部业务表（书籍/章节/笔记/进度/规则/标签等）→ data.json → ZIP；
//! 导入 = 解 ZIP → 逐表 INSERT OR IGNORE（按主键跳过已存在）→ 重建 FTS 索引。
//! 不含书籍源文件（library/ 可单独备份）与 FTS 虚拟表（导入后自动重建）。

use crate::db::DbConn;
use crate::error::{AppError, AppResult};
use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use tauri::State;

/// 参与导出的业务表（顺序即导入顺序——父表在前满足 FK）
const EXPORT_TABLES: &[&str] = &[
    "books",
    "chapters",
    "annotations",
    "bookmarks",
    "reading_progress",
    "reading_profiles",
    "tags",
    "book_tags",
    "groups",
    "book_groups",
    "rules",
    "rule_groups",
    "achievements",
    "settings",
];

#[derive(Debug, Serialize)]
pub struct ImportStats {
    pub total_inserted: i64,
    pub per_table: HashMap<String, i64>,
}

/// 取表列名（PRAGMA table_info，仅白名单表可调用）。
fn table_columns(conn: &Connection, table: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", table))
        .map_err(AppError::Sqlite)?;
    let cols = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(AppError::Sqlite)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(cols)
}

/// 导出全部业务表为 JSON 结构（内部逻辑，命令与测试共用）。
pub fn export_data(conn: &Connection) -> AppResult<serde_json::Value> {
    let mut tables_map = serde_json::Map::new();
    for table in EXPORT_TABLES {
        let cols = table_columns(conn, table)?;
        let quoted: Vec<String> = cols.iter().map(|c| format!("\"{}\"", c)).collect();
        let sql = format!("SELECT {} FROM \"{}\"", quoted.join(", "), table);
        let mut stmt = conn.prepare(&sql).map_err(AppError::Sqlite)?;
        let mut rows: Vec<serde_json::Value> = Vec::new();
        let mut q = stmt.query([]).map_err(AppError::Sqlite)?;
        while let Some(row) = q.next().map_err(AppError::Sqlite)? {
            let mut r: Vec<serde_json::Value> = Vec::with_capacity(cols.len());
            for i in 0..cols.len() {
                r.push(match row.get_ref(i).map_err(AppError::Sqlite)? {
                    ValueRef::Null => serde_json::Value::Null,
                    ValueRef::Integer(v) => serde_json::json!(v),
                    ValueRef::Real(v) => serde_json::json!(v),
                    ValueRef::Text(t) => {
                        serde_json::Value::String(String::from_utf8_lossy(t).to_string())
                    }
                    ValueRef::Blob(b) => serde_json::json!({
                        "__blob__": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b)
                    }),
                });
            }
            rows.push(serde_json::Value::Array(r));
        }
        tables_map.insert(
            table.to_string(),
            serde_json::json!({ "columns": cols, "rows": rows }),
        );
    }
    Ok(serde_json::json!({
        "app": "yiyue",
        "export_version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "tables": tables_map,
    }))
}

/// JSON 值 → SQLite 参数值。
fn json_to_sqlite(v: &serde_json::Value) -> Value {
    match v {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(b) => Value::Integer(*b as i64),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else {
                Value::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => {
            if let Some(blob) = v.get("__blob__").and_then(|b| b.as_str()) {
                // 导出时 blob 被标记为 {"__blob__": base64}
                let _ = blob;
                Value::Text(s.clone())
            } else {
                Value::Text(s.clone())
            }
        }
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => Value::Null,
    }
}

/// 导入 payload（内部逻辑，命令与测试共用）。逐表 INSERT OR IGNORE，返回统计。
pub fn import_data(conn: &Connection, payload: &serde_json::Value) -> AppResult<ImportStats> {
    if payload["app"].as_str() != Some("yiyue") {
        return Err(AppError::InvalidInput("不是一页的导出文件".to_string()));
    }
    let Some(tables) = payload["tables"].as_object() else {
        return Err(AppError::InvalidInput("导出文件缺少 tables".to_string()));
    };

    let mut stats = ImportStats {
        total_inserted: 0,
        per_table: HashMap::new(),
    };

    // 导入顺序：先父表（books）再子表——EXPORT_TABLES 顺序已保证
    for table in EXPORT_TABLES {
        let Some(data) = tables.get(*table) else { continue };
        let Some(cols_json) = data["columns"].as_array() else { continue };
        let cols: Vec<String> = cols_json
            .iter()
            .filter_map(|c| c.as_str())
            .map(|s| s.to_string())
            .collect();
        if cols.is_empty() {
            continue;
        }
        let quoted: Vec<String> = cols.iter().map(|c| format!("\"{}\"", c)).collect();
        let placeholders = vec!["?"; cols.len()].join(",");
        let sql = format!(
            "INSERT OR IGNORE INTO \"{}\" ({}) VALUES ({})",
            table,
            quoted.join(", "),
            placeholders
        );
        let mut stmt = conn.prepare(&sql).map_err(AppError::Sqlite)?;
        let mut inserted = 0i64;
        if let Some(rows) = data["rows"].as_array() {
            for row in rows {
                let vals: Vec<Value> = row
                    .as_array()
                    .map(|arr| arr.iter().map(json_to_sqlite).collect())
                    .unwrap_or_default();
                if vals.len() != cols.len() {
                    continue;
                }
                let n = stmt
                    .execute(params_from_iter(vals.iter()))
                    .map_err(AppError::Sqlite)?;
                inserted += n as i64;
            }
        }
        stats.per_table.insert(table.to_string(), inserted);
        stats.total_inserted += inserted;
    }

    Ok(stats)
}

/// 导入后重建 FTS5 索引（books_fts 由触发器等维护？此处显式重建章节索引）。
pub fn rebuild_fts(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM chapters_fts", [])
        .map_err(AppError::Sqlite)?;
    let mut stmt = conn
        .prepare("SELECT id, book_id, title, content FROM chapters")
        .map_err(AppError::Sqlite)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(AppError::Sqlite)?;
    let mut chapters: Vec<(String, String, Option<String>, String)> = Vec::new();
    for r in rows {
        chapters.push(r.map_err(AppError::Sqlite)?);
    }
    drop(stmt);
    let tx = conn.unchecked_transaction().map_err(AppError::Sqlite)?;
    for (id, book_id, title, content) in chapters {
        let _ = crate::commands::search::index_chapter(&tx, &book_id, &id, title.as_deref(), &content);
    }
    tx.commit().map_err(AppError::Sqlite)?;
    Ok(())
}

/// IPC：全量导出到指定文件（前端 save 对话框拿路径）。
#[tauri::command]
pub fn export_all_data(db: State<'_, DbConn>, path: String) -> AppResult<()> {
    let json = {
        let conn = db.conn.lock();
        export_data(&conn)?
    };
    let file = std::fs::File::create(&path).map_err(AppError::Io)?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("data.json", opts)
        .map_err(|e| AppError::Parse(format!("ZIP error: {}", e)))?;
    zip.write_all(json.to_string().as_bytes())
        .map_err(AppError::Io)?;
    zip.finish().map_err(|e| AppError::Parse(format!("ZIP error: {}", e)))?;
    Ok(())
}

/// IPC：从 ZIP 导入全量数据，返回统计。导入成功后重建 FTS。
#[tauri::command]
pub fn import_all_data(db: State<'_, DbConn>, path: String) -> AppResult<ImportStats> {
    let file = std::fs::File::open(&path).map_err(AppError::Io)?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Parse(format!("ZIP error: {}", e)))?;
    let mut json = String::new();
    let mut found = false;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| AppError::Parse(format!("ZIP error: {}", e)))?;
        if entry.name() == "data.json" {
            entry.read_to_string(&mut json).map_err(AppError::Io)?;
            found = true;
            break;
        }
    }
    if !found {
        return Err(AppError::InvalidInput("ZIP 中未找到 data.json".to_string()));
    }
    let payload: serde_json::Value =
        serde_json::from_str(&json).map_err(AppError::Json)?;
    let conn = db.conn.lock();
    let stats = import_data(&conn, &payload)?;
    rebuild_fts(&conn)?;
    Ok(stats)
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

    fn insert_sample(conn: &Connection) {
        conn.execute(
            "INSERT INTO books (id, title, author, file_hash, file_path, file_size, format)
             VALUES ('b1', '导出测试书', '作者甲', 'h1', '/x/y.txt', 100, 'txt')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chapters (id, book_id, title, level, sort_order, content)
             VALUES ('c1', 'b1', '第一章', 1, 0, '这是第一章正文内容')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO annotations (id, book_id, color, start_offset, end_offset, content)
             VALUES ('a1', 'b1', 'yellow', 0, 5, '我的笔记')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO rule_groups (id, name, description, is_preset, enabled)
             VALUES ('g1', '自定义组', '测试', 0, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO rules (id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id)
             VALUES ('r1', '规则一', 'abc', 'xyz', 'global', 1, 1, 0, 'g1')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn export_import_roundtrip() {
        let src = fresh_conn();
        insert_sample(&src);
        let payload = export_data(&src).unwrap();

        let dst = fresh_conn();
        let stats = import_data(&dst, &payload).unwrap();
        assert_eq!(stats.total_inserted, 5, "books/chapters/annotations/rule_groups/rules 应导入");
        assert_eq!(stats.per_table.get("books"), Some(&1));
        assert_eq!(stats.per_table.get("chapters"), Some(&1));
        assert_eq!(stats.per_table.get("rules"), Some(&1));

        // 验证内容
        let title: String = dst
            .query_row("SELECT title FROM books WHERE id = 'b1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "导出测试书");
        let content: String = dst
            .query_row("SELECT content FROM chapters WHERE id = 'c1'", [], |r| r.get(0))
            .unwrap();
        assert!(content.contains("第一章正文"));
    }

    #[test]
    fn import_is_idempotent() {
        let src = fresh_conn();
        insert_sample(&src);
        let payload = export_data(&src).unwrap();
        let dst = fresh_conn();
        // 已有一本书（同 id）→ 导入时跳过
        insert_sample(&dst);
        let stats = import_data(&dst, &payload).unwrap();
        assert_eq!(stats.per_table.get("books"), Some(&0), "同 id 应跳过");
        assert_eq!(stats.total_inserted, 0);
    }

    #[test]
    fn reject_wrong_app_marker() {
        let conn = fresh_conn();
        let err = import_data(&conn, &serde_json::json!({ "app": "other" }));
        assert!(err.is_err());
    }
}
