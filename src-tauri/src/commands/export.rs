use crate::db::DbConn;
use chrono::Local;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
struct ExportAnnotation {
    pub book_title: String,
    pub chapter_title: Option<String>,
    pub selected_text: Option<String>,
    pub content: Option<String>,
    pub color: String,
    pub annotation_type: String,
    pub tags: Option<String>,
    pub created_at: String,
}

fn get_annotations_for_export(
    conn: &rusqlite::Connection,
    book_id: Option<&str>,
) -> Result<Vec<ExportAnnotation>, String> {
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<ExportAnnotation> {
        Ok(ExportAnnotation {
            book_title: row.get(0)?,
            chapter_title: row.get(1)?,
            selected_text: row.get(2)?,
            content: row.get(3)?,
            color: row.get(4)?,
            annotation_type: row.get(5)?,
            tags: row.get(6)?,
            created_at: row.get(7)?,
        })
    };

    let mut result = Vec::new();

    if let Some(bid) = book_id {
        let mut stmt = conn
            .prepare(
                "SELECT b.title, c.title, a.selected_text, a.content, a.color, a.type, a.tags, a.created_at
                 FROM annotations a
                 JOIN books b ON b.id = a.book_id
                 LEFT JOIN chapters c ON c.id = a.chapter_id
                 WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.book_id = ?1
                 ORDER BY b.title, a.created_at",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![bid], map_row).map_err(|e| e.to_string())?;
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT b.title, c.title, a.selected_text, a.content, a.color, a.type, a.tags, a.created_at
                 FROM annotations a
                 JOIN books b ON b.id = a.book_id
                 LEFT JOIN chapters c ON c.id = a.chapter_id
                 WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
                 ORDER BY b.title, a.created_at",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
    }

    Ok(result)
}

fn export_markdown(annotations: &[ExportAnnotation]) -> String {
    let mut md = String::from("# 一页 · 阅读笔记导出\n\n");
    md.push_str(&format!(
        "导出时间：{}\n\n",
        Local::now().format("%Y-%m-%d %H:%M")
    ));
    md.push_str("---\n\n");

    let mut current_book = String::new();
    for a in annotations {
        if a.book_title != current_book {
            current_book = a.book_title.clone();
            md.push_str(&format!("## 📖 {}\n\n", current_book));
        }

        if let Some(ref chapter) = a.chapter_title {
            md.push_str(&format!("### {}\n\n", chapter));
        }

        if let Some(ref text) = a.selected_text {
            md.push_str(&format!("> {}\n\n", text));
        }

        if let Some(ref note) = a.content {
            md.push_str(&format!("{}\n\n", note));
        }

        let color_name = color_to_name(&a.color);
        md.push_str(&format!(
            "*{} · {}*\n\n",
            color_name,
            &a.created_at[..10.min(a.created_at.len())]
        ));
        md.push_str("---\n\n");
    }

    md
}

fn export_html(annotations: &[ExportAnnotation]) -> String {
    let mut html = String::from(
        r#"<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>一页 · 阅读笔记</title>
<style>
body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
h1 { border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
.book { margin-top: 2rem; }
.book h2 { color: #555; }
.annotation { margin: 1rem 0; padding: 1rem; border-left: 3px solid; background: #f9f9f9; }
blockquote { margin: 0.5rem 0; padding: 0.5rem 1rem; background: #f0f0f0; border-radius: 4px; }
.note { margin-top: 0.5rem; }
.meta { font-size: 0.85em; color: #999; margin-top: 0.5rem; }
</style>
</head>
<body>
<h1>一页 · 阅读笔记导出</h1>
<p>导出时间："#,
    );
    html.push_str(&Local::now().format("%Y-%m-%d %H:%M").to_string());
    html.push_str("</p>\n");

    let mut current_book = String::new();
    for a in annotations {
        if a.book_title != current_book {
            if !current_book.is_empty() {
                html.push_str("</div>\n");
            }
            current_book = a.book_title.clone();
            html.push_str(&format!(
                "<div class=\"book\"><h2>{}</h2>\n",
                html_escape(&current_book)
            ));
        }

        html.push_str(&format!(
            "<div class=\"annotation\" style=\"border-color: {}\">\n",
            a.color
        ));

        if let Some(ref text) = a.selected_text {
            html.push_str(&format!(
                "<blockquote>{}</blockquote>\n",
                html_escape(text)
            ));
        }

        if let Some(ref note) = a.content {
            html.push_str(&format!(
                "<div class=\"note\">{}</div>\n",
                html_escape(note)
            ));
        }

        let color_name = color_to_name(&a.color);
        html.push_str(&format!(
            "<div class=\"meta\">{} · {}</div>\n",
            color_name,
            &a.created_at[..10.min(a.created_at.len())]
        ));
        html.push_str("</div>\n");
    }

    if !current_book.is_empty() {
        html.push_str("</div>\n");
    }

    html.push_str("</body></html>");
    html
}

fn export_json(annotations: &[ExportAnnotation]) -> String {
    serde_json::to_string_pretty(annotations).unwrap_or_else(|_| "[]".to_string())
}

fn color_to_name(color: &str) -> &str {
    match color {
        "#EF4444" => "重点",
        "#F97316" => "存疑",
        "#EAB308" => "标记",
        "#22C55E" => "灵感",
        "#3B82F6" => "引用",
        "#A855F7" => "感悟",
        "#6B7280" => "待确认",
        _ => "划线",
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Export annotations to a file. Returns the generated content.
#[tauri::command]
pub fn export_annotations(
    db: State<'_, DbConn>,
    book_id: Option<String>,
    format: String, // "markdown", "html", "json"
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let annotations = get_annotations_for_export(&conn, book_id.as_deref())?;

    if annotations.is_empty() {
        return Err("No annotations to export".to_string());
    }

    let content = match format.as_str() {
        "markdown" | "md" => export_markdown(&annotations),
        "html" => export_html(&annotations),
        "json" => export_json(&annotations),
        _ => return Err(format!("Unsupported format: {}", format)),
    };

    Ok(content)
}

/// Get export filename suggestion.
#[tauri::command]
pub fn get_export_filename(
    db: State<'_, DbConn>,
    book_id: Option<String>,
    format: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let book_name = if let Some(ref bid) = book_id {
        conn.query_row(
            "SELECT title FROM books WHERE id = ?1",
            params![bid],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "笔记".to_string())
    } else {
        "全部笔记".to_string()
    };

    let date = Local::now().format("%Y%m%d");
    let ext = match format.as_str() {
        "markdown" | "md" => "md",
        "html" => "html",
        "json" => "json",
        _ => "txt",
    };

    Ok(format!("{}_{}.{}", book_name, date, ext))
}
