//! Calibre 桥接（PLAN 3.4.4）：
//! 检测本机 Calibre 的 `ebook-convert` 可执行文件，用其做格式转换
//! （把 azw3/mobi/azw/rtf 等一页不直接支持的格式转成 txt/epub 后导入）。
//! 不内置转换能力，而是桥接 Calibre 命令行（与 FUTURE 5.3.3 思路一致）。

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Serialize)]
pub struct CalibreStatus {
    pub available: bool,
    /// ebook-convert 可执行文件路径
    pub path: Option<String>,
    pub version: Option<String>,
}

/// 常见安装路径（Windows / macOS / Linux）。
const COMMON_PATHS: &[&str] = &[
    "C:\\Program Files\\Calibre2\\ebook-convert.exe",
    "C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe",
    "/Applications/calibre.app/Contents/MacOS/ebook-convert",
    "/usr/bin/ebook-convert",
    "/usr/local/bin/ebook-convert",
];

/// 在 PATH 中查找可执行文件（Windows 按 PATHEXT 补后缀）。
fn find_in_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .map(|p| p.split(';').map(|s| s.to_lowercase()).collect())
            .unwrap_or_else(|_| vec![".exe".to_string(), ".cmd".to_string(), ".bat".to_string()])
    } else {
        vec![String::new()]
    };
    for dir in std::env::split_paths(&path_var) {
        for ext in &exts {
            let candidate = dir.join(format!("{}{}", name, ext));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// IPC：检测本机 Calibre ebook-convert 可用性。
#[tauri::command]
pub fn detect_calibre() -> AppResult<CalibreStatus> {
    let mut found: Option<PathBuf> = None;

    // 1) 显式环境变量
    if let Ok(p) = std::env::var("CALIBRE_PATH") {
        let p = PathBuf::from(p);
        if p.is_file() {
            found = Some(p);
        }
    }
    // 2) PATH
    if found.is_none() {
        found = find_in_path("ebook-convert");
    }
    // 3) 常见安装路径
    if found.is_none() {
        found = COMMON_PATHS.iter().map(PathBuf::from).find(|p| p.is_file());
    }

    let Some(path) = found else {
        return Ok(CalibreStatus { available: false, path: None, version: None });
    };

    let version = std::process::Command::new(&path)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        });

    Ok(CalibreStatus {
        available: true,
        path: Some(path.to_string_lossy().to_string()),
        version,
    })
}

/// IPC：用 ebook-convert 转换文件到 `library/calibre_tmp/`，返回输出路径。
/// 目标格式白名单：txt / epub（转换在阻塞线程执行，避免卡命令线程池）。
#[tauri::command(async)]
pub async fn convert_book(
    app: AppHandle,
    ebook_convert_path: String,
    input_path: String,
    output_format: String,
) -> AppResult<String> {
    let format = output_format.to_lowercase();
    if format != "txt" && format != "epub" {
        return Err(AppError::InvalidInput(format!(
            "仅支持转换到 txt / epub，收到: {}",
            format
        )));
    }
    let input = PathBuf::from(&input_path);
    if !input.is_file() {
        return Err(AppError::NotFound("输入文件不存在".to_string()));
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::Internal("Failed to resolve app data dir".to_string()))?;
    let out_dir = data_dir.join("library").join("calibre_tmp");
    std::fs::create_dir_all(&out_dir).map_err(AppError::Io)?;
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("converted");
    let out_path = out_dir.join(format!("{}.{}", stem, format));

    let conv = ebook_convert_path.clone();
    let input_clone = input_path.clone();
    let out_clone = out_path.to_string_lossy().to_string();
    let out_clone_task = out_clone.clone();
    let out_path_check = out_path.clone();
    // 转换可能耗时数十秒，放到阻塞线程池
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(&conv)
            .args([&input_clone, &out_clone_task])
            .output()
    })
    .await
    .map_err(|e| AppError::Internal(format!("转换任务异常: {}", e)))?;

    match result {
        Ok(o) if o.status.success() && out_path_check.is_file() => Ok(out_clone),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            let tail: String = stderr.chars().take(300).collect();
            Err(AppError::Internal(format!(
                "Calibre 转换失败（是否缺少依赖？）: {}",
                if tail.trim().is_empty() { "无输出".to_string() } else { tail }
            )))
        }
        Err(e) => Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("无法启动 ebook-convert: {}", e),
        ))),
    }
}
