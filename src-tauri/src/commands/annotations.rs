use crate::db::DbConn;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: String,
    pub book_id: String,
    pub chapter_id: Option<String>,
    pub start_offset: i64,
    pub end_offset: i64,
    pub selected_text: Option<String>,
    pub region_x: Option<f64>,
    pub region_y: Option<f64>,
    pub region_w: Option<f64>,
    pub region_h: Option<f64>,
    pub color: String,
    pub annotation_type: String,
    pub content: Option<String>,
    pub tags: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAnnotation {
    pub book_id: String,
    pub chapter_id: Option<String>,
    pub start_offset: i64,
    pub end_offset: i64,
    pub selected_text: Option<String>,
    pub color: Option<String>,
    pub annotation_type: Option<String>,
    pub content: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAnnotation {
    pub color: Option<String>,
    pub content: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub fn get_annotations(
    db: State<'_, DbConn>,
    book_id: String,
    chapter_id: Option<String>,
) -> Result<Vec<Annotation>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(ch_id) = chapter_id {
        (
            "SELECT id, book_id, chapter_id, start_offset, end_offset, selected_text,
                    region_x, region_y, region_w, region_h, color, type, content, tags,
                    created_at, updated_at
             FROM annotations
             WHERE book_id = ?1 AND chapter_id = ?2 AND deleted_at IS NULL
             ORDER BY start_offset".to_string(),
            vec![Box::new(book_id), Box::new(ch_id)],
        )
    } else {
        (
            "SELECT id, book_id, chapter_id, start_offset, end_offset, selected_text,
                    region_x, region_y, region_w, region_h, color, type, content, tags,
                    created_at, updated_at
             FROM annotations
             WHERE book_id = ?1 AND deleted_at IS NULL
             ORDER BY created_at DESC".to_string(),
            vec![Box::new(book_id)],
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(Annotation {
                id: row.get(0)?,
                book_id: row.get(1)?,
                chapter_id: row.get(2)?,
                start_offset: row.get(3)?,
                end_offset: row.get(4)?,
                selected_text: row.get(5)?,
                region_x: row.get(6)?,
                region_y: row.get(7)?,
                region_w: row.get(8)?,
                region_h: row.get(9)?,
                color: row.get(10)?,
                annotation_type: row.get(11)?,
                content: row.get(12)?,
                tags: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut annotations = Vec::new();
    for row in rows {
        annotations.push(row.map_err(|e| e.to_string())?);
    }
    Ok(annotations)
}

#[tauri::command]
pub fn create_annotation(
    db: State<'_, DbConn>,
    annotation: CreateAnnotation,
) -> Result<Annotation, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let color = annotation.color.unwrap_or_else(|| "#FFEB3B".to_string());
    let annotation_type = annotation
        .annotation_type
        .unwrap_or_else(|| "highlight".to_string());
    let tags_json = annotation
        .tags
        .as_ref()
        .map(|t| serde_json::to_string(t).unwrap_or_default());

    conn.execute(
        "INSERT INTO annotations (id, book_id, chapter_id, start_offset, end_offset,
                                  selected_text, color, type, content, tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            annotation.book_id,
            annotation.chapter_id,
            annotation.start_offset,
            annotation.end_offset,
            annotation.selected_text,
            color,
            annotation_type,
            annotation.content,
            tags_json,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Update FTS
    if annotation.selected_text.is_some() || annotation.content.is_some() {
        let _ = conn.execute(
            "INSERT INTO annotations_fts(rowid, selected_text, content, tags)
             SELECT rowid, selected_text, content, tags FROM annotations WHERE id = ?1",
            params![id],
        );
    }

    Ok(Annotation {
        id,
        book_id: annotation.book_id,
        chapter_id: annotation.chapter_id,
        start_offset: annotation.start_offset,
        end_offset: annotation.end_offset,
        selected_text: annotation.selected_text,
        region_x: None,
        region_y: None,
        region_w: None,
        region_h: None,
        color,
        annotation_type,
        content: annotation.content,
        tags: annotation.tags.map(|t| serde_json::to_string(&t).unwrap_or_default()),
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn update_annotation(
    db: State<'_, DbConn>,
    id: String,
    update: UpdateAnnotation,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(color) = update.color {
        sets.push("color = ?");
        param_values.push(Box::new(color));
    }
    if let Some(content) = update.content {
        sets.push("content = ?");
        param_values.push(Box::new(content));
    }
    if let Some(tags) = update.tags {
        sets.push("tags = ?");
        param_values.push(Box::new(serde_json::to_string(&tags).unwrap_or_default()));
    }

    if sets.is_empty() {
        return Ok(());
    }

    sets.push("updated_at = datetime('now')");
    param_values.push(Box::new(id));

    let sql = format!("UPDATE annotations SET {} WHERE id = ?", sets.join(", "));
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_annotation(db: State<'_, DbConn>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE annotations SET deleted_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
