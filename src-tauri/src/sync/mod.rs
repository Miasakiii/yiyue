use serde::{Deserialize, Serialize};

/// Application-level error for keyring operations.
/// We don't want to surface detailed OS-keyring errors to the user.
const KEYRING_SERVICE: &str = "yiyue-webdav";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavConfig {
    pub server_url: String,
    pub username: String,
    /// Password is NOT serialized to the DB; it lives in the OS keyring.
    /// In-flight structs may still carry a plaintext copy, but the DB and
    /// serialized JSON never contain it.
    #[serde(skip)]
    pub password: String,
    pub remote_path: String, // e.g., "/yiyue/"
    pub auto_sync: bool,
    pub sync_interval_minutes: i64,
}

impl Default for WebDavConfig {
    fn default() -> Self {
        Self {
            server_url: String::new(),
            username: String::new(),
            password: String::new(),
            remote_path: "/yiyue/".to_string(),
            auto_sync: false,
            sync_interval_minutes: 30,
        }
    }
}

/// Persist the password in the OS-level credential store.
/// Returns an empty result on success; the caller can surface a user-friendly
/// message on failure.
pub fn store_webdav_password(username: &str, password: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, username)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;
    entry
        .set_password(password)
        .map_err(|e| format!("Failed to store password: {}", e))
}

/// Retrieve the WebDAV password from the OS-level credential store.
pub fn retrieve_webdav_password(username: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, username)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;
    entry
        .get_password()
        .map_err(|e| format!("Failed to retrieve password: {}", e))
}

/// Delete the WebDAV password from the OS-level credential store.
pub fn delete_webdav_password(username: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, username)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;
    entry
        .delete_credential()
        .map_err(|e| format!("Failed to delete password: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub last_sync: Option<String>,
    pub pending_changes: i64,
    pub is_syncing: bool,
    pub error: Option<String>,
}

/// WebDAV client for sync operations
pub struct WebDavClient {
    config: WebDavConfig,
    client: reqwest::blocking::Client,
}

impl WebDavClient {
    pub fn new(config: WebDavConfig) -> Self {
        // Warn if server_url is not using HTTPS — credentials would be sent in
        // plaintext over HTTP. This is a soft check; the application still allows
        // the connection for local/trusted network scenarios, but the warning
        // should be shown to the user via the UI.
        if !config.server_url.starts_with("https://") && !config.server_url.is_empty() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[yiyue] WARNING: WebDAV server URL does not use HTTPS. \
                 Credentials will be sent in plaintext: {}",
                config.server_url
            );
        }

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();

        Self { config, client }
    }

    fn base_url(&self) -> String {
        let base = self.config.server_url.trim_end_matches('/');
        let path = self.config.remote_path.trim_start_matches('/');
        format!("{}/{}", base, path)
    }

    /// Create directory on WebDAV server
    pub fn mkdir(&self, path: &str) -> Result<(), String> {
        let url = format!("{}/{}", self.base_url().trim_end_matches('/'), path.trim_start_matches('/'));

        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .send()
            .map_err(|e| format!("WebDAV request failed: {}", e))?;

        if resp.status().is_success() || resp.status() == 405 {
            // 405 means directory already exists
            Ok(())
        } else {
            Err(format!("WebDAV MKCOL failed: {}", resp.status()))
        }
    }

    /// Upload file to WebDAV server
    pub fn put(&self, path: &str, content: &[u8]) -> Result<(), String> {
        let url = format!("{}/{}", self.base_url().trim_end_matches('/'), path.trim_start_matches('/'));

        let resp = self
            .client
            .put(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .header("Content-Type", "application/octet-stream")
            .body(content.to_vec())
            .send()
            .map_err(|e| format!("WebDAV PUT failed: {}", e))?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("WebDAV PUT failed: {}", resp.status()))
        }
    }

    /// Download file from WebDAV server
    pub fn get(&self, path: &str) -> Result<Vec<u8>, String> {
        let url = format!("{}/{}", self.base_url().trim_end_matches('/'), path.trim_start_matches('/'));

        let resp = self
            .client
            .get(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .send()
            .map_err(|e| format!("WebDAV GET failed: {}", e))?;

        if resp.status().is_success() {
            resp.bytes()
                .map(|b| b.to_vec())
                .map_err(|e| format!("Failed to read response: {}", e))
        } else {
            Err(format!("WebDAV GET failed: {}", resp.status()))
        }
    }

    /// Test connection to WebDAV server
    pub fn test_connection(&self) -> Result<(), String> {
        // Reject non-HTTPS connections with a clear error message
        if !self.config.server_url.starts_with("https://") && !self.config.server_url.is_empty() {
            return Err(
                "安全警告：WebDAV 连接未使用 HTTPS，凭据将以明文传输。请使用 HTTPS 地址。".to_string(),
            );
        }

        let url = self.base_url();

        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .header("Depth", "0")
            .header("Content-Type", "application/xml")
            .body(r#"<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>"#)
            .send()
            .map_err(|e| format!("Connection failed: {}", e))?;

        if resp.status().is_success() || resp.status() == 207 {
            Ok(())
        } else {
            Err(format!("Connection test failed: {}", resp.status()))
        }
    }
}
