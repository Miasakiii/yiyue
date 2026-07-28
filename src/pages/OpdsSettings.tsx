import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { OpdsConfig, OpdsServerStatus } from "../types";
import { PageHeader, Button, Input, Switch } from "../components/ui";

export function OpdsSettings() {
  const [config, setConfig] = useState<OpdsConfig>({ enabled: false, port: 8080 });
  const [status, setStatus] = useState<OpdsServerStatus>({ running: false, port: null, url: null, lan_url: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Port is edited as free text so the field can be cleared; it is parsed
  // and validated on blur / save, falling back to 8080.
  const [portInput, setPortInput] = useState("8080");

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [c, s] = await Promise.all([
        invoke<OpdsConfig>("get_opds_config"),
        invoke<OpdsServerStatus>("get_opds_server_status"),
      ]);
      setConfig(c);
      setPortInput(String(c.port));
      setStatus(s);
    } catch {
      setError("加载配置失败");
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    const s = await invoke<OpdsServerStatus>("get_opds_server_status");
    setStatus(s);
  };

  const parsePort = (): number => {
    const p = parseInt(portInput, 10);
    return Number.isNaN(p) || p < 1 || p > 65535 ? 8080 : p;
  };

  const commitPort = () => {
    const port = parsePort();
    setPortInput(String(port));
    setConfig((c) => ({ ...c, port }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const port = parsePort();
      setPortInput(String(port));
      const nextConfig = { ...config, port };
      setConfig(nextConfig);
      await invoke("save_opds_config", { config: nextConfig });
      // Saving does not stop the server — re-fetch the real status instead of
      // assuming it went down.
      await refreshStatus();
    } catch {
      setError("保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    setError("");
    try {
      if (status.running) {
        await invoke("stop_opds_server");
      } else {
        await invoke("start_opds_server", { port: config.port });
      }
      await refreshStatus();
    } catch {
      setError("操作失败");
    }
  };

  if (loading) {
    return (
      <div
        className="flex flex-col h-full"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <PageHeader title="OPDS 服务" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            />
            <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              加载中...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <PageHeader title="OPDS 服务" />

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
          {error && (
            <div
              className="px-4 py-3 rounded-lg text-sm"
              style={{
                background: "var(--error-soft)",
                color: "var(--error)",
                border: "1px solid color-mix(in srgb, var(--error) 35%, transparent)",
              }}
            >
              {error}
            </div>
          )}

          {/* Server status */}
          <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">服务状态</h2>
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                  {status.running
                    ? `运行中 · ${status.lan_url || status.url || `端口 ${status.port}`}`
                    : "未启动"}
                </p>
              </div>
              <Button
                variant={status.running ? "secondary" : "primary"}
                size="sm"
                onClick={handleToggle}
              >
                {status.running ? "停止" : "启动"}
              </Button>
            </div>

            {status.running && (
              <div className="text-xs p-3 rounded-lg" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                {status.url && <p>本机地址: {status.url}</p>}
                {status.lan_url && <p className="mt-1">局域网地址: {status.lan_url}</p>}
                <p className="mt-1">可在其他阅读器（如 Moon+ Reader、静读天下）中添加此地址订阅书库</p>
              </div>
            )}
            <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>
              与「局域网传输」共用同一服务进程：在任一页启动或停止，另一页的状态也会随之变化。
            </p>
          </div>

          {/* Configuration */}
          <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
            <h2 className="text-sm font-semibold mb-4">服务配置</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">启用 OPDS</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>允许局域网设备订阅书库</div>
                </div>
                <Switch
                  checked={config.enabled}
                  onChange={(v) => setConfig({ ...config, enabled: v })}
                  title="启用 OPDS"
                />
              </div>

              <div>
                <div className="text-sm mb-2">端口</div>
                <div className="w-32">
                  <Input
                    type="number"
                    value={portInput}
                    onChange={(e) => setPortInput(e.target.value)}
                    onBlur={commitPort}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存配置"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
