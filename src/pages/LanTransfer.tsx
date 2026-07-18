import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import DOMPurify from "dompurify";
import { useAppStore } from "../stores/app";
import type { OpdsServerStatus, UploadPageInfo } from "../types";
import { PageHeader, Button } from "../components/ui";

interface UploadStatus {
  path: string;
  importing: boolean;
  success?: boolean;
  error?: string;
}

export function LanTransfer() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [serverRunning, setServerRunning] = useState(false);
  const [pageInfo, setPageInfo] = useState<UploadPageInfo | null>(null);
  const [status, setStatus] = useState<UploadStatus[]>([]);
  const [error, setError] = useState("");
  const { importBook } = useAppStore();

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!serverRunning) return;
    const unlisten = listen<string>("upload-complete", (event) => {
      const path = event.payload;
      setStatus((s) => [...s, { path, importing: true }]);
      importBook(path)
        .then(() => {
          setStatus((s) =>
            s.map((u) => (u.path === path ? { ...u, importing: false, success: true } : u))
          );
        })
        .catch((e) => {
          setStatus((s) =>
            s.map((u) =>
              u.path === path ? { ...u, importing: false, error: String(e) } : u
            )
          );
        });
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [serverRunning, importBook]);

  const loadStatus = async () => {
    try {
      const s = await invoke<OpdsServerStatus>("get_opds_server_status");
      setServerRunning(s.running);
      if (s.running) {
        const info = await invoke<UploadPageInfo>("get_upload_page_info");
        setPageInfo(info);
      }
    } catch {
      setError("获取服务状态失败");
    } finally {
      setLoading(false);
    }
  };

  const uploadUrl = pageInfo?.url || null;

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <PageHeader title="局域网传输" />

      <main className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full">
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
        ) : (
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

            <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold">传输服务</h2>
                {serverRunning && (
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "var(--success)" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                    运行中{pageInfo ? ` · 端口 ${pageInfo.port}` : ""}
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                与「OPDS 服务」共用同一服务进程：在 OPDS 页启动后此处即可接收上传，任一页停止服务另一页也会一同停止。
              </p>

              {serverRunning ? (
                uploadUrl ? (
                  <div className="mt-4 flex items-start gap-6 flex-wrap">
                    {pageInfo?.qr_svg && (
                      <div
                        className="p-3 rounded-lg flex-shrink-0"
                        style={{
                          // Intentional fixed white: QR modules are black and need
                          // a light backdrop to stay scannable in every theme.
                          background: "#fff",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div
                          className="w-40 h-40 [&>svg]:w-full [&>svg]:h-full"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(pageInfo.qr_svg, {
                              USE_PROFILES: { svg: true },
                            }),
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-[240px]">
                      <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                        手机扫码，或手动输入以下地址上传文件：
                      </p>
                      <div className="flex items-center gap-2">
                        <code
                          className="flex-1 px-2 py-1.5 rounded text-xs font-mono truncate"
                          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                        >
                          {uploadUrl}
                        </code>
                        <Button size="sm" onClick={() => navigator.clipboard.writeText(uploadUrl)}>
                          复制
                        </Button>
                      </div>
                      <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>
                        手机浏览器打开地址后选择文件即可上传，上传完成后会自动导入书库。请确保手机与本机处于同一局域网。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className="mt-4 text-xs p-3 rounded-lg"
                    style={{
                      background: "var(--warning-soft)",
                      color: "var(--warning)",
                      border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
                    }}
                  >
                    服务运行中，但未检测到局域网连接，无法生成上传地址。请检查网络后重试。
                  </div>
                )
              ) : (
                <div
                  className="mt-4 rounded-lg p-6 flex flex-col items-center gap-3 text-center"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    传输服务未运行
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    传输服务与 OPDS 服务共用同一进程，请先在 OPDS 页启动服务后再回到此页。
                  </p>
                  <Button size="sm" onClick={() => navigate("/opds")}>
                    前往 OPDS 服务页启动
                  </Button>
                </div>
              )}
            </div>

            {status.length > 0 && (
              <div className="rounded-xl p-6" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
                <h2 className="text-sm font-semibold mb-4">上传记录</h2>
                <div className="space-y-2">
                  {status.map((u, i) => (
                    <div key={i} className="text-xs p-2 rounded" style={{ background: "var(--bg-tertiary)" }}>
                      <div className="font-mono truncate">{u.path}</div>
                      {u.importing && <div style={{ color: "var(--text-tertiary)" }}>导入中...</div>}
                      {u.success && <div style={{ color: "var(--success)" }}>导入成功</div>}
                      {u.error && <div style={{ color: "var(--error)" }}>导入失败: {u.error}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
