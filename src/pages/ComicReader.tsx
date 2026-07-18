import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app";
import type { ComicPage } from "../types";
import { THEMES } from "../constants";
import { useFullscreen } from "../hooks/useFullscreen";

export function ComicReader() {
  const { currentBook, currentChapter, progress, updateProgress, theme, setTheme } = useAppStore();
  const [pages, setPages] = useState<ComicPage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [doublePage, setDoublePage] = useState(false);
  const [rtl, setRtl] = useState(() => {
    if (currentBook?.metadata_json) {
      try {
        const meta = JSON.parse(currentBook.metadata_json);
        return meta.reading_direction === "rtl";
      } catch { return false; }
    }
    return false;
  });
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem("comic-zoom")) || 1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);

  // Persist zoom
  useEffect(() => {
    localStorage.setItem("comic-zoom", String(zoom));
  }, [zoom]);

  useEffect(() => {
    if (!currentChapter) return;
    setLoading(true);
    invoke<string>("get_chapter_content", { chapterId: currentChapter.id })
      .then((content) => {
        try {
          const parsed = JSON.parse(content) as ComicPage[];
          setPages(parsed);
          if (progress?.page_index && progress.page_index < parsed.length) {
            setCurrentPage(progress.page_index);
          } else {
            setCurrentPage(0);
          }
        } catch {
          setPages([]);
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load comic pages:", e);
        setLoading(false);
      });
  }, [currentChapter]);

  const saveProgress = useCallback(
    (pageIndex: number) => {
      if (!currentBook || !currentChapter) return;
      const percentage = pages.length > 0 ? Math.round((pageIndex / pages.length) * 100) : 0;
      updateProgress(currentBook.id, {
        chapter_id: currentChapter.id,
        page_index: pageIndex,
        percentage,
      });
    },
    [currentBook, currentChapter, pages]
  );

  const goToPage = useCallback(
    (index: number) => {
      if (index >= 0 && index < pages.length) {
        setCurrentPage(index);
        saveProgress(index);
      }
    },
    [pages, saveProgress]
  );

  const prevPage = useCallback(() => {
    if (doublePage && currentPage > 1) goToPage(currentPage - 2);
    else goToPage(currentPage - 1);
  }, [currentPage, goToPage, doublePage]);

  const nextPage = useCallback(() => {
    // In double-page mode, skip page 1 if cover is single (page 0)
    if (doublePage) {
      const step = currentPage === 0 ? 1 : 2;
      goToPage(Math.min(currentPage + step, pages.length - 1));
    } else {
      goToPage(currentPage + 1);
    }
  }, [currentPage, goToPage, doublePage, pages.length]);

  // In RTL mode, swap prev/next semantics
  const rtlPrev = useCallback(() => rtl ? nextPage() : prevPage(), [rtl, prevPage, nextPage]);
  const rtlNext = useCallback(() => rtl ? prevPage() : nextPage(), [rtl, prevPage, nextPage]);

  const toggleFullscreen = useFullscreen();

  /* ---- Zoom & Pan ---- */
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(3.0, Math.max(0.5, z + delta)));
    }
  }, []);

  // Keep at least `margin` px of the image inside the viewport while panning
  const clampPan = useCallback((x: number, y: number) => {
    const container = containerRef.current;
    const img = imgElRef.current;
    if (!container || !img) return { x, y };
    const margin = 80;
    const rect = img.getBoundingClientRect();
    const maxX = Math.max(0, (rect.width + container.clientWidth) / 2 - margin);
    const maxY = Math.max(0, (rect.height + container.clientHeight) / 2 - margin);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1.0 && e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan(clampPan(e.clientX - dragStart.x, e.clientY - dragStart.y));
  }, [isDragging, dragStart, clampPan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const computeFit = useCallback((mode: "width" | "height") => {
    const container = containerRef.current;
    const img = imgElRef.current;
    if (!container || !img) return;
    // getBoundingClientRect() includes the current scale() transform,
    // so divide by zoom to recover the untransformed layout size
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const baseW = rect.width / zoom;
    const baseH = rect.height / zoom;
    const target = mode === "width"
      ? container.clientWidth / baseW
      : container.clientHeight / baseH;
    setZoom(Math.min(5.0, Math.max(0.1, target)));
    setPan({ x: 0, y: 0 });
  }, [zoom]);

  const fitWidth = useCallback(() => computeFit("width"), [computeFit]);

  const fitHeight = useCallback(() => computeFit("height"), [computeFit]);

  const resetZoom = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "w" || e.key === "W") fitWidth();
      if (e.key === "h" || e.key === "H") fitHeight();
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fitWidth, fitHeight, resetZoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        rtlNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        rtlPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToPage(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToPage(pages.length - 1);
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setDoublePage((v) => !v);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setRtl((v) => !v);
      } else if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rtlNext, rtlPrev, goToPage, pages.length, toggleFullscreen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // Ctrl+wheel is handled by the zoom listener
      e.preventDefault();
      if (wheelTimeout) return;
      wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 150);
      if (e.deltaY > 0) rtlNext();
      else if (e.deltaY < 0) rtlPrev();
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [rtlNext, rtlPrev]);

  const { closeBook } = useAppStore.getState();
  const goBack = () => {
    if (currentBook) saveProgress(currentPage);
    closeBook();
  };

  if (!currentBook || !currentChapter) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-primary)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>加载中...</div>
        </div>
      </div>
    );
  }

  const isWebtoon = currentBook.reading_mode === "webtoon";
  const progressPct = pages.length > 0 ? Math.round(((currentPage + 1) / pages.length) * 100) : 0;

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Toolbar */}
      <header className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex items-center gap-2">
          <button className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5 hover-bg" style={{ color: "var(--text-secondary)" }}
            onClick={goBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <span className="text-sm truncate max-w-xs" style={{ color: "var(--text-secondary)" }}>{currentBook.title}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          {THEMES.map((t) => (
            <button key={t.key} className="px-2 py-1 rounded-md text-xs hover-bg"
              style={{
                background: theme === t.key ? "var(--accent-soft)" : undefined,
                color: theme === t.key ? "var(--accent)" : "var(--text-tertiary)",
              }}
              onClick={() => setTheme(t.key)}>{t.label}</button>
          ))}

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          {/* Double page toggle */}
          {!isWebtoon && (
            <button className="px-2 py-1.5 rounded-lg text-xs hover-bg"
              style={{
                background: doublePage ? "var(--accent-soft)" : undefined,
                color: doublePage ? "var(--accent)" : "var(--text-tertiary)",
              }}
              onClick={() => setDoublePage((v) => !v)}
              title="双页模式 (D)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="8" height="18" rx="1" /><rect x="14" y="3" width="8" height="18" rx="1" />
              </svg>
            </button>
          )}

          {/* RTL toggle */}
          {!isWebtoon && (
            <button className="px-2 py-1.5 rounded-lg text-xs hover-bg"
              style={{
                background: rtl ? "var(--accent-soft)" : undefined,
                color: rtl ? "var(--accent)" : "var(--text-tertiary)",
              }}
              onClick={() => setRtl((v) => !v)}
              title="右到左阅读 (R)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4v16" />
                <path d="M16 12H6" />
                <path d="M10 8l-4 4 4 4" />
              </svg>
            </button>
          )}

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          {/* Zoom controls — only in single-page mode */}
          {!isWebtoon && !doublePage && (
            <>
              <button className="px-2 py-1.5 rounded-lg text-xs hover-bg"
                style={{ color: "var(--text-tertiary)" }}
                onClick={() => setZoom((z) => Math.min(3.0, z + 0.2))}
                title="放大 (Ctrl+滚轮)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <span className="text-xs tabular-nums px-1" style={{ color: "var(--text-tertiary)" }}>
                {Math.round(zoom * 100)}%
              </span>
              <button className="px-2 py-1.5 rounded-lg text-xs hover-bg"
                style={{ color: "var(--text-tertiary)" }}
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
                title="缩小">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <button className="px-2 py-1.5 rounded-lg text-xs hover-bg"
                style={{ color: zoom !== 1.0 ? "var(--accent)" : "var(--text-tertiary)" }}
                onClick={resetZoom}
                title="重置缩放 (Ctrl+0)">
                1:1
              </button>
            </>
          )}

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          {/* Page nav */}
          <button className={`px-2 py-1.5 rounded-lg${currentPage > 0 ? " hover-bg" : ""}`} style={{ color: currentPage > 0 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
            onClick={prevPage} disabled={currentPage === 0}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="text-xs tabular-nums px-2" style={{ color: "var(--text-tertiary)" }}>
            {doublePage && currentPage < pages.length - 1
              ? `${currentPage + 1}-${currentPage + 2}`
              : currentPage + 1} / {pages.length}
          </span>
          <button className={`px-2 py-1.5 rounded-lg${currentPage < pages.length - 1 ? " hover-bg" : ""}`} style={{ color: currentPage < pages.length - 1 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
            onClick={nextPage} disabled={currentPage === pages.length - 1}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </header>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>加载中...</div>
            </div>
          </div>
        ) : pages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" opacity="0.4">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>未找到图片</div>
            </div>
          </div>
        ) : isWebtoon ? (
          <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              {pages.map((page) => (
                <img key={page.index} src={`asset://localhost/${page.image_path}`} alt={page.file_name}
                  className="w-full" style={{ display: "block" }} />
              ))}
            </div>
          </div>
        ) : doublePage && currentPage < pages.length - 1 ? (
          <div className="flex items-center justify-center h-full gap-1">
            {rtl ? (
              <>
                <img src={`asset://localhost/${pages[currentPage + 1]?.image_path}`} alt={pages[currentPage + 1]?.file_name}
                  className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
                <img src={`asset://localhost/${pages[currentPage]?.image_path}`} alt={pages[currentPage]?.file_name}
                  className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
              </>
            ) : (
              <>
                <img src={`asset://localhost/${pages[currentPage]?.image_path}`} alt={pages[currentPage]?.file_name}
                  className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
                <img src={`asset://localhost/${pages[currentPage + 1]?.image_path}`} alt={pages[currentPage + 1]?.file_name}
                  className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
              </>
            )}
          </div>
        ) : (
          <div
            className="flex items-center justify-center h-full"
            style={{
              cursor: zoom > 1.0 ? (isDragging ? "grabbing" : "grab") : "default",
              overflow: "hidden",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: isDragging ? "none" : "transform 150ms ease-out",
              transformOrigin: "center center",
            }}>
              <img ref={imgElRef} src={`asset://localhost/${pages[currentPage]?.image_path}`} alt={pages[currentPage]?.file_name}
                className="max-w-full max-h-full object-contain" style={{ userSelect: "none", pointerEvents: "none" }} />
            </div>
          </div>
        )}

        {/* Click areas — disabled when zoomed in (allow pan instead) */}
        {!isWebtoon && zoom <= 1.0 && (
          <>
            <div className="absolute left-0 top-0 w-1/4 h-full cursor-pointer group" onClick={rtlPrev}>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </div>
            </div>
            <div className="absolute right-0 top-0 w-1/4 h-full cursor-pointer group" onClick={rtlNext}>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Page slider */}
      {!isWebtoon && pages.length > 1 && (
        <footer className="px-5 py-2.5 flex items-center gap-4 flex-shrink-0"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          <input type="range" className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{
              accentColor: "var(--accent)",
              background: `linear-gradient(to right, var(--accent) ${progressPct}%, var(--bg-tertiary) ${progressPct}%)`,
            }}
            min={0} max={pages.length - 1} value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))} />
          <span className="text-xs w-10 text-right tabular-nums" style={{ color: "var(--text-tertiary)" }}>{progressPct}%</span>
        </footer>
      )}
    </div>
  );
}