use jieba_rs::Jieba;
use std::sync::OnceLock;

static JIEBA: OnceLock<Jieba> = OnceLock::new();

fn get_jieba() -> &'static Jieba {
    JIEBA.get_or_init(|| Jieba::new())
}

/// Check if a query string is likely pinyin input (ASCII letters/digits/spaces only).
pub fn is_pinyin_query(query: &str) -> bool {
    if query.trim().is_empty() {
        return false;
    }
    // If it contains any Chinese character, it's not pure pinyin input.
    // We treat it as pinyin only when it's entirely ASCII (letters, digits, spaces).
    !query.chars().any(|c| {
        // CJK Unified Ideographs
        (c >= '\u{4e00}' && c <= '\u{9fff}')
            // CJK Extension A/B
            || (c >= '\u{3400}' && c <= '\u{4dbf}')
            // Fullwidth ASCII
            || (c >= '\u{ff00}' && c <= '\u{ffef}')
    })
}

/// Convert a string to continuous pinyin abbreviation.
/// e.g. "中国" -> "zhongguo", "Hello世界" -> "helloshijie"
/// Non-Chinese characters are preserved as-is (lowercased).
pub fn to_pinyin_abbr(text: &str) -> String {
    let args = pinyin::Args::new(); // Style::Normal: plain pinyin without tone marks
    let mut result = String::new();
    for c in text.chars() {
        if c.is_ascii_alphanumeric() || c.is_whitespace() || c.is_ascii_punctuation() {
            result.push(c.to_ascii_lowercase());
        } else {
            let mut buf = [0u8; 4];
            let readings = pinyin::pinyin(c.encode_utf8(&mut buf), &args);
            if let Some(first) = readings.into_iter().next().and_then(|v| v.into_iter().next()) {
                result.push_str(&first);
            }
        }
        // Characters without pinyin representation are skipped
    }
    result
}

/// Tokenize text using jieba for FTS5 indexing.
/// Splits Chinese text into words separated by spaces.
pub fn tokenize(text: &str) -> String {
    let jieba = get_jieba();
    let tokens = jieba.cut(text, false);
    tokens
        .iter()
        .map(|t| t.word)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Tokenize a search query. Same as tokenize but also handles
/// mixed Chinese/English input.
pub fn tokenize_query(query: &str) -> String {
    let jieba = get_jieba();
    let tokens = jieba.cut(query, false);
    tokens
        .iter()
        .map(|t| t.word)
        .filter(|w| !w.trim().is_empty())
        .map(|w| {
            // Wrap each token in quotes for exact matching in FTS5
            if w.chars().any(|c| c.is_ascii_alphanumeric()) {
                w.to_string()
            } else {
                format!("\"{}\"", w)
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_chinese() {
        let result = tokenize("今天天气真好");
        assert!(!result.is_empty());
        // Should contain spaces between words
        assert!(result.contains(' '));
    }

    #[test]
    fn test_tokenize_mixed() {
        let result = tokenize("Hello世界");
        assert!(result.contains("Hello"));
    }
}
