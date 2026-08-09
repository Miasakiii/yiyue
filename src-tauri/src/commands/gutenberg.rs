//! 免费书源接入（PLAN 3.4.3）：
//! 古腾堡计划（Project Gutenberg）公版书搜索与下载。
//! - 搜索：Gutendex API（https://gutendex.com，免费无 key）
//! - 下载：gutenberg.org 官方 txt/epub 链接（302 重定向跟随）
//! 以英文公版书为主；下载文件存临时目录，由前端调 importBook 导入。

use crate::error::{AppError, AppResult};
use serde::Serialize;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct GutenbergBook {
    pub id: i64,
    pub title: String,
    pub authors: Vec<String>,
    pub language: String,
    /// text/plain 下载链接（utf-8 优先）
    pub txt_url: Option<String>,
    /// epub 下载链接
    pub epub_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GutenbergSearchResult {
    pub total: i64,
    pub books: Vec<GutenbergBook>,
}

/// 从 Gutendex formats 映射中挑选下载链接。
fn pick_urls(formats: &serde_json::Value) -> (Option<String>, Option<String>) {
    let Some(map) = formats.as_object() else {
        return (None, None);
    };
    let mut txt = None;
    for (k, v) in map {
        let url = v.as_str().unwrap_or_default();
        if k.starts_with("text/plain") {
            if txt.is_none() || k.contains("utf-8") {
                txt = Some(url.to_string());
            }
        }
    }
    let epub = map
        .get("application/epub+zip")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    (txt, epub)
}

/// IPC：按关键词搜索古腾堡书库（Gutendex，上限 25 条）。
#[tauri::command(async)]
pub async fn search_gutenberg(query: String) -> AppResult<GutenbergSearchResult> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err(AppError::InvalidInput("搜索词为空".to_string()));
    }
    let url = format!(
        "https://gutendex.com/books?search={}",
        urlencoding::encode(&query)
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("yiyue-reader/0.1")
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!(
            "Gutendex 请求失败: {}",
            resp.status()
        )));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Failed to parse response: {}", e)))?;

    let total = json["count"].as_i64().unwrap_or(0);
    let mut books = Vec::new();
    if let Some(results) = json["results"].as_array() {
        for r in results.iter().take(25) {
            let authors: Vec<String> = r["authors"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x["name"].as_str())
                        .map(|s| s.to_string())
                        .collect()
                })
                .unwrap_or_default();
            let language = r["languages"]
                .as_array()
                .and_then(|l| l.first())
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let (txt_url, epub_url) = pick_urls(&r["formats"]);
            if txt_url.is_none() && epub_url.is_none() {
                continue;
            }
            books.push(GutenbergBook {
                id: r["id"].as_i64().unwrap_or(0),
                title: r["title"].as_str().unwrap_or("").to_string(),
                authors,
                language,
                txt_url,
                epub_url,
            });
        }
    }
    Ok(GutenbergSearchResult { total, books })
}

/// IPC：下载古腾堡书籍到临时目录，返回本地文件路径（供 importBook 导入）。
#[tauri::command(async)]
pub async fn download_gutenberg_book(
    app: AppHandle,
    url: String,
    filename: String,
) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("yiyue-reader/0.1")
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!("Network error: {}", e)))?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!(
            "下载失败: {}",
            resp.status()
        )));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Network(format!("读取响应失败: {}", e)))?;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::Internal("Failed to resolve app data dir".to_string()))?;
    let tmp_dir = data_dir.join("library").join("gutenberg_tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(AppError::Io)?;
    let safe_name: String = filename
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let path = tmp_dir.join(safe_name);
    std::fs::write(&path, &bytes).map_err(AppError::Io)?;
    Ok(path.to_string_lossy().to_string())
}
