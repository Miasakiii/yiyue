pub mod comic;
pub mod epub;
pub mod markdown;
pub mod pdf;
pub mod txt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseOptions {
    pub encoding: Option<String>,
    pub chapter_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub metadata: DocMetadata,
    pub chapters: Vec<ParsedChapter>,
    pub full_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocMetadata {
    pub title: String,
    pub author: Option<String>,
    pub language: String,
    pub total_chars: usize,
    pub total_chapters: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedChapter {
    pub title: String,
    pub level: i64,
    pub start_offset: usize,
    pub end_offset: usize,
    pub char_count: usize,
    pub content: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Encoding detection failed")]
    EncodingDetectionFailed,
    #[error("Parse error: {0}")]
    Parse(String),
}

impl serde::Serialize for ParseError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
