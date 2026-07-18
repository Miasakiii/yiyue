use thiserror::Error;

#[derive(Debug, Error)]
// Some variants / helpers are part of the shared error vocabulary and are
// not constructed by every module yet.
#[allow(dead_code)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] crate::db::DbError),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl AppError {
    #[allow(dead_code)]
    pub fn sanitized(&self) -> String {
        sanitize_error(self.to_string())
    }
}

/// Sanitize an error message for display: strip URL credentials
/// (`user:pass@`), `password=xxx`-style parameters, and replace the
/// user's home directory in absolute paths with `~`.
pub fn sanitize_error(msg: String) -> String {
    let mut out = msg;

    // Strip credentials in URLs (scheme://user:pass@host -> scheme://host)
    if let Some(scheme_end) = out.find("://") {
        let rest_start = scheme_end + 3;
        if let Some(at) = out[rest_start..].find('@') {
            let at = rest_start + at;
            // Only strip when the userinfo portion contains no path separator
            let userinfo = &out[rest_start..at];
            if !userinfo.contains('/') && !userinfo.contains('\\') {
                out = format!("{}{}", &out[..rest_start], &out[at + 1..]);
            }
        }
    }

    // Mask password-like query/form parameters: password=xxx, passwd=xxx, pwd=xxx
    for key in ["password", "passwd", "pwd"] {
        let mut search_from = 0;
        while let Some(pos) = out[search_from..].find(&format!("{}=", key)) {
            let pos = search_from + pos;
            let value_start = pos + key.len() + 1;
            let value_end = out[value_start..]
                .find(|c| c == '&' || c == ' ' || c == '"' || c == '\'')
                .map(|i| value_start + i)
                .unwrap_or(out.len());
            // Only mask when preceded by a typical delimiter to avoid false positives
            if pos == 0 || matches!(out.as_bytes()[pos - 1], b'?' | b'&' | b' ' | b'"' | b'\'') {
                out = format!("{}{}=***{}", &out[..pos], key, &out[value_end..]);
                search_from = pos + key.len() + 4;
            } else {
                search_from = value_end;
            }
        }
    }

    // Replace the user's home directory with ~
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let home = home.to_string_lossy().to_string();
        if !home.is_empty() {
            out = out.replace(&home, "~");
            // Also handle forward-slash variant of the same path
            let fwd = home.replace('\\', "/");
            if fwd != home {
                out = out.replace(&fwd, "~");
            }
        }
    }

    out
}

pub type AppResult<T> = Result<T, AppError>;
