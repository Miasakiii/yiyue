pub mod schema;

use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Clone)]
pub struct DbConn {
    pub conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Failed to resolve app data dir")]
    NoDataDir,
}

impl serde::Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type DbResult<T> = Result<T, DbError>;

pub fn get_db_path(app: &AppHandle) -> DbResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| DbError::NoDataDir)?;
    fs::create_dir_all(&data_dir)?;
    Ok(data_dir.join("data.db"))
}

pub fn init_db(app: &AppHandle) -> DbResult<Connection> {
    let db_path = get_db_path(app)?;
    let conn = Connection::open(&db_path)?;
    schema::initialize(&conn)?;
    Ok(conn)
}
