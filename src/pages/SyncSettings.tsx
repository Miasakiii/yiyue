import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

interface WebDavConfig {
  server_url: string;
  username: string;
  password: string;
  remote_path: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
}

interface SyncStatus {
  last_sync: string | null;
  pending_changes: number;
  is_syncing: boolean;
  error: string | null;
}

export function SyncSettings() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<WebDavConfig>({
    server_url: "",
    username: "",
    password: "",
    remote_path: "/yiyue/",
    auto_sync: false,
    sync_interval_minutes: 30,
  });
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [c, s] = await Promise.all([
        invoke<WebDavConfig>("get_webdav_config"),
        invoke<SyncStatus>("get_sync_status"),
      ]);
      setConfig(c);
      setStatus(s);
    } catch (e) {
      console.error("Failed to load sync config:", e);
    }
  };

  const handleSave = async () => {
    try {
      await invoke("save_webdav_config", { config });
      setSyncMessage("配置已保存");
      setTimeout(() => setSyncMessage(""), 3000);
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError("");
    try {
      await invoke("test_webdav_connection", { config });
      setTestResult("success");
    } catch (e) {
      setTestResult("error");
      setTestError(String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async (type: "push" | "pull" | "full") => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const result = await invoke<SyncStatus>(
        type === "push" ? "sync_push" : type === "pull" ? "sync_pull" : "sync_full"
      );
      setStatus(result);
      setSyncMessage("同步完成");
    } catch (e) {
      setSyncMessage(`同步失败: ${e}`);
    } finally {
      setSyncing(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "8px 12px",
    fontSize: "13px",
    outline: "none",
    transition: "border-color var(--transition-fast)",
    width: "100%",
  };

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-8 py-5 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div className="flex items-center gap-3">
          <button
            className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => navigate("/")}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <h1 className="text-lg font-semibold">同步设置</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
          {/* Status card */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
            }}
          >
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
              </svg>
              同步状态
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm mb-5">
              <div
                className="rounded-lg p-3"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)" }}
              >
                <div className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>上次同步</div>
                <div className="font-medium">
                  {status?.last_sync
                    ? new Date(status.last_sync).toLocaleString()
                    : "从未同步"}
                </div>
              </div>
              <div
                className="rounded-lg p-3"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)" }}
              >
                <div className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>待同步变更</div>
                <div className="font-medium">{status?.pending_changes || 0} 条</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
                  opacity: syncing ? 0.7 : 1,
                }}
                onClick={() => handleSync("full")}
                disabled={syncing}
              >
                {syncing ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    同步中...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
                    </svg>
                    立即同步
                  </>
                )}
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm flex items-center gap-1.5"
                style={{
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                }}
                onClick={() => handleSync("push")}
                disabled={syncing}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                上传
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm flex items-center gap-1.5"
                style={{
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                }}
                onClick={() => handleSync("pull")}
                disabled={syncing}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                下载
              </button>
            </div>

            {syncMessage && (
              <div
                className="mt-3 text-sm flex items-center gap-1.5"
                style={{ color: syncMessage.includes("失败") ? "#ef4444" : "#22c55e" }}
              >
                {syncMessage.includes("失败") ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                )}
                {syncMessage}
              </div>
            )}
          </div>

          {/* Config form */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
            }}
          >
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              WebDAV 配置
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  服务器地址
                </label>
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="https://dav.example.com"
                  value={config.server_url}
                  onChange={(e) => setConfig({ ...config, server_url: e.target.value })}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    用户名
                  </label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    密码
                  </label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  远程路径
                </label>
                <input
                  type="text"
                  style={inputStyle}
                  value={config.remote_path}
                  onChange={(e) => setConfig({ ...config, remote_path: e.target.value })}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                  }}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.auto_sync}
                    onChange={(e) => setConfig({ ...config, auto_sync: e.target.checked })}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  自动同步
                </label>
                {config.auto_sync && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      间隔
                    </span>
                    <select
                      className="px-2 py-1 rounded-lg text-xs outline-none"
                      style={{
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border)",
                      }}
                      value={config.sync_interval_minutes}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          sync_interval_minutes: Number(e.target.value),
                        })
                      }
                    >
                      <option value={5}>5 分钟</option>
                      <option value={15}>15 分钟</option>
                      <option value={30}>30 分钟</option>
                      <option value={60}>1 小时</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                  }}
                  onClick={handleSave}
                >
                  保存配置
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm flex items-center gap-1.5"
                  style={{
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                  }}
                  onClick={handleTest}
                  disabled={testing}
                >
                  {testing ? (
                    <>
                      <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      测试中...
                    </>
                  ) : (
                    "测试连接"
                  )}
                </button>
                {testResult === "success" && (
                  <span className="text-sm flex items-center gap-1" style={{ color: "#22c55e" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    连接成功
                  </span>
                )}
                {testResult === "error" && (
                  <span className="text-sm flex items-center gap-1" style={{ color: "#ef4444" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {testError}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Info */}
          <div
            className="rounded-xl p-5 text-sm"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
            }}
          >
            <h3 className="text-xs font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              支持的 WebDAV 服务
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: "坚果云", desc: "jianguoyun.com" },
                { name: "Nextcloud", desc: "自建云盘" },
                { name: "Synology", desc: "群晖 NAS" },
                { name: "其他", desc: "标准 WebDAV" },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)" }}
                >
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{item.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              同步内容包括：阅读进度、笔记划线、标签分组、自定义规则。书籍文件不会同步。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
