use crate::commands::search as search_cmd;
use crate::db::DbConn;
use crate::rules::{self, Rule, RuleGroup};
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

/* ---------- Rule Groups ---------- */

#[tauri::command]
pub fn get_rule_groups(db: State<'_, DbConn>) -> Result<Vec<RuleGroup>, String> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_preset, enabled FROM rule_groups ORDER BY name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RuleGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                is_preset: row.get(3)?,
                enabled: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut groups = Vec::new();
    for row in rows {
        groups.push(row.map_err(|e| e.to_string())?);
    }
    Ok(groups)
}

#[tauri::command]
pub fn create_rule_group(
    db: State<'_, DbConn>,
    name: String,
    description: Option<String>,
    is_preset: bool,
) -> Result<RuleGroup, String> {
    let conn = db.conn.lock();
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO rule_groups (id, name, description, is_preset, enabled) VALUES (?1, ?2, ?3, ?4, 1)",
        params![id, name, description, if is_preset { 1 } else { 0 }],
    )
    .map_err(|e| e.to_string())?;

    Ok(RuleGroup {
        id,
        name,
        description,
        is_preset,
        enabled: true,
    })
}

#[tauri::command]
pub fn delete_rule_group(db: State<'_, DbConn>, id: String) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute(
        "DELETE FROM rule_groups WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- Rules ---------- */

#[tauri::command]
pub fn get_rules(db: State<'_, DbConn>) -> Result<Vec<Rule>, String> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description FROM rules ORDER BY priority DESC, name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Rule {
                id: row.get(0)?,
                name: row.get(1)?,
                pattern: row.get(2)?,
                replacement: row.get(3)?,
                scope: row.get(4)?,
                is_regex: row.get(5)?,
                enabled: row.get(6)?,
                priority: row.get(7)?,
                group_id: row.get(8)?,
                description: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut rules = Vec::new();
    for row in rows {
        rules.push(row.map_err(|e| e.to_string())?);
    }
    Ok(rules)
}

#[tauri::command]
pub fn create_rule(
    db: State<'_, DbConn>,
    name: String,
    pattern: String,
    replacement: String,
    scope: String,
    is_regex: bool,
    priority: i64,
    group_id: Option<String>,
    description: Option<String>,
) -> Result<Rule, String> {
    let conn = db.conn.lock();
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO rules (id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9)",
        params![
            id,
            name,
            pattern,
            replacement,
            scope,
            if is_regex { 1 } else { 0 },
            priority,
            group_id,
            description,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Rule {
        id,
        name,
        pattern,
        replacement,
        scope,
        is_regex,
        enabled: true,
        priority,
        group_id,
        description,
    })
}

#[tauri::command]
pub fn update_rule(
    db: State<'_, DbConn>,
    id: String,
    name: Option<String>,
    pattern: Option<String>,
    replacement: Option<String>,
    scope: Option<String>,
    is_regex: Option<bool>,
    enabled: Option<bool>,
    priority: Option<i64>,
    group_id: Option<String>,
    description: Option<String>,
) -> Result<Rule, String> {
    let conn = db.conn.lock();

    // Fetch existing first
    let existing: Rule = conn
        .query_row(
            "SELECT id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description FROM rules WHERE id = ?1",
            params![id],
            |row| {
                Ok(Rule {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    pattern: row.get(2)?,
                    replacement: row.get(3)?,
                    scope: row.get(4)?,
                    is_regex: row.get(5)?,
                    enabled: row.get(6)?,
                    priority: row.get(7)?,
                    group_id: row.get(8)?,
                    description: row.get(9)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let name = name.unwrap_or(existing.name);
    let pattern = pattern.unwrap_or(existing.pattern);
    let replacement = replacement.unwrap_or(existing.replacement);
    let scope = scope.unwrap_or(existing.scope);
    let is_regex = is_regex.unwrap_or(existing.is_regex);
    let enabled = enabled.unwrap_or(existing.enabled);
    let priority = priority.unwrap_or(existing.priority);
    let group_id = group_id.or(existing.group_id);
    let description = description.or(existing.description);

    conn.execute(
        "UPDATE rules SET name = ?1, pattern = ?2, replacement = ?3, scope = ?4, is_regex = ?5, enabled = ?6, priority = ?7, group_id = ?8, description = ?9 WHERE id = ?10",
        params![
            name,
            pattern,
            replacement,
            scope,
            if is_regex { 1 } else { 0 },
            if enabled { 1 } else { 0 },
            priority,
            group_id,
            description,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Rule {
        id,
        name,
        pattern,
        replacement,
        scope,
        is_regex,
        enabled,
        priority,
        group_id,
        description,
    })
}

#[tauri::command]
pub fn delete_rule(db: State<'_, DbConn>, id: String) -> Result<(), String> {
    let conn = db.conn.lock();
    conn.execute("DELETE FROM rules WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---------- Apply Rules ---------- */

#[tauri::command(async)]
pub async fn apply_rules_to_book(
    _app: tauri::AppHandle,
    db: State<'_, DbConn>,
    book_id: String,
) -> Result<usize, String> {
    // Clone the inner Arc so we can move it into spawn_blocking
    let db_arc = db.inner().clone();
    tokio::task::spawn_blocking(move || -> Result<usize, String> {
        let conn = db_arc.conn.lock();

        // Load all enabled rules from DB
        let mut stmt = conn
            .prepare("SELECT id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description FROM rules WHERE enabled = 1")
            .map_err(|e| e.to_string())?;

        let db_rules: Vec<Rule> = stmt
            .query_map([], |row| {
                Ok(Rule {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    pattern: row.get(2)?,
                    replacement: row.get(3)?,
                    scope: row.get(4)?,
                    is_regex: row.get(5)?,
                    enabled: row.get(6)?,
                    priority: row.get(7)?,
                    group_id: row.get(8)?,
                    description: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // Merge with preset rules
        let preset = rules::presets::web_novel_cleaner();
        let mut all_rules = db_rules;
        for preset_rule in preset.rules {
            // Avoid duplicates by id
            if !all_rules.iter().any(|r| r.id == preset_rule.id) {
                all_rules.push(preset_rule);
            }
        }

        if all_rules.is_empty() {
            return Ok(0);
        }

        // Load chapters
        let mut stmt = conn
            .prepare("SELECT id, content FROM chapters WHERE book_id = ?1 ORDER BY sort_order")
            .map_err(|e| e.to_string())?;

        let chapters: Vec<(String, String)> = stmt
            .query_map(params![book_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut total_replacements = 0usize;

        for (chapter_id, content) in chapters {
            if content.is_empty() {
                continue;
            }
            let (cleaned, count) = rules::apply_rules(&content, &all_rules);
            if count > 0 {
                total_replacements += count;
                conn.execute(
                    "UPDATE chapters SET content = ?1 WHERE id = ?2",
                    params![cleaned, chapter_id],
                )
                .map_err(|e| e.to_string())?;

                // Re-index in FTS
                let title_opt: Option<String> = conn
                    .query_row(
                        "SELECT title FROM chapters WHERE id = ?1",
                        params![chapter_id],
                        |row| row.get(0),
                    )
                    .ok()
                    .flatten();

                search_cmd::index_chapter(&conn, &book_id, &chapter_id, title_opt.as_deref(), &cleaned)
                    .map_err(|e| e.to_string())?;
            }
        }

        Ok(total_replacements)
    })
    .await
    .map_err(|e| format!("Apply rules task failed: {}", e))?
}

/* ---------- Preset Seeding ---------- */

#[tauri::command]
pub fn init_preset_rules(db: State<'_, DbConn>) -> Result<(), String> {
    let conn = db.conn.lock();
    seed_preset_rules(&conn)
}

/// Internal helper that seeds preset rules directly from a connection reference.
/// Used during app setup to ensure presets exist without needing a State guard.
pub fn seed_preset_rules(conn: &rusqlite::Connection) -> Result<(), String> {
    let group_id = "preset-web-novel";
    conn.execute(
        "INSERT OR IGNORE INTO rule_groups (id, name, description, is_preset, enabled) VALUES (?1, ?2, ?3, 1, 1)",
        params![
            group_id,
            "网文清洗套装",
            "适用于常见中文网络小说的干扰词过滤规则"
        ],
    )
    .ok();

    let preset = rules::presets::web_novel_cleaner();

    for rule in preset.rules {
        conn.execute(
            "INSERT OR IGNORE INTO rules (id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                rule.id,
                rule.name,
                rule.pattern,
                rule.replacement,
                rule.scope,
                if rule.is_regex { 1 } else { 0 },
                if rule.enabled { 1 } else { 0 },
                rule.priority,
                rule.group_id,
                rule.description,
            ],
        )
        .ok();
    }

    Ok(())
}
