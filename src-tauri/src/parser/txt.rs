use super::{DocMetadata, ParsedChapter, ParsedDocument, ParseError, ParseOptions};
use std::fs;
use std::path::Path;

/// Detect encoding of raw bytes using BOM, then chardetng fallback.
fn detect_encoding(raw: &[u8]) -> &'static encoding_rs::Encoding {
    // Check BOM first
    if raw.len() >= 3 && raw[0] == 0xEF && raw[1] == 0xBB && raw[2] == 0xBF {
        return encoding_rs::UTF_8;
    }
    if raw.len() >= 2 {
        if raw[0] == 0xFF && raw[1] == 0xFE {
            return encoding_rs::UTF_16LE;
        }
        if raw[0] == 0xFE && raw[1] == 0xFF {
            return encoding_rs::UTF_16BE;
        }
    }

    // Use chardetng for detection
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(raw, true);
    detector.guess(None, true)
}

/// Decode raw bytes to UTF-8 string using detected or specified encoding.
fn decode_text(raw: &[u8], forced_encoding: Option<&str>) -> Result<String, ParseError> {
    let encoding = if let Some(enc_name) = forced_encoding {
        encoding_rs::Encoding::for_label(enc_name.as_bytes())
            .ok_or(ParseError::EncodingDetectionFailed)?
    } else {
        detect_encoding(raw)
    };

    let (decoded, _encoding_used, had_errors) = encoding.decode(raw);
    if had_errors {
        // Log warning but continue — partial decode is better than nothing
        eprintln!("Warning: some characters could not be decoded");
    }

    Ok(decoded.into_owned())
}

/// Extract a title from the filename.
fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

/// Detect chapter boundaries using common patterns.
fn detect_chapters(text: &str) -> Vec<ParsedChapter> {
    use regex::Regex;

    // Common chapter patterns
    let patterns = vec![
        r"(?m)^第[一二三四五六七八九十百千零\d]+[章节回卷集部篇].*$",
        r"(?m)^Chapter\s+\d+.*$",
        r"(?m)^CHAPTER\s+\d+.*$",
        r"(?m)^\d+[.、]\s*\S.*$",
    ];

    let mut matches: Vec<(usize, &str)> = Vec::new();

    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            for mat in re.find_iter(text) {
                let line = mat.as_str().trim();
                if line.len() < 100 {
                    // Chapter titles are typically short
                    matches.push((mat.start(), line));
                }
            }
        }
        if !matches.is_empty() {
            break;
        }
    }

    // Sort by position and deduplicate
    matches.sort_by_key(|m| m.0);
    matches.dedup_by_key(|m| m.0);

    if matches.is_empty() {
        // No chapters detected — treat entire text as one chapter
        let char_count = text.chars().count();
        return vec![ParsedChapter {
            title: "全文".to_string(),
            level: 1,
            start_offset: 0,
            end_offset: char_count,
            char_count,
            content: text.to_string(),
        }];
    }

    let mut chapters = Vec::new();

    // Content before first chapter (prologue)
    if matches[0].0 > 0 {
        let prologue = &text[..matches[0].0];
        let trimmed = prologue.trim();
        if !trimmed.is_empty() && trimmed.chars().count() > 50 {
            let char_count = trimmed.chars().count();
            chapters.push(ParsedChapter {
                title: "前言".to_string(),
                level: 1,
                start_offset: 0,
                end_offset: char_count,
                char_count,
                content: trimmed.to_string(),
            });
        }
    }

    // Build chapters from matches
    for (i, (pos, title)) in matches.iter().enumerate() {
        let start = *pos;
        let end = if i + 1 < matches.len() {
            matches[i + 1].0
        } else {
            text.len()
        };

        let content = text[start..end].trim();
        if content.is_empty() {
            continue;
        }

        let char_count = content.chars().count();

        // Skip very short chapters (< 50 chars) — merge with previous
        if char_count < 50 && !chapters.is_empty() {
            if let Some(prev) = chapters.last_mut() {
                prev.content = format!("{}\n\n{}", prev.content, content);
                prev.end_offset += char_count;
                prev.char_count += char_count + 2;
            }
            continue;
        }

        chapters.push(ParsedChapter {
            title: title.to_string(),
            level: 1,
            start_offset: char_count, // will be recalculated if needed
            end_offset: char_count,
            char_count,
            content: content.to_string(),
        });
    }

    if chapters.is_empty() {
        let char_count = text.chars().count();
        chapters.push(ParsedChapter {
            title: "全文".to_string(),
            level: 1,
            start_offset: 0,
            end_offset: char_count,
            char_count,
            content: text.to_string(),
        });
    }

    chapters
}

/// Public wrapper for detect_chapters, used by the import flow to re-chapter cleaned text.
pub fn detect_chapters_from_text(text: &str) -> Vec<ParsedChapter> {
    let mut chapters = detect_chapters(text);
    let mut offset = 0;
    for ch in &mut chapters {
        ch.start_offset = offset;
        offset += ch.char_count;
        ch.end_offset = offset;
    }
    chapters
}

/// Parse a TXT file into a structured document.
pub fn parse(file_path: &Path, options: &ParseOptions) -> Result<ParsedDocument, ParseError> {
    let raw = fs::read(file_path)?;
    let text = decode_text(&raw, options.encoding.as_deref())?;
    let title = title_from_path(file_path);

    let mut chapters = detect_chapters(&text);
    let total_chars = text.chars().count();

    // Assign proper offsets
    let mut offset = 0;
    for ch in &mut chapters {
        ch.start_offset = offset;
        offset += ch.char_count;
        ch.end_offset = offset;
    }

    let total_chapters = chapters.len();

    Ok(ParsedDocument {
        metadata: DocMetadata {
            title,
            author: None,
            language: "zh".to_string(),
            total_chars,
            total_chapters,
        },
        chapters,
        full_text: text,
    })
}
