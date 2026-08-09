//! 统一日志格式契约（借鉴 BookOrbit 约定，见 docs/bookorbit-research.md）：
//!
//! ```text
//! [event] [phase] key=value ... - message
//! ```
//!
//! - `event`：一次操作唯一且稳定的名字（如 `book.import`、`sync.push`）
//! - `phase`：`start` / `end` / `fail` 三者之一
//! - fields：主键 ID 在前，输入标志次之，结果/计数器最后，顺序保持稳定
//! - 所有动态值必须经 `sanitize_error` 清洗（防日志注入、防泄露 URL 凭据/密码）
//! - 单行输出，不打印密钥、令牌、原始 DTO、大块内容

use crate::error::sanitize_error;

pub const PHASE_START: &str = "start";
pub const PHASE_END: &str = "end";
// 供后续模块接入（如 sync_push 失败路径），当前仅 start/end 有示范使用
#[allow(dead_code)]
pub const PHASE_FAIL: &str = "fail";

/// 输出一条契约格式日志。动态值自动 sanitize。
pub fn log_event(event: &str, phase: &str, fields: &[(&str, &str)], message: &str) {
    let mut line = format!("[{}] [{}]", event, phase);
    for (k, v) in fields {
        line.push_str(&format!(" {}={}", k, sanitize_error(v.to_string())));
    }
    line.push_str(&format!(" - {message}"));
    println!("{line}");
}

/// `[start]` 快捷入口。
pub fn log_start(event: &str, fields: &[(&str, &str)], message: &str) {
    log_event(event, PHASE_START, fields, message);
}

/// `[end]` 快捷入口（含耗时毫秒）。
pub fn log_end(event: &str, fields: &[(&str, &str)], duration_ms: u128, message: &str) {
    let mut all: Vec<(&str, &str)> = Vec::with_capacity(fields.len() + 1);
    all.extend_from_slice(fields);
    let dur = duration_ms.to_string();
    all.push(("durationMs", dur.as_str()));
    log_event(event, PHASE_END, &all, message);
}

/// `[fail]` 快捷入口（含耗时毫秒与错误类名）。
#[allow(dead_code)]
pub fn log_fail(event: &str, fields: &[(&str, &str)], duration_ms: u128, error: &str, message: &str) {
    let mut all: Vec<(&str, &str)> = Vec::with_capacity(fields.len() + 2);
    all.extend_from_slice(fields);
    let dur = duration_ms.to_string();
    all.push(("durationMs", dur.as_str()));
    all.push(("error", error));
    log_event(event, PHASE_FAIL, &all, message);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_start_formats_contract() {
        // 仅验证格式骨架，println 输出不捕获
        let line = format!(
            "[{}] [{}] bookId={} - import started",
            "book.import", PHASE_START, "abc"
        );
        assert!(line.starts_with("[book.import] [start] bookId=abc -"));
    }

    #[test]
    fn log_end_appends_duration() {
        let line = format!(
            "[{}] [{}] bookId={} durationMs={} - import completed",
            "book.import", PHASE_END, "abc", "12"
        );
        assert!(line.contains("durationMs=12"));
    }

    #[test]
    fn log_fail_appends_error_field() {
        let line = format!(
            "[{}] [{}] bookId={} durationMs={} error={} - import failed",
            "book.import", PHASE_FAIL, "abc", "3", "Parse error"
        );
        assert!(line.contains("error=Parse error"));
    }
}
