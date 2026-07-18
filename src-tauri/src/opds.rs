use crate::error::{AppError, AppResult};
use crate::models::Book;
use parking_lot::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tiny_http::{Header, Method, Request, Response, Server};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpdsServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub lan_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadPageInfo {
    pub lan_ip: Option<String>,
    pub port: u16,
    pub url: Option<String>,
    pub qr_svg: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpdsConfig {
    pub enabled: bool,
    pub port: u16,
}

impl Default for OpdsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 8080,
        }
    }
}

#[derive(Debug)]
pub struct OpdsServerState {
    stop_flag: Arc<AtomicBool>,
    running: AtomicBool,
    port: Mutex<Option<u16>>,
}

impl OpdsServerState {
    pub fn new() -> Self {
        Self {
            stop_flag: Arc::new(AtomicBool::new(false)),
            running: AtomicBool::new(false),
            port: Mutex::new(None),
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn set_running(&self, value: bool) {
        self.running.store(value, Ordering::Relaxed);
    }

    pub fn get_port(&self) -> Option<u16> {
        *self.port.lock()
    }

    pub fn set_port(&self, port: Option<u16>) {
        *self.port.lock() = port;
    }

    pub fn stop_flag(&self) -> Arc<AtomicBool> {
        self.stop_flag.clone()
    }
}

pub fn build_opds_feed(conn: &Connection, base_url: &str) -> AppResult<String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, author, format, updated_at FROM books
             WHERE deleted_at IS NULL
             ORDER BY updated_at DESC
             LIMIT 100",
        )
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let books = stmt
        .query_map([], |row| {
            Ok(Book {
                id: row.get(0)?,
                kind: "novel".to_string(),
                title: row.get(1)?,
                author: row.get(2)?,
                file_hash: String::new(),
                file_path: String::new(),
                file_size: 0,
                format: row.get(3)?,
                cover_path: None,
                description: None,
                language: "zh".to_string(),
                total_chapters: None,
                total_chars: None,
                metadata_json: None,
                reading_mode: None,
                added_at: String::new(),
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let entries: Vec<Book> = books.filter_map(|b| b.ok()).collect();

    let mut xml = String::from(r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2011/catalog">
  <title>一页书库</title>
  <id>urn:yiyue:opds:feed</id>
  <updated>"#);
    xml.push_str(&chrono::Utc::now().to_rfc3339());
    xml.push_str(r#"</updated>
  <link rel="self" href="opds.xml" type="application/atom+xml"/>
  <link rel="start" href="opds.xml" type="application/atom+xml"/>
"#);

    for book in &entries {
        let entry_url = format!("{}/books/{}", base_url, book.id);
        xml.push_str(&format!(
            r#"  <entry>
    <id>{}</id>
    <title>{}</title>
    <updated>{}</updated>
    <author><name>{}</name></author>
    <link rel="http://opds-spec.org/acquisition" href="{}" type="application/octet-stream"/>
    <category term="{}" label="{}"/>
  </entry>
"#,
            book.id,
            escape_xml(&book.title),
            book.updated_at,
            escape_xml(book.author.as_deref().unwrap_or_default()),
            entry_url,
            book.format.to_lowercase(),
            escape_xml(&book.format),
        ));
    }

    xml.push_str("</feed>\n");
    Ok(xml)
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
}

pub fn get_opds_config(conn: &Connection) -> AppResult<OpdsConfig> {
    let config_json: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'opds_config'",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(json) = config_json {
        serde_json::from_str(&json).map_err(|e| AppError::Internal(e.to_string()))
    } else {
        Ok(OpdsConfig::default())
    }
}

pub fn save_opds_config(conn: &Connection, config: &OpdsConfig) -> AppResult<()> {
    let json = serde_json::to_string(config).map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('opds_config', ?1)",
        rusqlite::params![json],
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

pub fn start_opds_server(
    db_conn: Arc<Mutex<Connection>>,
    port: u16,
    server_state: &OpdsServerState,
    on_upload: Option<Arc<dyn Fn(String) + Send + Sync>>,
) -> AppResult<()> {
    if server_state.is_running() {
        return Err(AppError::InvalidInput("OPDS 服务已在运行中".to_string()));
    }

    let stop_flag = server_state.stop_flag();

    stop_flag.store(false, Ordering::Relaxed);
    server_state.set_running(true);
    server_state.set_port(Some(port));

    let bind_addr = format!("0.0.0.0:{}", port);

    thread::spawn(move || {
        let server = match Server::http(&bind_addr) {
            Ok(s) => Arc::new(s),
            Err(e) => {
                eprintln!("OPDS server failed to start: {}", e);
                return;
            }
        };

        loop {
            if stop_flag.load(Ordering::Relaxed) {
                break;
            }

            match server.recv_timeout(Duration::from_millis(500)) {
                Ok(Some(mut request)) => {
                    let (response, upload_path) = handle_request(&db_conn, &mut request, port);
                    if let Some(path) = upload_path {
                        if let Some(ref callback) = on_upload {
                            callback(path);
                        }
                    }
                    let _ = request.respond(response);
                }
                Ok(None) => continue,
                Err(e) => {
                    eprintln!("OPDS server error: {}", e);
                    break;
                }
            }
        }
    });

    Ok(())
}

pub fn stop_opds_server(server_state: &OpdsServerState) -> AppResult<()> {
    if !server_state.is_running() {
        return Err(AppError::InvalidInput("OPDS 服务未运行".to_string()));
    }
    server_state.stop_flag.store(true, Ordering::Relaxed);
    thread::sleep(Duration::from_millis(600));
    server_state.set_running(false);
    server_state.set_port(None);
    Ok(())
}

pub fn get_opds_server_status(
    server_state: &OpdsServerState,
) -> OpdsServerStatus {
    let port = server_state.get_port();
    OpdsServerStatus {
        running: server_state.is_running(),
        port,
        url: port.map(|p| format!("http://localhost:{}", p)),
        lan_url: port.and_then(|p| get_lan_ip().map(|ip| format!("http://{}:{}", ip, p))),
    }
}

/// Get the LAN IP address of this machine by opening a UDP socket towards a
/// public address and reading back the local address the OS picked. No real
/// traffic is generated (UDP `connect` only sets the default destination).
pub fn get_lan_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}

/// Build the upload page info for a given port: LAN URL plus a QR code (SVG
/// string, without XML declaration) encoding that URL.
pub fn build_upload_page_info(port: u16) -> UploadPageInfo {
    let lan_ip = get_lan_ip();
    let url = lan_ip
        .as_ref()
        .map(|ip| format!("http://{}:{}/upload", ip, port));
    let qr_svg = url.as_ref().and_then(|u| {
        qrcode::QrCode::new(u.as_bytes())
            .ok()
            .map(|code| code.render::<qrcode::render::svg::Color>().build())
    });
    UploadPageInfo {
        lan_ip,
        port,
        url,
        qr_svg,
    }
}

fn cors(response: Response<Cursor<Vec<u8>>>) -> Response<Cursor<Vec<u8>>> {
    response
        .with_header(Header::from_bytes(b"Access-Control-Allow-Origin", b"*").unwrap())
        .with_header(
            Header::from_bytes(b"Access-Control-Allow-Methods", b"GET, POST, OPTIONS").unwrap(),
        )
        .with_header(Header::from_bytes(b"Access-Control-Allow-Headers", b"*").unwrap())
}

const UPLOAD_PAGE_HTML: &str = r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>传书到一页</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f5f4; color: #1c1917; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,.08); padding: 28px 24px; width: 100%; max-width: 420px; }
  h1 { font-size: 20px; margin-bottom: 6px; }
  .tip { font-size: 13px; color: #78716c; margin-bottom: 20px; line-height: 1.6; }
  .file-btn { display: block; width: 100%; padding: 14px; border: 1.5px dashed #d6d3d1; border-radius: 12px; text-align: center; color: #57534e; font-size: 15px; cursor: pointer; margin-bottom: 16px; word-break: break-all; }
  input[type=file] { display: none; }
  button { width: 100%; padding: 14px; border: none; border-radius: 12px; background: #b45309; color: #fff; font-size: 16px; }
  button:disabled { background: #d6d3d1; }
  #result { margin-top: 16px; font-size: 14px; text-align: center; display: none; }
  #result.ok { color: #15803d; }
  #result.err { color: #b91c1c; }
</style>
</head>
<body>
<div class="card">
  <h1>传书到「一页」</h1>
  <p class="tip">选择手机中的电子书文件，上传后会自动导入书架。支持 EPUB / TXT / PDF / MOBI / CBZ 等格式。</p>
  <form id="form" method="post" action="/upload" enctype="multipart/form-data">
    <label class="file-btn" id="fileLabel" for="fileInput">点击选择文件</label>
    <input id="fileInput" type="file" name="file" accept=".epub,.txt,.pdf,.mobi,.azw3,.cbz,.cbr,.md,.docx">
    <button id="submitBtn" type="submit" disabled>上传</button>
  </form>
  <p id="result"></p>
</div>
<script>
var input = document.getElementById('fileInput');
var label = document.getElementById('fileLabel');
var btn = document.getElementById('submitBtn');
var result = document.getElementById('result');
input.addEventListener('change', function () {
  if (input.files && input.files.length > 0) {
    label.textContent = input.files[0].name;
    btn.disabled = false;
    result.style.display = 'none';
  }
});
document.getElementById('form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!input.files || input.files.length === 0) return;
  btn.disabled = true;
  btn.textContent = '上传中…';
  var fd = new FormData();
  fd.append('file', input.files[0]);
  fetch('/upload', { method: 'POST', body: fd })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function () {
      result.textContent = '上传成功，已导入书架';
      result.className = 'ok';
      result.style.display = 'block';
      btn.textContent = '上传';
      btn.disabled = false;
      input.value = '';
      label.textContent = '点击选择文件';
    })
    .catch(function () {
      result.textContent = '上传失败，请重试';
      result.className = 'err';
      result.style.display = 'block';
      btn.textContent = '上传';
      btn.disabled = false;
    });
});
</script>
</body>
</html>"#;

fn handle_request(
    db_conn: &Arc<Mutex<Connection>>,
    request: &mut Request,
    port: u16,
) -> (Response<Cursor<Vec<u8>>>, Option<String>) {
    let url = request.url().to_string();
    let method = request.method();

    if *method == Method::Options {
        return (cors(Response::from_string("").with_status_code(204)), None);
    }

    if url == "/opds.xml" || url == "/opds" {
        let conn = db_conn.lock();
        let response = match build_opds_feed(&conn, &format!("http://localhost:{}", port)) {
            Ok(xml) => Response::from_string(xml).with_header(
                Header::from_bytes(b"Content-Type", b"application/atom+xml; charset=utf-8")
                    .unwrap(),
            ),
            Err(e) => Response::from_string(format!("Error: {}", e)).with_status_code(500),
        };
        (cors(response), None)
    } else if url.starts_with("/books/") {
        let book_id = url.strip_prefix("/books/").unwrap_or("");
        let response = if book_id.is_empty() {
            Response::from_string("Missing book ID").with_status_code(400)
        } else {
            let conn = db_conn.lock();
            let result = conn.query_row(
                "SELECT file_path, format, title FROM books WHERE id = ?1 AND deleted_at IS NULL",
                [book_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            );

            match result {
                Ok((file_path, format, title)) => match std::fs::read(&file_path) {
                    Ok(content) => {
                        let content_type = match format.to_lowercase().as_str() {
                            "epub" => "application/epub+zip",
                            "pdf" => "application/pdf",
                            "txt" => "text/plain; charset=utf-8",
                            "mobi" => "application/x-mobipocket-ebook",
                            "azw3" => "application/x-azw3",
                            "cbz" => "application/vnd.comicbook+zip",
                            "cbr" => "application/vnd.comicbook+rar",
                            _ => "application/octet-stream",
                        };

                        Response::from_data(content)
                            .with_header(
                                Header::from_bytes(b"Content-Type", content_type.as_bytes())
                                    .unwrap(),
                            )
                            .with_header(
                                Header::from_bytes(
                                    b"Content-Disposition",
                                    format!(
                                        "attachment; filename=\"{}.{}\"",
                                        title.replace('"', ""),
                                        format
                                    )
                                    .as_bytes(),
                                )
                                .unwrap(),
                            )
                    }
                    Err(_) => Response::from_string("File not found").with_status_code(404),
                },
                Err(_) => Response::from_string("Book not found").with_status_code(404),
            }
        };
        (cors(response), None)
    } else if url == "/upload" && *method == Method::Get {
        let response = Response::from_string(UPLOAD_PAGE_HTML).with_header(
            Header::from_bytes(b"Content-Type", b"text/html; charset=utf-8").unwrap(),
        );
        (cors(response), None)
    } else if *method == Method::Post && url == "/upload" {
        match handle_upload(request) {
            Ok(Some(path)) => {
                let body = serde_json::json!({ "success": true, "path": path }).to_string();
                let response = Response::from_string(body).with_header(
                    Header::from_bytes(b"Content-Type", b"application/json").unwrap(),
                );
                (cors(response), Some(path))
            }
            Ok(None) => (
                cors(Response::from_string("No file uploaded").with_status_code(400)),
                None,
            ),
            Err(e) => (
                cors(
                    Response::from_string(format!("Upload failed: {}", e))
                        .with_status_code(500),
                ),
                None,
            ),
        }
    } else {
        (
            cors(Response::from_string("Not Found").with_status_code(404)),
            None,
        )
    }
}

/// Find the first occurrence of `needle` in `haystack`, returning its index.
fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn handle_upload(request: &mut Request) -> AppResult<Option<String>> {
    let content_type = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("content-type"))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default();

    let boundary = content_type
        .split("boundary=")
        .nth(1)
        .ok_or_else(|| AppError::InvalidInput("Missing multipart boundary".into()))?
        .trim()
        .to_string();

    let mut body = Vec::new();
    request
        .as_reader()
        .read_to_end(&mut body)
        .map_err(|e| AppError::Io(e.to_string()))?;

    // Split the multipart body at the byte level: ebook files are binary, so a
    // lossy UTF-8 conversion of the whole body would corrupt the upload.
    let delimiter = format!("--{}", boundary).into_bytes();
    let mut offset = 0;

    while let Some(rel) = find_subslice(&body[offset..], &delimiter) {
        let part_start = offset + rel + delimiter.len();
        let part_end = find_subslice(&body[part_start..], &delimiter)
            .map(|i| part_start + i)
            .unwrap_or(body.len());
        offset = part_end;

        let part = &body[part_start..part_end];
        let header_end = match find_subslice(part, b"\r\n\r\n") {
            Some(i) => i,
            None => continue,
        };
        let headers = String::from_utf8_lossy(&part[..header_end]);
        if !headers.contains("name=\"file\"") {
            continue;
        }

        let mut content = &part[header_end + 4..];
        // Strip the CRLF that precedes the next boundary delimiter.
        if content.ends_with(b"\r\n") {
            content = &content[..content.len() - 2];
        }

        let filename = headers
            .lines()
            .find(|l| l.starts_with("Content-Disposition:"))
            .and_then(|l| {
                l.split("filename=\"")
                    .nth(1)
                    .and_then(|s| s.split('\"').next())
            })
            .unwrap_or("upload.bin");

        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");

        let temp_name = format!("{}.{}", Uuid::new_v4(), ext);
        let temp_dir = std::env::temp_dir().join("yiyue-uploads");
        std::fs::create_dir_all(&temp_dir).map_err(|e| AppError::Io(e.to_string()))?;

        let temp_path = temp_dir.join(&temp_name);
        std::fs::write(&temp_path, content).map_err(|e| AppError::Io(e.to_string()))?;

        return Ok(Some(temp_path.to_string_lossy().to_string()));
    }

    Ok(None)
}
