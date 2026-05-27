use jieba_rs::Jieba;
use std::sync::OnceLock;

static JIEBA: OnceLock<Jieba> = OnceLock::new();

fn get_jieba() -> &'static Jieba {
    JIEBA.get_or_init(|| Jieba::new())
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
