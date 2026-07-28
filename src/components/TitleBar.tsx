import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

/**
 * Custom in-app title bar for the frameless window (decorations: false).
 * Theme-matched so the window chrome blends into each page's header instead
 * of clashing like the native system title bar did.
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});
    const unlistenPromise = appWindow.listen("tauri://resize", () => {
      appWindow.isMaximized().then(setIsMaximized).catch(() => {});
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="h-9 flex items-stretch justify-between flex-shrink-0 select-none"
      style={{
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border-light)",
      }}
      onDoubleClick={() => appWindow.toggleMaximize()}
    >
      {/* Left: app identity (also part of the drag region) */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-3 flex-1 min-w-0">
        <span
          className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
          // eslint-disable-next-line no-restricted-syntax -- accent 底上的白色前景，各主题通用，暂无 --text-on-accent 令牌
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          页
        </span>
        <span className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
          一页
        </span>
      </div>

      {/* Right: window controls */}
      <div className="flex items-stretch flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
        <button
          type="button"
          className="w-11 flex items-center justify-center hover-bg"
          onClick={() => appWindow.minimize()}
          title="最小化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="2" y1="6" x2="10" y2="6" />
          </svg>
        </button>
        <button
          type="button"
          className="w-11 flex items-center justify-center hover-bg"
          onClick={() => appWindow.toggleMaximize()}
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="4" width="6" height="6" rx="0.5" />
              <path d="M4 4V2h6v6h-2" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2.5" y="2.5" width="7" height="7" rx="0.5" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="w-11 flex items-center justify-center transition-colors hover:bg-[var(--error)] hover:text-white"
          onClick={() => appWindow.close()}
          title="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
