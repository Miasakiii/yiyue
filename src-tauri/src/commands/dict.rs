use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize)]
pub struct DictResult {
    pub word: String,
    pub phonetic: Option<String>,
    pub meanings: Vec<DictMeaning>,
}

#[derive(Debug, Serialize)]
pub struct DictMeaning {
    pub part_of_speech: String,
    pub definitions: Vec<String>,
}

fn fallback(word: &str, message: &str) -> DictResult {
    DictResult {
        word: word.to_string(),
        phonetic: None,
        meanings: vec![DictMeaning {
            part_of_speech: String::new(),
            definitions: vec![message.to_string()],
        }],
    }
}

/// Look up a word: English via the Free Dictionary API, Chinese via
/// 萌典 (https://www.moedict.tw, open source, no API key required).
#[tauri::command(async)]
pub async fn lookup_word(word: String) -> AppResult<DictResult> {
    let word = word.trim().to_string();
    if word.is_empty() {
        return Err(AppError::InvalidInput("Empty word".to_string()));
    }

    // For very long selections, just take the first 30 chars
    let lookup: String = if word.chars().count() > 30 {
        word.chars().take(30).collect()
    } else {
        word.clone()
    };

    let is_chinese = lookup.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c));

    if is_chinese {
        lookup_chinese(&lookup).await
    } else {
        lookup_english(&lookup).await
    }
}

async fn http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))
}

/// Chinese lookup via 萌典: https://www.moedict.tw/uni/{char}
/// Returns pinyin + definitions for the first character of the selection.
async fn lookup_chinese(word: &str) -> AppResult<DictResult> {
    let first_char = word.chars().next().unwrap().to_string();
    let url = format!(
        "https://www.moedict.tw/uni/{}",
        urlencoding::encode(&first_char)
    );

    let client = http_client().await?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?;

    if !response.status().is_success() {
        return Ok(fallback(word, "未找到释义"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Failed to parse response: {}", e)))?;

    let mut meanings = Vec::new();
    if let Some(heteronyms) = json["heteronyms"].as_array() {
        for h in heteronyms.iter().take(2) {
            let pinyin = h["pinyin"].as_str().unwrap_or("").to_string();
            let mut defs = Vec::new();
            if let Some(defs_arr) = h["definitions"].as_array() {
                for d in defs_arr.iter().take(3) {
                    if let Some(def) = d["def"].as_str() {
                        defs.push(def.to_string());
                    }
                }
            }
            if !defs.is_empty() {
                meanings.push(DictMeaning {
                    part_of_speech: pinyin,
                    definitions: defs,
                });
            }
        }
    }

    if meanings.is_empty() {
        return Ok(fallback(word, "未找到释义"));
    }

    Ok(DictResult {
        word: json["title"].as_str().unwrap_or(word).to_string(),
        phonetic: None,
        meanings,
    })
}

/// English lookup via the Free Dictionary API.
async fn lookup_english(word: &str) -> AppResult<DictResult> {
    let url = format!(
        "https://api.dictionaryapi.dev/api/v2/entries/en/{}",
        urlencoding::encode(word)
    );

    let client = http_client().await?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?;

    if !response.status().is_success() {
        // Word not found — return a fallback
        return Ok(fallback(word, "未找到释义"));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Failed to parse response: {}", e)))?;

    let entries = json
        .as_array()
        .ok_or(AppError::Parse("Invalid response format".to_string()))?;
    if entries.is_empty() {
        return Ok(fallback(word, "未找到释义"));
    }

    let entry = &entries[0];
    let phonetic = entry["phonetic"]
        .as_str()
        .or_else(|| {
            // Try phonetics array
            entry["phonetics"]
                .as_array()
                .and_then(|arr| arr.iter().find_map(|p| p["text"].as_str()))
        })
        .map(|s| s.to_string());

    let mut meanings = Vec::new();
    if let Some(meanings_arr) = entry["meanings"].as_array() {
        for m in meanings_arr.iter().take(3) {
            let pos = m["partOfSpeech"].as_str().unwrap_or("").to_string();
            let mut defs = Vec::new();
            if let Some(defs_arr) = m["definitions"].as_array() {
                for d in defs_arr.iter().take(2) {
                    if let Some(def) = d["definition"].as_str() {
                        defs.push(def.to_string());
                    }
                }
            }
            if !defs.is_empty() {
                meanings.push(DictMeaning {
                    part_of_speech: pos,
                    definitions: defs,
                });
            }
        }
    }

    if meanings.is_empty() {
        meanings.push(DictMeaning {
            part_of_speech: String::new(),
            definitions: vec!["未找到释义".to_string()],
        });
    }

    Ok(DictResult {
        word: entry["word"].as_str().unwrap_or(word).to_string(),
        phonetic,
        meanings,
    })
}
