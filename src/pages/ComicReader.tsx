import { useEffect, useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Columns2, Image, SeparatorVertical, ZoomIn, ZoomOut } from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app";
import type { ComicPage } from "../types";
import { THEMES } from "../constants";
import { useFullscreen } from "../hooks/useFullscreen";

// Single-page zoom bounds — shared by wheel, buttons and fit calculations.
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5.0;

// Resolve a local image path for the webview. Bare asset:// URLs fail on Windows
// (wry rewrites them to https://asset.localhost); convertFileSrc handles the encoding.
const imgSrc = (p?: string) => (p ? convertFileSrc(p) : undefined);

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
  // currentBook may be null while hooks run (see the early return below).
  const isWebtoon = currentBook?.reading_mode === "webtoon";

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
    // Zoom only applies to single-page mode; in webtoon/double-page mode it
    // would be visually inert yet still persisted to localStorage.
    if (isWebtoon || doublePage) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)));
    }
  }, [isWebtoon, doublePage]);

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
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, target)));
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
      if (document.body.dataset.modalOpen === "true") return;
      // Zoom shortcuts only make sense in single-page mode.
      if (isWebtoon || doublePage) return;
      if (e.key === "w" || e.key === "W") fitWidth();
      if (e.key === "h" || e.key === "H") fitHeight();
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fitWidth, fitHeight, resetZoom, isWebtoon, doublePage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (document.body.dataset.modalOpen === "true") return;
      // Webtoon mode scrolls natively — leave all navigation keys alone.
      if (isWebtoon) return;
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
  }, [rtlNext, rtlPrev, goToPage, pages.length, toggleFullscreen, isWebtoon]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleWheel = (e: WheelEvent) => {
      // Webtoon mode scrolls natively — do not hijack the wheel (paging here
      // would also corrupt reading progress via rtlNext/rtlPrev).
      if (isWebtoon) return;
      if (e.ctrlKey || e.metaKey) return; // Ctrl+wheel is handled by the zoom listener
      e.preventDefault();
      if (wheelTimeout) return;
      wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 150);
      if (e.deltaY > 0) rtlNext();
      else if (e.deltaY < 0) rtlPrev();
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [rtlNext, rtlPrev, isWebtoon]);

  const { closeBook } = useAppStore.getState();
  const goBack = () => {
    if (currentBook) saveProgress(currentPage);
    closeBook();
  };

  if (!currentBook || !currentChapter) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "var(--bg-primary)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>加载中...</div>
        </div>
      </div>
    );
  }

  const progressPct = pages.length > 0 ? Math.round(((currentPage + 1) / pages.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Toolbar */}
      <header className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex items-center gap-2">
          <button className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5 hover-bg" style={{ color: "var(--text-secondary)" }}
            onClick={goBack}>
<ChevronLeft size={ 14 } strokeWidth={2} />
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
<Columns2 size={ 16 } strokeWidth={2} />
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
<SeparatorVertical size={ 16 } strokeWidth={2} />
            </button>
          )}

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          {/* Zoom controls — only in single-page mode */}
          {!isWebtoon && !doublePage && (
            <>
              <button className="px-2 py-1.5 rounded-lg text-xs hover-bg"
                style={{ color: "var(--text-tertiary)" }}
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + 0.2))}
                title="放大 (Ctrl+滚轮)">
<ZoomIn size={ 16 } strokeWidth={2} />
              </button>
              <span className="text-xs tabular-nums px-1" style={{ color: "var(--text-tertiary)" }}>
                {Math.round(zoom * 100)}%
              </span>
              <button className="px-2 py-1.5 rounded-lg text-xs hover-bg"
                style={{ color: "var(--text-tertiary)" }}
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - 0.2))}
                title="缩小">
<ZoomOut size={ 16 } strokeWidth={2} />
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
<ChevronRight size={ 16 } strokeWidth={2} />
          </button>
          <span className="text-xs tabular-nums px-2" style={{ color: "var(--text-tertiary)" }}>
            {doublePage && currentPage < pages.length - 1
              ? `${currentPage + 1}-${currentPage + 2}`
              : currentPage + 1} / {pages.length}
          </span>
          <button className={`px-2 py-1.5 rounded-lg${currentPage < pages.length - 1 ? " hover-bg" : ""}`} style={{ color: currentPage < pages.length - 1 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
            onClick={nextPage} disabled={currentPage === pages.length - 1}>
<ChevronLeft size={ 16 } strokeWidth={2} />
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
<Image size={ 40 } strokeWidth={1.5} />
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>未找到图片</div>
            </div>
          </div>
        ) : isWebtoon ? (
          <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              {pages.map((page) => (
                <img key={page.index} src={imgSrc(page.image_path)} alt={page.file_name}
                  className="w-full" style={{ display: "block" }} />
              ))}
            </div>
          </div>
        ) : doublePage && currentPage < pages.length - 1 ? (
          <div className="flex items-center justify-center h-full gap-1">
            {rtl ? (
              <>
                <img src={imgSrc(pages[currentPage + 1]?.image_path)} alt={pages[currentPage + 1]?.file_name}
                  className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
                <img src={imgSrc(pages[currentPage]?.image_path)} alt={pages[currentPage]?.file_name}
                  className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
              </>
            ) : (
              <>
                <img src={imgSrc(pages[currentPage]?.image_path)} alt={pages[currentPage]?.file_name}
                  className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
                <img src={imgSrc(pages[currentPage + 1]?.image_path)} alt={pages[currentPage + 1]?.file_name}
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
            // eslint-disable-next-line no-restricted-syntax -- 非 hover 样式：鼠标移出时结束拖拽平移
            onMouseLeave={handleMouseUp}
          >
            <div style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: isDragging ? "none" : "transform 150ms ease-out",
              transformOrigin: "center center",
            }}>
              <img ref={imgElRef} src={imgSrc(pages[currentPage]?.image_path)} alt={pages[currentPage]?.file_name}
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
<ChevronLeft size={ 20 } strokeWidth={2} />
              </div>
            </div>
            <div className="absolute right-0 top-0 w-1/4 h-full cursor-pointer group" onClick={rtlNext}>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
<ChevronRight size={ 20 } strokeWidth={2} />
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