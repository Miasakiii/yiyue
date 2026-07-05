mod commands;
mod db;
mod error;
mod models;
mod parser;
mod rules;
mod search;
mod sync;

use tauri::Manager;
use commands::rules::seed_preset_rules;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let conn = db::init_db(&app.handle())?;
            app.manage(db::DbConn { conn: std::sync::Arc::new(parking_lot::Mutex::new(conn)) });

            // Seed preset rules into DB on first launch
            if let Some(db_state) = app.try_state::<db::DbConn>() {
                let conn = db_state.conn.lock();
                let _ = seed_preset_rules(&conn);
            }

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
            commands::books::get_reading_profile,
            commands::books::save_reading_profile,
            commands::dict::lookup_word,
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
            commands::tags::get_book_groups,
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
            commands::stats::get_reading_speed,
            commands::rules::get_rules,
            commands::rules::get_rule_groups,
            commands::rules::create_rule,
            commands::rules::update_rule,
            commands::rules::delete_rule,
            commands::rules::create_rule_group,
            commands::rules::delete_rule_group,
            commands::rules::apply_rules_to_book,
            commands::rules::init_preset_rules,
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
