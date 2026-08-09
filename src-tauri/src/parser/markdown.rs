use crate::parser::{DocMetadata, ParsedChapter, ParsedDocument, ParseError, ParseOptions};
use pulldown_cmark::{html, Options, Parser};
use std::fs;

pub fn parse(path: &std::path::Path, _opts: &ParseOptions) -> Result<ParsedDocument, ParseError> {
    let content = fs::read_to_string(path).map_err(ParseError::Io)?;

    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    // Split by headings using line-based detection
    let lines: Vec<&str> = content.lines().collect();
    let mut chapters = Vec::new();
    let mut current_title = title.clone();
    let mut current_content = String::new();
    let mut chapter_start = 0;

    for (i, line) in lines.iter().enumerate() {
        if line.starts_with("# ") && !line.starts_with("## ") {
            // H1 - new chapter
            if !current_content.is_empty() || chapters.is_empty() {
                if !current_content.is_empty() {
                    let html_content = render_markdown(&current_content);
                    chapters.push(ParsedChapter {
                        title: current_title.clone(),
                        level: 1,
                        start_offset: chapter_start,
                        end_offset: chapter_start + current_content.len(),
                        char_count: current_content.chars().count(),
                        content: html_content,
                    });
                }
                current_title = line.trim_start_matches("# ").trim().to_string();
                current_content.clear();
                chapter_start = content.lines().take(i).map(|l| l.len() + 1).sum();
            }
        } else if line.starts_with("## ") && !line.starts_with("### ") {
            // H2 - sub-chapter, but we treat it as part of current content
            // unless we haven't found any H1 yet
            if chapters.is_empty() && !current_content.is_empty() {
                let html_content = render_markdown(&current_content);
                chapters.push(ParsedChapter {
                    title: current_title.clone(),
                    level: 1,
                    start_offset: chapter_start,
                    end_offset: chapter_start + current_content.len(),
                    char_count: current_content.chars().count(),
                    content: html_content,
                });
                current_title = line.trim_start_matches("## ").trim().to_string();
                current_content.clear();
                chapter_start = content.lines().take(i).map(|l| l.len() + 1).sum();
            }
        }

        current_content.push_str(line);
        current_content.push('\n');
    }

    // Add the last chapter
    if !current_content.is_empty() {
        let html_content = render_markdown(&current_content);
        chapters.push(ParsedChapter {
            title: current_title,
            level: 1,
            start_offset: chapter_start,
            end_offset: content.len(),
            char_count: current_content.chars().count(),
            content: html_content,
        });
    }

    // If no chapters were detected, create one from the whole file
    if chapters.is_empty() {
        let html_content = render_markdown(&content);
        chapters.push(ParsedChapter {
            title,
            level: 1,
            start_offset: 0,
            end_offset: content.len(),
            char_count: content.chars().count(),
            content: html_content,
        });
    }

    let total_chars = content.chars().count();
    let total_chapters = chapters.len();

    Ok(ParsedDocument {
        metadata: DocMetadata {
            title: path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string(),
            author: None,
            language: "unknown".to_string(),
            total_chars,
            total_chapters,
        },
        chapters,
        full_text: content,
    })
}

fn render_markdown(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_markdown() {
        let md = "# Hello\n\nWorld **bold**";
        let html = render_markdown(md);
        assert!(html.contains("<h1>"));
        assert!(html.contains("<strong>"));
    }

    #[test]
    fn test_parse_splits_h1_chapters() {
        // TEST_CHECKLIST 1 Markdown-按 # 标题切分章节
        let dir = std::env::temp_dir().join(format!("yiyue-md-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("book.md");
        std::fs::write(
            &path,
            "# 第一章

这是第一章内容。

# 第二章

这是第二章内容。
",
        )
        .unwrap();
        let doc = super::parse(
            &path,
            &ParseOptions { encoding: None, chapter_pattern: None },
        )
        .unwrap();
        assert_eq!(doc.metadata.total_chapters, 2);
        assert_eq!(doc.chapters[0].title, "第一章");
        assert!(doc.chapters[0].content.contains("第一章内容"));
        assert_eq!(doc.chapters[1].title, "第二章");
        assert!(doc.chapters[1].content.contains("第二章内容"));
        std::fs::remove_dir_all(&dir).ok();
    }

}
