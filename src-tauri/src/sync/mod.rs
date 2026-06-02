use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavConfig {
    pub server_url: String,
    pub username: String,
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
