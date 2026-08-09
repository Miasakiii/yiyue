use crate::db::DbConn;
use crate::error::AppResult;
use crate::models::*;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_tags(db: State<'_, DbConn>) -> AppResult<Vec<Tag>> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id, name, color, parent_id, sort_order FROM tags ORDER BY sort_order, name")
        ?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                parent_id: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })
        ?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

#[tauri::command]
pub fn create_tag(
    db: State<'_, DbConn>,
    name: String,
    color: Option<String>,
    parent_id: Option<String>,
) -> AppResult<Tag> {
    let conn = db.conn.lock();
    let id = Uuid::new_v4().to_string();
    let color = color.unwrap_or_else(|| "#6B7280".to_string());

    conn.execute(
        "INSERT INTO tags (id, name, color, parent_id) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, color, parent_id],
    )
    ?;

    Ok(Tag {
        id,
        name,
        color,
        parent_id,
        sort_order: 0,
    })
}

#[tauri::command]
pub fn delete_tag(db: State<'_, DbConn>, id: String) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        ?;
    Ok(())
}

#[tauri::command]
pub fn add_book_tag(db: State<'_, DbConn>, book_id: String, tag_id: String) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute(
        "INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?1, ?2)",
        params![book_id, tag_id],
    )
    ?;
    Ok(())
}

#[tauri::command]
pub fn remove_book_tag(
    db: State<'_, DbConn>,
    book_id: String,
    tag_id: String,
) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute(
        "DELETE FROM book_tags WHERE book_id = ?1 AND tag_id = ?2",
        params![book_id, tag_id],
    )
    ?;
    Ok(())
}

#[tauri::command]
pub fn get_book_tags(db: State<'_, DbConn>, book_id: String) -> AppResult<Vec<Tag>> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, t.color, t.parent_id, t.sort_order
             FROM tags t
             JOIN book_tags bt ON bt.tag_id = t.id
             WHERE bt.book_id = ?1
             ORDER BY t.sort_order, t.name",
        )
        ?;

    let rows = stmt
        .query_map(params![book_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                parent_id: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })
        ?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

#[tauri::command]
pub fn get_groups(db: State<'_, DbConn>) -> AppResult<Vec<Group>> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare("SELECT id, name, parent_id, icon, sort_order FROM groups ORDER BY sort_order, name")
        ?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                icon: row.get(3)?,
                sort_order: row.get(4)?,
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
pub fn create_group(
    db: State<'_, DbConn>,
    name: String,
    icon: Option<String>,
    parent_id: Option<String>,
) -> AppResult<Group> {
    let conn = db.conn.lock();
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO groups (id, name, icon, parent_id) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, icon, parent_id],
    )
    ?;

    Ok(Group {
        id,
        name,
        parent_id,
        icon,
        sort_order: 0,
    })
}

#[tauri::command]
pub fn delete_group(db: State<'_, DbConn>, id: String) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute("DELETE FROM groups WHERE id = ?1", params![id])
        ?;
    Ok(())
}

#[tauri::command]
pub fn add_book_group(
    db: State<'_, DbConn>,
    book_id: String,
    group_id: String,
) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute(
        "INSERT OR IGNORE INTO book_groups (book_id, group_id) VALUES (?1, ?2)",
        params![book_id, group_id],
    )
    ?;
    Ok(())
}

#[tauri::command]
pub fn remove_book_group(
    db: State<'_, DbConn>,
    book_id: String,
    group_id: String,
) -> AppResult<()> {
    let conn = db.conn.lock();
    conn.execute(
        "DELETE FROM book_groups WHERE book_id = ?1 AND group_id = ?2",
        params![book_id, group_id],
    )
    ?;
    Ok(())
}

#[tauri::command]
pub fn get_book_groups(db: State<'_, DbConn>, book_id: String) -> AppResult<Vec<Group>> {
    let conn = db.conn.lock();
    let mut stmt = conn
        .prepare(
            "SELECT g.id, g.name, g.parent_id, g.icon, g.sort_order
             FROM groups g
             JOIN book_groups bg ON bg.group_id = g.id
             WHERE bg.book_id = ?1
             ORDER BY g.sort_order, g.name",
        )
        ?;

    let rows = stmt
        .query_map(params![book_id], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                icon: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })
        ?;

    let mut groups = Vec::new();
    for row in rows {
        groups.push(row?);
    }
    Ok(groups)
}
