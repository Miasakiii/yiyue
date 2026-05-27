use super::{DocMetadata, ParsedChapter, ParsedDocument, ParseError, ParseOptions};
use epub::doc::EpubDoc;
use std::path::Path;

/// Parse an EPUB file into a structured document.
pub fn parse(file_path: &Path, _options: &ParseOptions) -> Result<ParsedDocument, ParseError> {
    let mut doc = EpubDoc::new(file_path)
        .map_err(|e| ParseError::Parse(format!("Failed to open EPUB: {}", e)))?;

    // Extract metadata
    let title = doc
        .mdata("title")
        .map(|m| m.value.clone())
        .unwrap_or_else(|| {
            file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string()
        });

    let author = doc.mdata("creator").map(|m| m.value.clone());
    let language = doc
        .mdata("language")
        .map(|m| m.value.clone())
        .unwrap_or_else(|| "zh".to_string());

    // Extract chapters from spine
    let spine: Vec<String> = doc.spine.iter().map(|s| s.idref.clone()).collect();
    let mut chapters = Vec::new();

    for (i, item_id) in spine.iter().enumerate() {
        if let Some((content, _mime)) = doc.get_resource_str(item_id) {
            let text = strip_html(&content);
            let trimmed = text.trim();

            if trimmed.is_empty() {
                continue;
            }

            let chapter_title = extract_title_from_html(&content)
                .unwrap_or_else(|| format!("Chapter {}", i + 1));

            let char_count = trimmed.chars().count();

            chapters.push(ParsedChapter {
                title: chapter_title,
                level: 1,
                start_offset: 0,
                end_offset: 0,
                char_count,
                content: trimmed.to_string(),
            });
        }
    }

    if chapters.is_empty() {
        return Err(ParseError::Parse("No content found in EPUB".to_string()));
    }

    // Recalculate offsets
    let mut offset = 0;
    for ch in &mut chapters {
        ch.start_offset = offset;
        offset += ch.char_count;
        ch.end_offset = offset;
    }

    let total_chars = chapters.iter().map(|c| c.char_count).sum();
    let total_chapters = chapters.len();

    let full_text: String = chapters
        .iter()
        .map(|c| c.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(ParsedDocument {
        metadata: DocMetadata {
            title,
            author,
            language,
            total_chars,
            total_chapters,
        },
        chapters,
        full_text,
    })
}

/// Strip HTML tags, preserving text content.
fn strip_html(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut in_entity = false;
    let mut entity_buf = String::new();

    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                result.push('\n');
            }
            '&' if !in_tag => {
                in_entity = true;
                entity_buf.clear();
                entity_buf.push(ch);
            }
            ';' if in_entity => {
                in_entity = false;
                entity_buf.push(ch);
                match entity_buf.as_str() {
                    "&amp;" => result.push('&'),
                    "&lt;" => result.push('<'),
                    "&gt;" => result.push('>'),
                    "&quot;" => result.push('"'),
                    "&apos;" => result.push('\''),
                    "&nbsp;" => result.push(' '),
                    "&mdash;" => result.push('\u{2014}'),
                    "&ndash;" => result.push('\u{2013}'),
                    "&hellip;" => result.push('\u{2026}'),
                    _ => result.push_str(&entity_buf),
                }
            }
            _ if in_entity => entity_buf.push(ch),
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }

    result
}

/// Extract title from HTML (first h1-h3).
fn extract_title_from_html(html: &str) -> Option<String> {
    for tag in &["h1", "h2", "h3"] {
        let start_pattern = format!("<{}", tag);
        if let Some(start_idx) = html.find(&start_pattern) {
            let after_tag = &html[start_idx + start_pattern.len()..];
            if let Some(close_bracket) = after_tag.find('>') {
                let content_start = close_bracket + 1;
                let end_pattern = format!("</{}>", tag);
                if let Some(end_idx) = after_tag.find(&end_pattern) {
                    let title = after_tag[content_start..end_idx].trim();
                    let title = strip_html(title);
                    let title = title.trim();
                    if !title.is_empty() && title.len() < 200 {
                        return Some(title.to_string());
                    }
                }
            }
        }
    }
    None
}
