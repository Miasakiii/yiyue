mod commands;
mod db;
mod models;
mod parser;
mod rules;
mod search;
mod sync;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = db::init_db(&app.handle())?;
            app.manage(db::DbConn { conn: std::sync::Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::books::get_books,
            commands::books::get_book,
            commands::books::update_book,
            commands::books::delete_book,
            commands::books::get_chapters,
            commands::books::get_progress,
            commands::books::update_progress,
            commands::books::toggle_favorite,
            commands::books::get_chapter_content,
            commands::import::import_book,
            commands::import::import_folder,
            commands::tags::get_tags,
            commands::tags::create_tag,
            commands::tags::delete_tag,
            commands::tags::add_book_tag,
            commands::tags::remove_book_tag,
            commands::tags::get_book_tags,
            commands::tags::get_groups,
            commands::tags::create_group,
            commands::tags::delete_group,
            commands::tags::add_book_group,
            commands::tags::remove_book_group,
            commands::annotations::get_annotations,
            commands::annotations::create_annotation,
            commands::annotations::update_annotation,
            commands::annotations::delete_annotation,
            commands::search::search_all,
            commands::export::export_annotations,
            commands::export::get_export_filename,
            commands::stats::record_reading_session,
            commands::stats::get_reading_stats,
            commands::stats::get_daily_stats,
            commands::stats::get_weekly_stats,
            commands::stats::get_book_stats,
            commands::sync::get_webdav_config,
            commands::sync::save_webdav_config,
            commands::sync::test_webdav_connection,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::sync_full,
            commands::sync::get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
