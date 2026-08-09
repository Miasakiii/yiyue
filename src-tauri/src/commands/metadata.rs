//! 元数据自动抓取（PLAN 3.1）：
//! Open Library API（免费无 key）查询书名/作者/简介，下载封面存 `library/covers/`。
//! 所有网络失败静默降级（返回 enriched=false 或 None），不阻塞导入流程。

use crate::db::DbConn;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

const SETTING_KEY: &str = "metadata_auto_enrich";

#[derive(Debug, Serialize)]
pub struct MetadataResult {
    pub enriched: bool,
    pub author: Option<String>,
    pub description: Option<String>,
    pub cover_downloaded: bool,
}

fn get_library_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::Internal("Failed to resolve app data dir".to_string()))?;
    Ok(data_dir.join("library"))
}

fn cover_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = get_library_dir(app)?.join("covers");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Open Library 搜索：按书名（+作者）查第一条结果。
/// search.json 免费无 key：https://openlibrary.org/dev/docs/api/search
async fn query_open_library(
    title: &str,
    author: Option<&str>,
) -> AppResult<Option<serde_json::Value>> {
    let mut q = format!("title:{}", title);
    if let Some(a) = author {
        if !a.is_empty() && a != "未知作者" {
            q.push_str(&format!(" author:{}", a));
        }
    }
    let url = format!(
        "https://openlibrary.org/search.json?q={}&fields=title,author_name,key,cover_i&limit=1",
        urlencoding::encode(&q)
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Failed to parse response: {}", e)))?;
    Ok(json["docs"].as_array().and_then(|a| a.first()).cloned())
}

/// Open Library works API：按 /works/OLxxxW 查简介（失败忽略）。
async fn query_work_description(work_key: &str) -> Option<String> {
    let url = format!("https://openlibrary.org{}.json", work_key);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;
    let resp = client.get(&url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: serde_json::Value = resp.json().await.ok()?;
    match &json["description"] {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(o) => o.get("value").and_then(|v| v.as_str()).map(|s| s.to_string()),
        _ => None,
    }
}

/// 下载封面到 `library/covers/{book_id}.jpg`（Open Library covers CDN，-L 大图）。
async fn download_cover(
    app: &AppHandle,
    book_id: &str,
    cover_i: i64,
) -> AppResult<Option<String>> {
    let url = format!("https://covers.openlibrary.org/b/id/{}-L.jpg", cover_i);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Network(format!("Failed to read cover: {}", e)))?;
    let path = cover_dir(app)?.join(format!("{}.jpg", book_id));
    fs::write(&path, &bytes)?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// 核心逻辑：查询并更新一本书的元数据（命令与自动触发共用）。
/// 注意：rusqlite::Connection 非 Sync，锁 guard 不得跨 await——每次锁内读写
/// 均在独立块中完成，网络 await 期间不持锁。
pub async fn enrich_impl(
    app: &AppHandle,
    conn: &parking_lot::Mutex<Connection>,
    book_id: &str,
    fetch_cover: bool,
) -> AppResult<MetadataResult> {
    let (title, author) = {
        let conn = conn.lock();
        conn.query_row(
            "SELECT title, author FROM books WHERE id = ?1",
            params![book_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(AppError::Sqlite)?
    };

    // 网络失败/未找到均静默降级（不向上抛错，避免前端报错打扰）
    let Ok(Some(info)) = query_open_library(&title, author.as_deref()).await else {
        return Ok(MetadataResult {
            enriched: false,
            author: None,
            description: None,
            cover_downloaded: false,
        });
    };

    let new_author = info["author_name"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    // 简介来自 works API（可选请求，失败忽略）
    let description = if let Some(k) = info["key"].as_str() {
        query_work_description(k).await
    } else {
        None
    };
    let cover_i = info["cover_i"].as_i64();

    let mut cover_downloaded = false;
    let mut cover_path = None;
    if fetch_cover {
        if let Some(ci) = cover_i {
            if let Ok(Some(p)) = download_cover(app, book_id, ci).await {
                cover_path = Some(p);
                cover_downloaded = true;
            }
        }
    }

    {
        let conn = conn.lock();
        match cover_path {
            Some(cp) => conn
                .execute(
                    "UPDATE books SET author = COALESCE(?1, author),
                            description = COALESCE(?2, description),
                            cover_path = COALESCE(?3, cover_path),
                            updated_at = datetime('now')
                     WHERE id = ?4",
                    params![new_author, description, cp, book_id],
                )
                .map_err(AppError::Sqlite)?,
            None => conn
                .execute(
                    "UPDATE books SET author = COALESCE(?1, author),
                            description = COALESCE(?2, description),
                            updated_at = datetime('now')
                     WHERE id = ?3",
                    params![new_author, description, book_id],
                )
                .map_err(AppError::Sqlite)?,
        };
    }

    Ok(MetadataResult {
        enriched: true,
        author: new_author,
        description,
        cover_downloaded,
    })
}

/// 导入后自动触发（不阻塞导入；受设置开关控制；失败静默）。
pub async fn enrich_auto(app: AppHandle, conn: Arc<parking_lot::Mutex<Connection>>, book_id: &str) {
    let enabled = {
        let conn = conn.lock();
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![SETTING_KEY],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
            == Some("1".to_string())
    };
    if !enabled {
        return;
    }
    let _ = enrich_impl(&app, &conn, book_id, true).await;
}

/// IPC：为单本书抓取元数据（书库页手动触发）。
#[tauri::command(async)]
pub async fn enrich_book_metadata(
    app: AppHandle,
    db: State<'_, DbConn>,
    book_id: String,
    fetch_cover: bool,
) -> AppResult<MetadataResult> {
    enrich_impl(&app, &db.conn, &book_id, fetch_cover).await
}

/// IPC：读取自动抓取开关。
#[tauri::command]
pub fn get_metadata_setting(db: State<'_, DbConn>) -> AppResult<bool> {
    let conn = db.conn.lock();
    let v: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![SETTING_KEY],
            |r| r.get(0),
        )
        .optional()
        .map_err(AppError::Sqlite)?;
    Ok(v.as_deref() == Some("1"))
}

/// IPC：保存自动抓取开关。
#[tauri::command]
pub fn save_metadata_setting(db: State<'_, DbConn>, enabled: bool) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![SETTING_KEY, if enabled { "1" } else { "0" }],
    )
    .map_err(AppError::Sqlite)?;
    Ok(())
}
