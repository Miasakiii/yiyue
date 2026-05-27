use crate::parser::{DocMetadata, ParsedChapter, ParsedDocument, ParseError, ParseOptions};
use pdf::file::FileOptions;

pub fn parse(path: &std::path::Path, _opts: &ParseOptions) -> Result<ParsedDocument, ParseError> {
    let file = FileOptions::cached().open(path).map_err(|e| {
        ParseError::Parse(format!("Failed to open PDF: {}", e))
    })?;

    let num_pages = file.num_pages();

    // Extract metadata from info dict
    let mut title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let mut author = None;

    if let Some(ref info_dict) = file.trailer.info_dict {
        if let Some(ref t) = info_dict.title {
            title = t.to_string_lossy();
        }
        if let Some(ref a) = info_dict.author {
            author = Some(a.to_string_lossy());
        }
    }

    let mut chapters = Vec::new();
    let mut full_text = String::new();

    // Process each page
    for i in 0..num_pages {
        let _page = file.get_page(i).map_err(|e| {
            ParseError::Parse(format!("Failed to get page {}: {}", i + 1, e))
        })?;

        // PDF text extraction with the pdf crate is limited.
        // For now, we create page-based chapters.
        // Full text extraction would require parsing content streams.
        let page_content = format!("[第 {} 页]", i + 1);

        let start_offset = full_text.len();
        if !full_text.is_empty() {
            full_text.push('\n');
        }
        full_text.push_str(&page_content);
        let end_offset = full_text.len();

        chapters.push(ParsedChapter {
            title: format!("第 {} 页", i + 1),
            level: 1,
            start_offset,
            end_offset,
            char_count: page_content.chars().count(),
            content: page_content,
        });
    }

    let total_chars = full_text.chars().count();

    Ok(ParsedDocument {
        metadata: DocMetadata {
            title,
            author,
            language: "unknown".to_string(),
            total_chars,
            total_chapters: num_pages as usize,
        },
        chapters,
        full_text,
    })
}
