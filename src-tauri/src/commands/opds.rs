use crate::db::DbConn;
use crate::error::AppResult;
use crate::opds::{OpdsConfig, OpdsServerState, UploadPageInfo};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_opds_config(db: State<'_, DbConn>) -> AppResult<OpdsConfig> {
    let conn = db.conn.lock();
    crate::opds::get_opds_config(&conn)
}

#[tauri::command]
pub fn save_opds_config(db: State<'_, DbConn>, config: OpdsConfig) -> AppResult<()> {
    let conn = db.conn.lock();
    crate::opds::save_opds_config(&conn, &config)
}

#[tauri::command]
pub fn get_opds_feed(db: State<'_, DbConn>, base_url: String) -> AppResult<String> {
    let conn = db.conn.lock();
    crate::opds::build_opds_feed(&conn, &base_url)
}

#[tauri::command]
pub fn start_opds_server(
    app: AppHandle,
    db: State<'_, DbConn>,
    port: u16,
    server_state: State<'_, OpdsServerState>,
) -> AppResult<()> {
    let db_conn = db.conn.clone();
    let on_upload: Option<Arc<dyn Fn(String) + Send + Sync>> = Some(Arc::new(move |path| {
        let _ = app.emit("upload-complete", path);
    }));
    crate::opds::start_opds_server(db_conn, port, &server_state, on_upload)
}

#[tauri::command]
pub fn stop_opds_server(server_state: State<'_, OpdsServerState>) -> AppResult<()> {
    crate::opds::stop_opds_server(&server_state)
}

#[tauri::command]
pub fn get_opds_server_status(
    server_state: State<'_, OpdsServerState>,
) -> AppResult<crate::opds::OpdsServerStatus> {
    Ok(crate::opds::get_opds_server_status(&server_state))
}

/// Get the LAN IP address of this machine (e.g. "192.168.1.10").
/// Returns `None` when no LAN connection is available.
#[tauri::command]
pub fn get_lan_ip() -> Option<String> {
    crate::opds::get_lan_ip()
}

/// Get everything the upload dialog needs: LAN IP, port, full upload page
/// URL and a QR code (SVG string) pointing at that URL. Uses the running
/// server port when the server is up, otherwise the configured port.
#[tauri::command]
pub fn get_upload_page_info(
    db: State<'_, DbConn>,
    server_state: State<'_, OpdsServerState>,
) -> AppResult<UploadPageInfo> {
    let port = match server_state.get_port() {
        Some(p) => p,
        None => {
            let conn = db.conn.lock();
            crate::opds::get_opds_config(&conn)?.port
        }
    };
    Ok(crate::opds::build_upload_page_info(port))
}
