import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
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
          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--accent)" }}
          title="一页"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="2" width="13" height="12" rx="2" fill="#fff" />
            <path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h4" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
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
<Minus size={ 12 } strokeWidth={1.2} />
        </button>
        <button
          type="button"
          className="w-11 flex items-center justify-center hover-bg"
          onClick={() => appWindow.toggleMaximize()}
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? (
<Copy size={ 11 } strokeWidth={1.2} />
          ) : (
<Square size={ 11 } strokeWidth={1.2} />
          )}
        </button>
        <button
          type="button"
          className="w-11 flex items-center justify-center transition-colors hover:bg-[var(--error)] hover:text-white"
          onClick={() => appWindow.close()}
          title="关闭"
        >
<X size={ 12 } strokeWidth={1.2} />
        </button>
      </div>
    </div>
  );
}
