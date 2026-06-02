use crate::parser::{DocMetadata, ParsedChapter, ParsedDocument, ParseError, ParseOptions};
use docx_rs::{DocumentChild, ParagraphChild, RunChild, TableCellContent, TableChild, TableRowChild};

pub fn parse(path: &std::path::Path, _opts: &ParseOptions) -> Result<ParsedDocument, ParseError> {
    let file_bytes = std::fs::read(path)?;

    let docx = docx_rs::read_docx(&file_bytes)
        .map_err(|e| ParseError::Parse(format!("Failed to read DOCX: {}", e)))?;

    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let mut paragraphs: Vec<(String, bool)> = Vec::new(); // (text, is_heading)

    for child in &docx.document.children {
        match child {
            DocumentChild::Paragraph(paragraph) => {
                let text = extract_paragraph_text(paragraph);
                let text = text.trim();
                if text.is_empty() {
                    continue;
                }

                // Detect heading by paragraph style
                let is_heading = paragraph
                    .property
                    .style
                    .as_ref()
                    .map(|s| {
                        let name = s.val.to_lowercase();
                        name.starts_with("heading")
                            || name.starts_with("标题")
                            || name.contains("title")
                            || name.contains("subtitle")
                    })
                    .unwrap_or(false);

                paragraphs.push((text.to_string(), is_heading));
            }
            DocumentChild::Table(table) => {
                // Extract text from table cells
                for TableChild::TableRow(row) in &table.rows {
                    for TableRowChild::TableCell(cell) in &row.cells {
                        for cell_content in &cell.children {
                            if let TableCellContent::Paragraph(p) = cell_content {
                                let text = extract_paragraph_text(p).trim().to_string();
                                if !text.is_empty() {
                                    paragraphs.push((text, false));
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Split into chapters by headings, or treat as single chapter
    let chapters = if paragraphs.iter().any(|(_, is_h)| *is_h) {
        split_by_headings(&paragraphs)
    } else {
        // No headings found — split by a reasonable size (~5000 chars per chapter)
        split_by_size(&paragraphs, 5000)
    };

    let full_text: String = paragraphs.iter().map(|(t, _)| t.as_str()).collect::<Vec<_>>().join("\n");
    let total_chars = full_text.chars().count();

    Ok(ParsedDocument {
        metadata: DocMetadata {
            title,
            author: None,
            language: "unknown".to_string(),
            total_chars,
            total_chapters: chapters.len(),
        },
        chapters,
        full_text,
    })
}

fn extract_paragraph_text(paragraph: &docx_rs::Paragraph) -> String {
    let mut text = String::new();
    for child in &paragraph.children {
        match child {
            ParagraphChild::Run(run) => {
                for rc in &run.children {
                    if let RunChild::Text(t) = rc {
                        text.push_str(&t.text);
                    }
                }
            }
            ParagraphChild::Hyperlink(link) => {
                // Hyperlink children are ParagraphChild, not RunChild
                for link_child in &link.children {
                    if let ParagraphChild::Run(run) = link_child {
                        for rc in &run.children {
                            if let RunChild::Text(t) = rc {
                                text.push_str(&t.text);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    text
}

fn split_by_headings(paragraphs: &[(String, bool)]) -> Vec<ParsedChapter> {
    let mut chapters = Vec::new();
    let mut current_title = "第一章".to_string();
    let mut current_lines: Vec<String> = Vec::new();
    let mut offset = 0usize;

    for (text, is_heading) in paragraphs {
        if *is_heading && !current_lines.is_empty() {
            // Flush previous chapter
            let content = current_lines.join("\n");
            let char_count = content.chars().count();
            chapters.push(ParsedChapter {
                title: current_title.clone(),
                level: 1,
                start_offset: offset,
                end_offset: offset + char_count,
                char_count,
                content,
            });
            offset += char_count + 1; // +1 for newline separator
            current_lines.clear();
            current_title = text.clone();
        } else {
            current_lines.push(text.clone());
        }
    }

    // Flush last chapter
    if !current_lines.is_empty() {
        let content = current_lines.join("\n");
        let char_count = content.chars().count();
        chapters.push(ParsedChapter {
            title: current_title,
            level: 1,
            start_offset: offset,
            end_offset: offset + char_count,
            char_count,
            content,
        });
    }

    chapters
}

fn split_by_size(paragraphs: &[(String, bool)], max_chars: usize) -> Vec<ParsedChapter> {
    let mut chapters = Vec::new();
    let mut current_lines: Vec<String> = Vec::new();
    let mut current_chars = 0usize;
    let mut chapter_num = 1;
    let mut offset = 0usize;

    for (text, _) in paragraphs {
        let text_chars = text.chars().count();
        if current_chars + text_chars > max_chars && !current_lines.is_empty() {
            let content = current_lines.join("\n");
            let content_len = content.len();
            let char_count = content.chars().count();
            chapters.push(ParsedChapter {
                title: format!("第 {} 部分", chapter_num),
                level: 1,
                start_offset: offset,
                end_offset: offset + content_len,
                char_count,
                content,
            });
            offset += content_len + 1;
            chapter_num += 1;
            current_lines.clear();
            current_chars = 0;
        }
        current_lines.push(text.clone());
        current_chars += text_chars;
    }

    if !current_lines.is_empty() {
        let content = current_lines.join("\n");
        let content_len = content.len();
        let char_count = content.chars().count();
        chapters.push(ParsedChapter {
            title: format!("第 {} 部分", chapter_num),
            level: 1,
            start_offset: offset,
            end_offset: offset + content_len,
            char_count,
            content,
        });
    }

    if chapters.is_empty() {
        chapters.push(ParsedChapter {
            title: "全文".to_string(),
            level: 1,
            start_offset: 0,
            end_offset: 0,
            char_count: 0,
            content: String::new(),
        });
    }

    chapters
}
