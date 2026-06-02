import { useCallback } from "react";

/** Shared fullscreen toggle for Reader & ComicReader */
export function useFullscreen() {
  return useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
    } catch (e) {
      console.error("Fullscreen toggle failed:", e);
    }
  }, []);
}
