use crate::db::DbConn;
use rusqlite::params;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct ReadingStats {
    pub total_duration_ms: i64,
    pub total_chars_read: i64,
    pub total_sessions: i64,
    pub reading_days: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
}

#[derive(Debug, Serialize)]
pub struct DailyStats {
    pub date: String,
    pub duration_ms: i64,
    pub chars_read: i64,
    pub sessions: i64,
}

#[derive(Debug, Serialize)]
pub struct WeeklyStats {
    pub week_start: String,
    pub total_duration_ms: i64,
    pub total_chars_read: i64,
    pub days_read: i64,
}

#[derive(Debug, Serialize)]
pub struct BookStats {
    pub book_id: String,
    pub book_title: String,
    pub total_duration_ms: i64,
    pub total_chars_read: i64,
    pub sessions: i64,
    pub last_read: String,
}

/// Record a reading session.
#[tauri::command]
pub fn record_reading_session(
    db: State<'_, DbConn>,
    book_id: String,
    start_time: String,
    end_time: String,
    duration_ms: i64,
    chars_read: Option<i64>,
    chapters_read: Option<i64>,
) -> Result<(), String> {
    let conn = db.conn.lock();
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO reading_sessions (id, book_id, start_time, end_time, duration_ms, chars_read, chapters_read)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, book_id, start_time, end_time, duration_ms, chars_read.unwrap_or(0), chapters_read.unwrap_or(0)],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get overall reading statistics.
#[tauri::command]
pub fn get_reading_stats(db: State<'_, DbConn>) -> Result<ReadingStats, String> {
    let conn = db.conn.lock();

    let total_duration_ms: i64 = conn
        .query_row("SELECT COALESCE(SUM(duration_ms), 0) FROM reading_sessions", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let total_chars_read: i64 = conn
        .query_row("SELECT COALESCE(SUM(chars_read), 0) FROM reading_sessions", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let total_sessions: i64 = conn
        .query_row("SELECT COUNT(*) FROM reading_sessions", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let reading_days: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date(start_time)) FROM reading_sessions",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Calculate streaks
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT date(start_time) as d FROM reading_sessions ORDER BY d DESC",
        )
        .map_err(|e| e.to_string())?;

    let dates: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let (current_streak, longest_streak) = calculate_streaks(&dates);

    Ok(ReadingStats {
        total_duration_ms,
        total_chars_read,
        total_sessions,
        reading_days,
        current_streak,
        longest_streak,
    })
}

/// Get daily reading stats for the last N days.
#[tauri::command]
pub fn get_daily_stats(
    db: State<'_, DbConn>,
    days: Option<i64>,
) -> Result<Vec<DailyStats>, String> {
    let conn = db.conn.lock();
    let days = days.unwrap_or(90);

    let mut stmt = conn
        .prepare(
            "SELECT date(start_time) as d,
                    SUM(duration_ms) as total_dur,
                    SUM(chars_read) as total_chars,
                    COUNT(*) as sessions
             FROM reading_sessions
             WHERE start_time >= date('now', ?1)
             GROUP BY d
             ORDER BY d",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![format!("-{} days", days)], |row| {
            Ok(DailyStats {
                date: row.get(0)?,
                duration_ms: row.get(1)?,
                chars_read: row.get(2)?,
                sessions: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Get weekly reading stats.
#[tauri::command]
pub fn get_weekly_stats(
    db: State<'_, DbConn>,
    weeks: Option<i64>,
) -> Result<Vec<WeeklyStats>, String> {
    let conn = db.conn.lock();
    let weeks = weeks.unwrap_or(12);

    let mut stmt = conn
        .prepare(
            "SELECT date(start_time, 'weekday 0', '-6 days') as week_start,
                    SUM(duration_ms) as total_dur,
                    SUM(chars_read) as total_chars,
                    COUNT(DISTINCT date(start_time)) as days
             FROM reading_sessions
             WHERE start_time >= date('now', ?1)
             GROUP BY week_start
             ORDER BY week_start",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![format!("-{} weeks", weeks)], |row| {
            Ok(WeeklyStats {
                week_start: row.get(0)?,
                total_duration_ms: row.get(1)?,
                total_chars_read: row.get(2)?,
                days_read: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Get per-book reading stats.
#[tauri::command]
pub fn get_book_stats(db: State<'_, DbConn>) -> Result<Vec<BookStats>, String> {
    let conn = db.conn.lock();

    let mut stmt = conn
        .prepare(
            "SELECT s.book_id, b.title,
                    SUM(s.duration_ms) as total_dur,
                    SUM(s.chars_read) as total_chars,
                    COUNT(*) as sessions,
                    MAX(s.end_time) as last_read
             FROM reading_sessions s
             JOIN books b ON b.id = s.book_id
             WHERE b.deleted_at IS NULL
             GROUP BY s.book_id
             ORDER BY total_dur DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(BookStats {
                book_id: row.get(0)?,
                book_title: row.get(1)?,
                total_duration_ms: row.get(2)?,
                total_chars_read: row.get(3)?,
                sessions: row.get(4)?,
                last_read: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(Debug, Serialize)]
pub struct ReadingSpeed {
    pub chars_per_minute: f64,
}

/// Get reading speed for a book based on recent sessions.
#[tauri::command]
pub fn get_reading_speed(
    db: State<'_, DbConn>,
    book_id: String,
) -> Result<ReadingSpeed, String> {
    let conn = db.conn.lock();

    // Take the most recent 5 sessions for this book
    let result = conn.query_row(
        "SELECT COALESCE(SUM(chars_read), 0), COALESCE(SUM(duration_ms), 0)
         FROM (SELECT chars_read, duration_ms FROM reading_sessions
               WHERE book_id = ?1 ORDER BY end_time DESC LIMIT 5)",
        params![book_id],
        |row| {
            let chars: i64 = row.get(0)?;
            let ms: i64 = row.get(1)?;
            Ok((chars, ms))
        },
    );

    match result {
        Ok((chars, ms)) if ms > 0 => {
            let cpm = (chars as f64) / (ms as f64) * 60000.0;
            Ok(ReadingSpeed {
                chars_per_minute: cpm.max(100.0), // floor at 100 to avoid absurd estimates
            })
        }
        _ => {
            // No data — default to 300 chars/min (average Chinese reading speed)
            Ok(ReadingSpeed {
                chars_per_minute: 300.0,
            })
        }
    }
}

fn calculate_streaks(dates: &[String]) -> (i64, i64) {
    if dates.is_empty() {
        return (0, 0);
    }

    let mut longest_streak = 1i64;
    let mut streak = 1i64;

    for i in 1..dates.len() {
        // Check if consecutive days
        if let (Ok(prev), Ok(curr)) = (
            chrono::NaiveDate::parse_from_str(&dates[i - 1], "%Y-%m-%d"),
            chrono::NaiveDate::parse_from_str(&dates[i], "%Y-%m-%d"),
        ) {
            if (prev - curr).num_days() == 1 {
                streak += 1;
            } else {
                streak = 1;
            }
            longest_streak = longest_streak.max(streak);
        }
    }

    // Check if today or yesterday is in the dates to determine current streak
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let current_streak = if dates.first() == Some(&today) || dates.first() == Some(&yesterday) {
        streak
    } else {
        0
    };

    (current_streak, longest_streak)
}
