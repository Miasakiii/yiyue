import { useEffect, useState } from "react";
import { AlertCircle, Download, Eye, Globe, Info, RefreshCw, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { PageHeader, Button, Input, Switch } from "../components/ui";

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
      setSyncMessage(`保存失败: ${e}`);
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

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <PageHeader title="同步设置" />

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
          {/* Status card */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
            }}
          >
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
<Globe size={ 16 } strokeWidth={2} />
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
              <Button onClick={() => handleSync("full")} disabled={syncing}>
                {syncing ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    同步中...
                  </>
                ) : (
                  <>
<Globe size={ 14 } strokeWidth={2} />
                    立即同步
                  </>
                )}
              </Button>
              <Button variant="secondary" onClick={() => handleSync("push")} disabled={syncing}>
<Upload size={ 13 } strokeWidth={2} />
                上传
              </Button>
              <Button variant="secondary" onClick={() => handleSync("pull")} disabled={syncing}>
<Download size={ 13 } strokeWidth={2} />
                下载
              </Button>
            </div>

            {syncMessage && (
              <div
                className="mt-3 text-sm flex items-center gap-1.5"
                style={{ color: syncMessage.includes("失败") ? "var(--error)" : "var(--success)" }}
              >
                {syncMessage.includes("失败") ? (
<AlertCircle size={ 14 } strokeWidth={2} />
                ) : (
<RefreshCw size={ 14 } strokeWidth={2} />
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
<Eye size={ 16 } strokeWidth={2} />
              WebDAV 配置
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  服务器地址
                </label>
                <Input
                  type="text"
                  placeholder="https://dav.example.com"
                  value={config.server_url}
                  onChange={(e) => setConfig({ ...config, server_url: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    用户名
                  </label>
                  <Input
                    type="text"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    密码
                  </label>
                  <Input
                    type="password"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  远程路径
                </label>
                <Input
                  type="text"
                  value={config.remote_path}
                  onChange={(e) => setConfig({ ...config, remote_path: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    size="sm"
                    checked={config.auto_sync}
                    onChange={(v) => setConfig({ ...config, auto_sync: v })}
                    title="自动同步"
                  />
                  <span className="text-sm">自动同步</span>
                </div>
                {config.auto_sync && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      间隔
                    </span>
                    <select
                      className="px-2 py-1 rounded text-xs outline-none"
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
                <Button onClick={handleSave}>
                  保存配置
                </Button>
                <Button variant="secondary" onClick={handleTest} disabled={testing}>
                  {testing ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      测试中...
                    </>
                  ) : (
                    "测试连接"
                  )}
                </Button>
                {testResult === "success" && (
                  <span className="text-sm flex items-center gap-1" style={{ color: "var(--success)" }}>
<RefreshCw size={ 14 } strokeWidth={2} />
                    连接成功
                  </span>
                )}
                {testResult === "error" && (
                  <span className="text-sm flex items-center gap-1" style={{ color: "var(--error)" }}>
<AlertCircle size={ 14 } strokeWidth={2} />
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
<Info size={ 14 } strokeWidth={2} />
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
