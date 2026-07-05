use crate::db::DbConn;
use crate::sync::{SyncStatus, WebDavClient, WebDavConfig};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncPayload {
    pub reading_progress: Vec<serde_json::Value>,
    pub annotations: Vec<serde_json::Value>,
    pub tags: Vec<serde_json::Value>,
    pub groups: Vec<serde_json::Value>,
    pub rules: Vec<serde_json::Value>,
    pub timestamp: String,
}

/// Get WebDAV config from settings. Password is fetched from the OS keyring.
#[tauri::command]
pub fn get_webdav_config(db: State<'_, DbConn>) -> Result<WebDavConfig, String> {
    let conn = db.conn.lock();

    let config_json: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webdav_config'",
            [],
            |row| row.get(0),
        )
        .ok();

    let mut config = if let Some(json) = config_json {
        serde_json::from_str::<WebDavConfig>(&json).map_err(|e| e.to_string())?
    } else {
        WebDavConfig::default()
    };

    // Retrieve password from OS keyring
    if !config.username.is_empty() {
        config.password = crate::sync::retrieve_webdav_password(&config.username)
            .unwrap_or_default();
    }

    Ok(config)
}

/// Save WebDAV config to settings. Password is stored in the OS keyring,
/// never written to the database in plaintext.
#[tauri::command]
pub fn save_webdav_config(db: State<'_, DbConn>, config: WebDavConfig) -> Result<(), String> {
    let conn = db.conn.lock();

    // Store password in OS keyring
    if !config.username.is_empty() && !config.password.is_empty() {
        crate::sync::store_webdav_password(&config.username, &config.password)?;
    }

    // Serialize WITHOUT password (skipped via #[serde(skip)])
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('webdav_config', ?1)",
        params![json],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Test WebDAV connection.
#[tauri::command]
pub fn test_webdav_connection(config: WebDavConfig) -> Result<(), String> {
    let client = WebDavClient::new(config);
    client.test_connection()
}

/// Push local changes to WebDAV server.
#[tauri::command]
pub fn sync_push(db: State<'_, DbConn>) -> Result<SyncStatus, String> {
    let config = get_webdav_config_inner(&db)?;
    let client = WebDavClient::new(config);

    // Ensure remote directory exists
    client.mkdir("")?;

    // Export current data
    let payload = export_sync_data(&db)?;

    // Upload sync file
    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    client.put("sync_data.json", json.as_bytes())?;

    // Update sync log
    let conn = db.conn.lock();
    conn.execute(
        "UPDATE sync_log SET synced = 1 WHERE synced = 0",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Update last sync time
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', ?1)",
        params![now],
    )
    .map_err(|e| e.to_string())?;

    Ok(SyncStatus {
        last_sync: Some(now),
        pending_changes: 0,
        is_syncing: false,
        error: None,
    })
}

/// Pull remote changes from WebDAV server.
#[tauri::command]
pub fn sync_pull(db: State<'_, DbConn>) -> Result<SyncStatus, String> {
    let config = get_webdav_config_inner(&db)?;
    let client = WebDavClient::new(config);

    // Download sync file
    let data = client.get("sync_data.json")?;
    let payload: SyncPayload = serde_json::from_slice(&data).map_err(|e| e.to_string())?;

    // Apply remote changes
    import_sync_data(&db, &payload)?;

    // Update last sync time
    let conn = db.conn.lock();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', ?1)",
        params![now],
    )
    .map_err(|e| e.to_string())?;

    Ok(SyncStatus {
        last_sync: Some(now),
        pending_changes: 0,
        is_syncing: false,
        error: None,
    })
}

/// Full sync: push then pull.
#[tauri::command]
pub fn sync_full(db: State<'_, DbConn>) -> Result<SyncStatus, String> {
    sync_push_inner(&db)?;
    sync_pull_inner(&db)?;

    let conn = db.conn.lock();
    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_log WHERE synced = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(SyncStatus {
        last_sync,
        pending_changes: pending,
        is_syncing: false,
        error: None,
    })
}

/// Get sync status.
#[tauri::command]
pub fn get_sync_status(db: State<'_, DbConn>) -> Result<SyncStatus, String> {
    let conn = db.conn.lock();

    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_log WHERE synced = 0",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(SyncStatus {
        last_sync,
        pending_changes: pending,
        is_syncing: false,
        error: None,
    })
}

// Helper functions

fn get_webdav_config_inner(db: &State<'_, DbConn>) -> Result<WebDavConfig, String> {
    let conn = db.conn.lock();

    let config_json: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webdav_config'",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(json) = config_json {
        let mut config: WebDavConfig =
            serde_json::from_str(&json).map_err(|e| e.to_string())?;
        if !config.username.is_empty() {
            config.password = crate::sync::retrieve_webdav_password(&config.username)
                .unwrap_or_default();
        }
        Ok(config)
    } else {
        Err("WebDAV not configured".to_string())
    }
}

fn export_sync_data(db: &State<'_, DbConn>) -> Result<SyncPayload, String> {
    let conn = db.conn.lock();

    // Export reading progress
    let mut stmt = conn
        .prepare("SELECT * FROM reading_progress")
        .map_err(|e| e.to_string())?;
    let progress: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "book_id": row.get::<_, String>(0)?,
                "chapter_id": row.get::<_, Option<String>>(1)?,
                "scroll_offset": row.get::<_, f64>(2)?,
                "page_index": row.get::<_, i64>(3)?,
                "percentage": row.get::<_, f64>(4)?,
                "last_read_at": row.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Export annotations
    let mut stmt = conn
        .prepare("SELECT * FROM annotations WHERE deleted_at IS NULL")
        .map_err(|e| e.to_string())?;
    let annotations: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "book_id": row.get::<_, String>(1)?,
                "chapter_id": row.get::<_, Option<String>>(2)?,
                "start_offset": row.get::<_, i64>(3)?,
                "end_offset": row.get::<_, i64>(4)?,
                "selected_text": row.get::<_, Option<String>>(5)?,
                "color": row.get::<_, String>(10)?,
                "type": row.get::<_, String>(11)?,
                "content": row.get::<_, Option<String>>(12)?,
                "tags": row.get::<_, Option<String>>(13)?,
                "created_at": row.get::<_, String>(14)?,
                "updated_at": row.get::<_, String>(15)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Export tags
    let mut stmt = conn
        .prepare("SELECT * FROM tags")
        .map_err(|e| e.to_string())?;
    let tags: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "color": row.get::<_, String>(2)?,
                "parent_id": row.get::<_, Option<String>>(3)?,
                "sort_order": row.get::<_, i64>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Export groups
    let mut stmt = conn
        .prepare("SELECT * FROM groups")
        .map_err(|e| e.to_string())?;
    let groups: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "parent_id": row.get::<_, Option<String>>(2)?,
                "icon": row.get::<_, Option<String>>(3)?,
                "sort_order": row.get::<_, i64>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Export rules
    let mut stmt = conn
        .prepare("SELECT * FROM rules")
        .map_err(|e| e.to_string())?;
    let rules: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "pattern": row.get::<_, String>(2)?,
                "replacement": row.get::<_, String>(3)?,
                "scope": row.get::<_, String>(4)?,
                "is_regex": row.get::<_, i64>(5)?,
                "enabled": row.get::<_, i64>(6)?,
                "priority": row.get::<_, i64>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(SyncPayload {
        reading_progress: progress,
        annotations,
        tags,
        groups,
        rules,
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}

fn import_sync_data(db: &State<'_, DbConn>, payload: &SyncPayload) -> Result<(), String> {
    let conn = db.conn.lock();

    // Import reading progress (upsert)
    for p in &payload.reading_progress {
        if let (Some(book_id), Some(chapter_id), Some(scroll_offset), Some(percentage)) = (
            p["book_id"].as_str(),
            p["chapter_id"].as_str(),
            p["scroll_offset"].as_f64(),
            p["percentage"].as_f64(),
        ) {
            conn.execute(
                "INSERT OR REPLACE INTO reading_progress (book_id, chapter_id, scroll_offset, percentage, last_read_at)
                 VALUES (?1, ?2, ?3, ?4, COALESCE(?5, datetime('now')))",
                params![book_id, chapter_id, scroll_offset, percentage, p["last_read_at"].as_str()],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Import annotations (upsert)
    for a in &payload.annotations {
        if let (Some(id), Some(book_id), Some(start_offset), Some(end_offset)) = (
            a["id"].as_str(),
            a["book_id"].as_str(),
            a["start_offset"].as_i64(),
            a["end_offset"].as_i64(),
        ) {
            conn.execute(
                "INSERT OR REPLACE INTO annotations (id, book_id, chapter_id, start_offset, end_offset,
                    selected_text, color, type, content, tags, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    id,
                    book_id,
                    a["chapter_id"].as_str(),
                    start_offset,
                    end_offset,
                    a["selected_text"].as_str(),
                    a["color"].as_str().unwrap_or("#FFEB3B"),
                    a["type"].as_str().unwrap_or("highlight"),
                    a["content"].as_str(),
                    a["tags"].as_str(),
                    a["created_at"].as_str(),
                    a["updated_at"].as_str(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Import tags (upsert)
    for t in &payload.tags {
        if let (Some(id), Some(name)) = (t["id"].as_str(), t["name"].as_str()) {
            conn.execute(
                "INSERT OR REPLACE INTO tags (id, name, color, parent_id, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    id,
                    name,
                    t["color"].as_str().unwrap_or("#6B7280"),
                    t["parent_id"].as_str(),
                    t["sort_order"].as_i64().unwrap_or(0),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Import groups (upsert)
    for g in &payload.groups {
        if let (Some(id), Some(name)) = (g["id"].as_str(), g["name"].as_str()) {
            conn.execute(
                "INSERT OR REPLACE INTO groups (id, name, parent_id, icon, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    id,
                    name,
                    g["parent_id"].as_str(),
                    g["icon"].as_str(),
                    g["sort_order"].as_i64().unwrap_or(0),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn sync_push_inner(db: &State<'_, DbConn>) -> Result<(), String> {
    let config = get_webdav_config_inner(db)?;
    let client = WebDavClient::new(config);
    client.mkdir("")?;

    let payload = export_sync_data(db)?;
    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    client.put("sync_data.json", json.as_bytes())?;

    let conn = db.conn.lock();
    conn.execute("UPDATE sync_log SET synced = 1 WHERE synced = 0", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn sync_pull_inner(db: &State<'_, DbConn>) -> Result<(), String> {
    let config = get_webdav_config_inner(db)?;
    let client = WebDavClient::new(config);

    let data = client.get("sync_data.json")?;
    let payload: SyncPayload = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    import_sync_data(db, &payload)?;

    Ok(())
}
