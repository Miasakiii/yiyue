use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub author: Option<String>,
    pub file_hash: String,
    pub file_path: String,
    pub file_size: i64,
    pub format: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub language: String,
    pub total_chapters: Option<i64>,
    pub total_chars: Option<i64>,
    pub metadata_json: Option<String>,
    pub reading_mode: Option<String>,
    pub added_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookListItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub author: Option<String>,
    pub format: String,
    pub cover_path: Option<String>,
    pub file_size: i64,
    pub total_chapters: Option<i64>,
    pub added_at: String,
    pub updated_at: String,
    pub reading_percentage: f64,
    pub starred: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookFilter {
    pub kind: Option<String>,
    pub tag: Option<String>,
    pub group: Option<String>,
    pub starred: Option<bool>,
    pub search: Option<String>,
    pub sort_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBook {
    pub title: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub book_id: String,
    pub title: Option<String>,
    pub level: i64,
    pub sort_order: i64,
    pub start_offset: Option<i64>,
    pub end_offset: Option<i64>,
    pub char_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub book_id: String,
    pub chapter_id: Option<String>,
    pub scroll_offset: f64,
    pub page_index: i64,
    pub percentage: f64,
    pub last_read_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProgress {
    pub chapter_id: Option<String>,
    pub scroll_offset: Option<f64>,
    pub page_index: Option<i64>,
    pub percentage: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub icon: Option<String>,
    pub sort_order: i64,
}

// Comic/Manga types

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicPage {
    pub index: i64,
    pub file_name: String,
    pub width: i64,
    pub height: i64,
    pub image_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicChapter {
    pub id: String,
    pub title: String,
    pub pages: Vec<ComicPage>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComicMetadata {
    pub title: String,
    pub author: Option<String>,
    pub language: String,
    pub total_pages: i64,
    pub reading_mode: String,      // "page" | "scroll" | "webtoon"
    pub reading_direction: String,  // "ltr" | "rtl"
    pub page_scaling: String,       // "fit_width" | "fit_height" | "fit_screen" | "original"
}
