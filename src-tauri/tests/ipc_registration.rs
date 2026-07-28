//! IPC 命令成对注册校验。
//!
//! 机械检查 `src/commands/*.rs` 中所有 `#[tauri::command]` 导出的命令
//! 与 `src/lib.rs` 中 `generate_handler![...]` 注册清单一一对应。
//! 任意一侧缺失即测试失败，并报出缺失的命令名。

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// 去掉行内 `//` 注释（不处理字符串字面量，源码解析场景下足够）。
fn strip_line_comment(line: &str) -> &str {
    match line.find("//") {
        Some(idx) => &line[..idx],
        None => line,
    }
}

/// 扫描 src/commands/ 下所有模块，收集 `#[tauri::command]` 标注的函数名。
fn collect_defined_commands(commands_dir: &Path) -> BTreeSet<String> {
    let mut defined = BTreeSet::new();
    let entries = fs::read_dir(commands_dir).expect("无法读取 src/commands 目录");

    for entry in entries {
        let path = entry.expect("读取目录项失败").path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        if path.file_name().and_then(|n| n.to_str()) == Some("mod.rs") {
            continue;
        }

        let content = fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("无法读取 {}: {e}", path.display()));
        let lines: Vec<&str> = content.lines().collect();

        for (i, line) in lines.iter().enumerate() {
            let code = strip_line_comment(line).trim();
            // 匹配 #[tauri::command] 与 #[tauri::command(async)] 等变体
            if !code.starts_with("#[tauri::command") {
                continue;
            }
            // 向后找最近的 fn 声明行，提取函数名
            for follow in lines.iter().skip(i + 1) {
                let code = strip_line_comment(follow).trim();
                if let Some(pos) = code.find("fn ") {
                    let rest = &code[pos + 3..];
                    let name: String = rest
                        .chars()
                        .take_while(|c| c.is_alphanumeric() || *c == '_')
                        .collect();
                    assert!(
                        !name.is_empty(),
                        "在 {} 中 #[tauri::command] 后未能解析出函数名",
                        path.display()
                    );
                    defined.insert(name);
                    break;
                }
            }
        }
    }
    defined
}

/// 解析 src/lib.rs 中 generate_handler![...] 注册清单，收集命令名（路径末段）。
fn collect_registered_commands(lib_rs: &Path) -> BTreeSet<String> {
    let content = fs::read_to_string(lib_rs)
        .unwrap_or_else(|e| panic!("无法读取 {}: {e}", lib_rs.display()));

    let start = content
        .find("generate_handler![")
        .expect("src/lib.rs 中未找到 generate_handler![");
    let body_start = start + "generate_handler![".len();
    let body_end = content[body_start..]
        .find(']')
        .map(|i| body_start + i)
        .expect("generate_handler! 宏未正确闭合");
    let body = &content[body_start..body_end];

    let mut registered = BTreeSet::new();
    for line in body.lines() {
        let code = strip_line_comment(line).trim();
        for entry in code.split(',') {
            let entry = entry.trim();
            if entry.is_empty() {
                continue;
            }
            let name = entry.rsplit("::").next().unwrap_or(entry).trim();
            if !name.is_empty() {
                registered.insert(name.to_string());
            }
        }
    }
    registered
}

#[test]
fn ipc_commands_registered_pairwise() {
    let root = manifest_dir();
    let defined = collect_defined_commands(&root.join("src").join("commands"));
    let registered = collect_registered_commands(&root.join("src").join("lib.rs"));

    assert!(!defined.is_empty(), "未扫描到任何 #[tauri::command]，解析逻辑可能失效");
    assert!(!registered.is_empty(), "未解析到任何注册项，解析逻辑可能失效");

    let missing_registration: Vec<&String> =
        defined.difference(&registered).collect();
    let missing_definition: Vec<&String> =
        registered.difference(&defined).collect();

    let mut errors = String::new();
    if !missing_registration.is_empty() {
        errors.push_str(&format!(
            "\n以下命令已用 #[tauri::command] 导出，但未在 lib.rs 的 generate_handler![...] 中注册（前端 invoke 会静默失败）:\n  {}\n",
            missing_registration
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join("\n  ")
        ));
    }
    if !missing_definition.is_empty() {
        errors.push_str(&format!(
            "\n以下命令已在 generate_handler![...] 中注册，但在 src/commands/ 中找不到对应的 #[tauri::command] 定义:\n  {}\n",
            missing_definition
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join("\n  ")
        ));
    }

    assert!(
        errors.is_empty(),
        "IPC 命令成对注册校验失败:{errors}\n已定义 {} 个命令，已注册 {} 个命令。",
        defined.len(),
        registered.len()
    );
}
