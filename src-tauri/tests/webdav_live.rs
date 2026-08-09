//! WebDAV 实测集成测试（PLAN 2.4）
//!
//! 依赖本地 wsgidav 服务器（HTTP + Basic Auth），运行前先启动：
//!
//! ```bash
//! pip install wsgidav cheroot
//! python <temp>/start_webdav.py   # 127.0.0.1:8123, user=testuser pass=testpass
//! cargo test --test webdav_live -- --ignored
//! ```
//!
//! 因依赖外部服务，默认 #[ignore] 不进入常规 `cargo test`。

use yiyue_lib::sync::{WebDavClient, WebDavConfig};

fn client(remote_path: &str) -> WebDavClient {
    WebDavClient::new(WebDavConfig {
        server_url: "http://127.0.0.1:8123".to_string(),
        username: "testuser".to_string(),
        password: "testpass".to_string(),
        remote_path: remote_path.to_string(),
        auto_sync: false,
        sync_interval_minutes: 30,
    })
}

#[test]
#[ignore = "需要本地 wsgidav 服务器"]
fn mkdir_put_get_roundtrip() {
    let c = client("/yiyue-live-test/roundtrip/");
    c.mkdir("").expect("MKCOL should succeed (or 405 already exists)");

    let payload = b"{\"key\":\"value\"}";
    c.put("sync_data.json", payload).expect("PUT should succeed");
    let got = c.get("sync_data.json").expect("GET should succeed");
    assert_eq!(got, payload, "roundtrip content must match");

    // 覆盖已有文件（增量同步场景）
    c.put("sync_data.json", b"{\"key\":\"updated\"}")
        .expect("overwrite PUT should succeed");
    let got2 = c.get("sync_data.json").unwrap();
    assert_eq!(got2, b"{\"key\":\"updated\"}");
}

#[test]
#[ignore = "需要本地 wsgidav 服务器"]
fn mkdir_is_idempotent() {
    let c = client("/yiyue-live-test/idempotent/");
    c.mkdir("").expect("first MKCOL should succeed");
    c.mkdir("").expect("second MKCOL should be tolerated (405)");
}

#[test]
#[ignore = "需要本地 wsgidav 服务器"]
fn get_missing_file_fails() {
    let c = client("/yiyue-live-test/roundtrip/");
    let err = c.get("does-not-exist.json");
    assert!(err.is_err(), "GET of missing file must error");
}

#[test]
#[ignore = "需要本地 wsgidav 服务器"]
fn test_connection_rejects_plain_http() {
    // 安全守卫：非 HTTPS 地址应被拒绝（即使服务可达）
    let c = client("/yiyue-live-test/roundtrip/");
    let err = c.test_connection();
    assert!(err.is_err(), "plain HTTP must be rejected by the HTTPS guard");
}
