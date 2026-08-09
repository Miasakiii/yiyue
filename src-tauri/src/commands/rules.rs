use crate::error::{AppError, AppResult};
use crate::commands::search as search_cmd;
use crate::db::DbConn;
use crate::rules::{self, Rule, RuleGroup};
use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

/* ---------- Rule Groups ---------- */

#[tauri::command]
pub fn get_rule_groups(db: State<'_, DbConn>) -> AppResult<Vec<RuleGroup>> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id, name, description, is_preset, enabled FROM rule_groups ORDER BY name")
        ?;

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
        ?;

    let mut groups = Vec::new();
    for row in rows {
        groups.push(row?);
    }
    Ok(groups)
}

#[tauri::command]
pub fn create_rule_group(
    db: State<'_, DbConn>,
    name: String,
    description: Option<String>,
    is_preset: bool,
) -> AppResult<RuleGroup> {
    let conn = db.conn.lock();
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO rule_groups (id, name, description, is_preset, enabled) VALUES (?1, ?2, ?3, ?4, 1)",
        params![id, name, description, if is_preset { 1 } else { 0 }],
    )
    ?;

    Ok(RuleGroup {
        id,
        name,
        description,
        is_preset,
        enabled: true,
    })
}

#[tauri::command]
pub fn delete_rule_group(db: State<'_, DbConn>, id: String) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute(
        "DELETE FROM rule_groups WHERE id = ?1",
        params![id],
    )
    ?;
    Ok(())
}

/* ---------- Rules ---------- */

#[tauri::command]
pub fn get_rules(db: State<'_, DbConn>) -> AppResult<Vec<Rule>> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description FROM rules ORDER BY priority DESC, name")
        ?;

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
        ?;

    let mut rules = Vec::new();
    for row in rows {
        rules.push(row?);
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
) -> AppResult<Rule> {
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
    ?;

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
    clear_group: Option<bool>,
    description: Option<String>,
) -> AppResult<Rule> {
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
        ?;

    let name = name.unwrap_or(existing.name);
    let pattern = pattern.unwrap_or(existing.pattern);
    let replacement = replacement.unwrap_or(existing.replacement);
    let scope = scope.unwrap_or(existing.scope);
    let is_regex = is_regex.unwrap_or(existing.is_regex);
    let enabled = enabled.unwrap_or(existing.enabled);
    let priority = priority.unwrap_or(existing.priority);
    // `group_id` alone cannot distinguish "not provided" from "explicit null"
    // over IPC (both deserialize to None), so the frontend passes
    // `clear_group: true` when the rule's group should be removed.
    let group_id = if clear_group.unwrap_or(false) {
        None
    } else {
        group_id.or(existing.group_id)
    };
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
    ?;

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
pub fn delete_rule(db: State<'_, DbConn>, id: String) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute("DELETE FROM rules WHERE id = ?1", params![id])
        ?;
    Ok(())
}

/* ---------- Apply Rules ---------- */

#[tauri::command(async)]
pub async fn apply_rules_to_book(
    _app: tauri::AppHandle,
    db: State<'_, DbConn>,
    book_id: String,
) -> AppResult<usize> {
    // Clone the inner Arc so we can move it into spawn_blocking
    let db_arc = db.inner().clone();
    tokio::task::spawn_blocking(move || -> AppResult<usize> {
        let conn = db_arc.conn.lock();

        // Load all enabled rules from DB
        let mut stmt = conn
            .prepare("SELECT id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description FROM rules WHERE enabled = 1")
            ?;

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
            ?
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
            ?;

        let chapters: Vec<(String, String)> = stmt
            .query_map(params![book_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            ?
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
                ?;

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
                    ?;
            }
        }

        Ok(total_replacements)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Apply rules task failed: {}", e)))?
}

/* ---------- Preset Seeding ---------- */

#[tauri::command]
pub fn init_preset_rules(db: State<'_, DbConn>) -> AppResult<()> {
    let conn = db.conn.lock();
    seed_preset_rules(&conn)
}

/// Internal helper that seeds preset rules directly from a connection reference.
/// Used during app setup to ensure presets exist without needing a State guard.
pub fn seed_preset_rules(conn: &rusqlite::Connection) -> AppResult<()> {
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

/* ---------- 规则包导出/导入（PLAN 3.4.6） ---------- */

#[derive(serde::Serialize)]
struct RulesExport {
    version: i32,
    exported_at: String,
    groups: Vec<RuleGroup>,
    rules: Vec<Rule>,
}

/// IPC：导出全部规则包（JSON 字符串，含分组）。
#[tauri::command]
pub fn export_rules_payload(db: State<'_, DbConn>) -> AppResult<String> {
    let conn = db.conn.lock();
    let mut groups = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, name, description, is_preset, enabled FROM rule_groups ORDER BY name")
            ?;
        let rows = stmt.query_map([], |row| {
            Ok(RuleGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                is_preset: row.get(3)?,
                enabled: row.get(4)?,
            })
        })?;
        for row in rows {
            groups.push(row?);
        }
    }
    let mut rules = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description FROM rules ORDER BY priority DESC, name")
            ?;
        let rows = stmt.query_map([], |row| {
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
        })?;
        for row in rows {
            rules.push(row?);
        }
    }
    let payload = RulesExport {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        groups,
        rules,
    };
    serde_json::to_string(&payload).map_err(AppError::Json)
}

/// IPC：导入规则包（JSON 字符串）。返回导入的规则数。
/// 预设组（id 以 preset- 开头）跳过；同名字自定义组复用；规则一律新建 id。
#[tauri::command]
pub fn import_rules_payload(db: State<'_, DbConn>, json: String) -> AppResult<i64> {
    let payload: RulesImport = serde_json::from_str(&json).map_err(AppError::Json)?;
    if payload.version < 1 || payload.version > 1 {
        return Err(AppError::InvalidInput(format!("不支持的规则包版本: {}", payload.version)));
    }
    let conn = db.conn.lock();

    let mut imported = 0i64;
    for g in &payload.groups {
        if g.id.starts_with("preset-") {
            continue; // 预设组不导入，避免与播种冲突
        }
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM rule_groups WHERE name = ?1",
                params![g.name],
                |r| r.get(0),
            )
            .optional()
            .map_err(AppError::Sqlite)?;
        let group_id = match existing {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO rule_groups (id, name, description, is_preset, enabled)
                     VALUES (?1, ?2, ?3, 0, ?4)",
                    params![id, g.name, g.description, g.enabled],
                )
                .map_err(AppError::Sqlite)?;
                id
            }
        };
        // 该组下的规则
        for r in payload.rules.iter().filter(|r| r.group_id.as_deref() == Some(g.id.as_str())) {
            conn.execute(
                "INSERT INTO rules (id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    Uuid::new_v4().to_string(),
                    r.name, r.pattern, r.replacement, r.scope, r.is_regex,
                    r.enabled, r.priority, group_id, r.description,
                ],
            )
            .map_err(AppError::Sqlite)?;
            imported += 1;
        }
    }
    // 无分组规则
    for r in payload.rules.iter().filter(|r| r.group_id.is_none()) {
        conn.execute(
            "INSERT INTO rules (id, name, pattern, replacement, scope, is_regex, enabled, priority, group_id, description)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?10)",
            params![
                Uuid::new_v4().to_string(),
                r.name, r.pattern, r.replacement, r.scope, r.is_regex,
                r.enabled, r.priority, r.description,
            ],
        )
        .map_err(AppError::Sqlite)?;
        imported += 1;
    }
    Ok(imported)
}

#[derive(serde::Deserialize)]
struct RulesImport {
    version: i32,
    groups: Vec<RuleGroup>,
    rules: Vec<Rule>,
}

/// IPC：导出规则包到指定文件（前端 save 对话框拿路径）。
#[tauri::command]
pub fn export_rules_to_file(path: String, json: String) -> AppResult<()> {
    std::fs::write(&path, json).map_err(AppError::Io)?;
    Ok(())
}

/// IPC：从指定文件导入规则包（前端 open 对话框拿路径）。
#[tauri::command]
pub fn import_rules_from_file(db: State<'_, DbConn>, path: String) -> AppResult<i64> {
    let json = std::fs::read_to_string(&path).map_err(AppError::Io)?;
    import_rules_payload(db, json)
}
