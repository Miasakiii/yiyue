use crate::parser::{DocMetadata, ParsedChapter, ParsedDocument, ParseError, ParseOptions};

pub fn parse(path: &std::path::Path, _opts: &ParseOptions) -> Result<ParsedDocument, ParseError> {
    // Read file bytes once — used for both text extraction and metadata parsing.
    // Previously: extract_text(path) + FileOptions::open(path) = 2 disk reads + 2 parses.
    // Now: 1 disk read, 1 parse for text, 1 parse for metadata from the same bytes.
    let file_bytes = std::fs::read(path)?;

    // Extract text using pdf-extract from memory buffer (no second disk read)
    let text = pdf_extract::extract_text_from_mem(&file_bytes)
        .map_err(|e| ParseError::Parse(format!("Failed to extract PDF text: {}", e)))?;

    // Get metadata from the pdf crate — load from the same bytes
    let mut title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let mut author = None;

    if let Ok(file) = pdf::file::FileOptions::cached().load(file_bytes) {
        if let Some(ref info_dict) = file.trailer.info_dict {
            if let Some(ref t) = info_dict.title {
                title = t.to_string_lossy();
            }
            if let Some(ref a) = info_dict.author {
                author = Some(a.to_string_lossy());
            }
        }
    }

    // Split text into pages by form feed character (common page separator)
    let pages: Vec<&str> = text.split('\x0C').collect();

    let mut chapters = Vec::new();
    let mut full_text = String::new();

    for (i, page_text) in pages.iter().enumerate() {
        let page_text = page_text.trim();
        if page_text.is_empty() {
            continue;
        }

        let start_offset = full_text.len();
        if !full_text.is_empty() {
            full_text.push('\n');
        }
        full_text.push_str(page_text);
        let end_offset = full_text.len();

        chapters.push(ParsedChapter {
            title: format!("第 {} 页", i + 1),
            level: 1,
            start_offset,
            end_offset,
            char_count: page_text.chars().count(),
            content: page_text.to_string(),
        });
    }

    // If no pages were split (no form feed), treat the whole text as one chapter
    if chapters.is_empty() && !text.trim().is_empty() {
        let text = text.trim().to_string();
        chapters.push(ParsedChapter {
            title: "全文".to_string(),
            level: 1,
            start_offset: 0,
            end_offset: text.len(),
            char_count: text.chars().count(),
            content: text.clone(),
        });
        full_text = text;
    }

    let total_chars = full_text.chars().count();

    Ok(ParsedDocument {
        metadata: DocMetadata {
            title,
            author,
            language: "unknown".to_string(),
            total_chars,
            total_chapters: chapters.len(),
        },
        chapters,
        full_text,
    })
}
