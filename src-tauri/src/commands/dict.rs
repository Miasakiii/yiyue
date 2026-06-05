use serde::Serialize;

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

/// Look up a word using the Free Dictionary API.
/// Falls back to a simple result for Chinese text.
#[tauri::command(async)]
pub async fn lookup_word(word: String) -> Result<DictResult, String> {
    let word = word.trim().to_string();
    if word.is_empty() {
        return Err("Empty word".to_string());
    }

    // For very long selections, just take the first "word"
    let lookup: String = if word.chars().count() > 30 {
        word.chars().take(30).collect()
    } else {
        word.clone()
    };

    // Check if the text is primarily Chinese
    let is_chinese = lookup.chars().any(|c| c >= '\u{4e00}' && c <= '\u{9fff}');

    if is_chinese {
        // For Chinese text, return a simple result with the text itself
        return Ok(DictResult {
            word: lookup,
            phonetic: None,
            meanings: vec![DictMeaning {
                part_of_speech: "中文".to_string(),
                definitions: vec!["选中的中文文本".to_string()],
            }],
        });
    }

    // Try the Free Dictionary API for English words
    let url = format!(
        "https://api.dictionaryapi.dev/api/v2/entries/en/{}",
        urlencoding::encode(&lookup)
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        // Word not found — return a fallback
        return Ok(DictResult {
            word: lookup,
            phonetic: None,
            meanings: vec![DictMeaning {
                part_of_speech: String::new(),
                definitions: vec!["未找到释义".to_string()],
            }],
        });
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Parse the Free Dictionary API response
    let entries = json.as_array().ok_or("Invalid response format")?;
    if entries.is_empty() {
        return Ok(DictResult {
            word: lookup,
            phonetic: None,
            meanings: vec![DictMeaning {
                part_of_speech: String::new(),
                definitions: vec!["未找到释义".to_string()],
            }],
        });
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
            let pos = m["partOfSpeech"]
                .as_str()
                .unwrap_or("")
                .to_string();
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
        word: entry["word"]
            .as_str()
            .unwrap_or(&lookup)
            .to_string(),
        phonetic,
        meanings,
    })
}
