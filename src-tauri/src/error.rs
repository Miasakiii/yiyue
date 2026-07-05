/// Utility functions for safe error handling.
///
/// # Security Note
///
/// Rust backends should never expose raw file-system paths, database internals,
/// or stack traces to the frontend. Use `sanitize_error` before returning any
/// error string to the UI, or prefer `DbError` / structured error types that
/// already mask sensitive details.

/// Strip common path patterns from error messages to avoid leaking
/// internal file-system layout to the frontend.
pub fn sanitize_error(msg: impl Into<String>) -> String {
    let msg = msg.into();
    // If the message contains a known app-data or cache path, replace it
    // with a generic placeholder.
    // This is a best-effort filter; structured error types (e.g. `DbError`)
    // should be preferred for new code.
    if msg.contains(":\\") || msg.contains("\\\\?\\") || msg.contains("/tmp") {
        return "An internal error occurred".to_string();
    }
    msg
}

/// Convenience wrapper that applies `sanitize_error` to a `Result`'s error.
#[allow(dead_code)]
pub fn safe_err<T, E: ToString>(result: Result<T, E>) -> Result<T, String> {
    result.map_err(|e| sanitize_error(e.to_string()))
}
