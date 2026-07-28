//! 错误处理迁移棘轮（ratchet）。
//!
//! 机械统计 `src/` 中旧式字符串错误返回 `Result<T, String>` 的数量，
//! 与 `tests/error_ratchet_baseline.json` 中记录的按文件基线比较：
//! - 任一文件数量上升（或新文件引入旧模式）→ 测试失败，阻止迁移债务增长；
//! - 任一文件数量下降 → 测试失败并提示下调基线，保证基线随迁移进度递减。
//!
//! 完成一批迁移后更新基线：
//!   UPDATE_ERROR_RATCHET=1 cargo test --test error_ratchet
//!
//! 新增 Rust 代码请使用 `error.rs` 中的 `AppResult<T>`（thiserror），
//! 参见 AGENTS.md「thiserror 迁移中」约束。

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn baseline_path() -> PathBuf {
    manifest_dir().join("tests").join("error_ratchet_baseline.json")
}

/// 去掉行内 `//` 注释（不处理字符串字面量，源码解析场景下足够）。
fn strip_line_comment(line: &str) -> &str {
    match line.find("//") {
        Some(idx) => &line[..idx],
        None => line,
    }
}

/// 统计一段源码中 `Result<T, String>`（错误位为 String）的出现次数。
///
/// 用尖括号深度匹配解析泛型参数，支持嵌套（如 `Result<Vec<Book>, String>`）
/// 与跨行签名；`AppResult<T>` 等以标识符结尾的前缀不会被误计。
fn count_string_err_results(source: &str) -> usize {
    let text: String = source
        .lines()
        .map(strip_line_comment)
        .collect::<Vec<_>>()
        .join("\n");
    let bytes = text.as_bytes();
    let needle = b"Result<";
    let mut count = 0;
    let mut i = 0;

    while i + needle.len() <= bytes.len() {
        if &bytes[i..i + needle.len()] != needle {
            i += 1;
            continue;
        }
        // 前一个字符是标识符字符则说明是 AppResult< 等其他类型，跳过
        if i > 0 {
            let prev = bytes[i - 1] as char;
            if prev.is_alphanumeric() || prev == '_' {
                i += needle.len();
                continue;
            }
        }

        // 从 `<` 之后按深度扫描，提取顶层第二个类型参数
        let mut depth = 1usize;
        let mut params: Vec<String> = vec![String::new()];
        let mut j = i + needle.len();
        let mut closed = false;
        while j < bytes.len() {
            let c = bytes[j] as char;
            match c {
                '<' => depth += 1,
                '>' => {
                    depth -= 1;
                    if depth == 0 {
                        closed = true;
                        break;
                    }
                }
                ',' if depth == 1 => {
                    params.push(String::new());
                    j += 1;
                    continue;
                }
                _ => {}
            }
            params.last_mut().unwrap().push(c);
            j += 1;
        }

        if closed && params.len() == 2 && params[1].trim() == "String" {
            count += 1;
        }
        i += needle.len();
    }
    count
}

/// 递归收集 src/ 下所有 .rs 文件的旧模式计数（仅保留非零项）。
/// 键为相对 src/ 的路径，统一使用正斜杠以保证跨平台稳定。
fn collect_counts(dir: &Path, src_root: &Path, counts: &mut BTreeMap<String, usize>) {
    let entries = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("无法读取 {}: {e}", dir.display()));
    for entry in entries {
        let path = entry.expect("读取目录项失败").path();
        if path.is_dir() {
            collect_counts(&path, src_root, counts);
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let content = fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("无法读取 {}: {e}", path.display()));
        let n = count_string_err_results(&content);
        if n > 0 {
            let rel = path
                .strip_prefix(src_root)
                .expect("路径应位于 src/ 下")
                .to_string_lossy()
                .replace('\\', "/");
            counts.insert(rel, n);
        }
    }
}

fn load_baseline() -> BTreeMap<String, usize> {
    let path = baseline_path();
    let content = fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "无法读取基线文件 {}: {e}\n首次生成请运行：UPDATE_ERROR_RATCHET=1 cargo test --test error_ratchet",
            path.display()
        )
    });
    serde_json::from_str(&content)
        .unwrap_or_else(|e| panic!("基线文件 {} 不是合法 JSON: {e}", path.display()))
}

fn write_baseline(counts: &BTreeMap<String, usize>) {
    let json = serde_json::to_string_pretty(counts).expect("序列化基线失败");
    fs::write(baseline_path(), json + "\n").expect("写入基线文件失败");
}

#[test]
fn string_error_returns_do_not_increase() {
    let src_root = manifest_dir().join("src");
    let mut current = BTreeMap::new();
    collect_counts(&src_root, &src_root, &mut current);

    if std::env::var("UPDATE_ERROR_RATCHET").is_ok() {
        write_baseline(&current);
        println!(
            "[error-ratchet] 基线已更新：{} 个文件，共 {} 处旧模式。",
            current.len(),
            current.values().sum::<usize>()
        );
        return;
    }

    let baseline = load_baseline();
    let mut regressions = Vec::new();
    let mut improvements = Vec::new();

    for (file, &n) in &current {
        match baseline.get(file) {
            None => regressions.push(format!("{file}: 0 → {n}（新引入旧模式）")),
            Some(&b) if n > b => regressions.push(format!("{file}: {b} → {n}")),
            Some(&b) if n < b => improvements.push(format!("{file}: {b} → {n}")),
            _ => {}
        }
    }
    for (file, &b) in &baseline {
        if !current.contains_key(file) {
            improvements.push(format!("{file}: {b} → 0"));
        }
    }

    assert!(
        regressions.is_empty(),
        "\n错误处理迁移棘轮失败：旧式 `Result<T, String>` 数量上升。\n\
         新增 Rust 代码请使用 error.rs 中的 AppResult<T>（thiserror），不要继续扩散字符串错误。\n\
         回退的文件:\n  {}\n\
         （当前共 {} 处，基线共 {} 处）",
        regressions.join("\n  "),
        current.values().sum::<usize>(),
        baseline.values().sum::<usize>(),
    );

    assert!(
        improvements.is_empty(),
        "\n错误处理迁移有进展，请下调棘轮基线以固化成果：\n  {}\n\
         运行：UPDATE_ERROR_RATCHET=1 cargo test --test error_ratchet",
        improvements.join("\n  "),
    );
}

#[test]
fn counter_recognizes_known_patterns() {
    // 命中：错误位为 String 的各种形态
    assert_eq!(count_string_err_results("fn a() -> Result<(), String> {}"), 1);
    assert_eq!(
        count_string_err_results("fn b() -> Result<Vec<Book>, String> {}"),
        1
    );
    assert_eq!(
        count_string_err_results("fn c() -> Result<Option<Vec<u8>>, String> {}"),
        1
    );
    assert_eq!(
        count_string_err_results("move || -> Result<usize,\n    String> { Ok(0) }"),
        1
    );
    // 不命中：AppResult、错误位非 String、Ok 位 String、注释中的旧模式
    assert_eq!(count_string_err_results("fn d() -> AppResult<String> {}"), 0);
    assert_eq!(
        count_string_err_results("fn e() -> Result<(), AppError> {}"),
        0
    );
    assert_eq!(count_string_err_results("fn f() -> Result<String, AppError> {}"), 0);
    assert_eq!(
        count_string_err_results("// fn g() -> Result<(), String> {}"),
        0
    );
    assert_eq!(
        count_string_err_results("let m: HashMap<String, String> = HashMap::new();"),
        0
    );
}
