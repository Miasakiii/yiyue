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
  const containerRef = useRef<HTMLDivElement>(null);

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

  const toggleFullscreen = useFullscreen();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        nextPage();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prevPage();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToPage(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToPage(pages.length - 1);
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setDoublePage((v) => !v);
      } else if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextPage, prevPage, goToPage, pages, toggleFullscreen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelTimeout) return;
      wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 150);
      if (e.deltaY > 0) nextPage();
      else if (e.deltaY < 0) prevPage();
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [nextPage, prevPage]);

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
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading...</div>
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
          <button className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}
            onClick={goBack}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-tertiary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="text-sm truncate max-w-xs" style={{ color: "var(--text-secondary)" }}>{currentBook.title}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          {THEMES.map((t) => (
            <button key={t.key} className="px-2 py-1 rounded-md text-xs"
              style={{
                background: theme === t.key ? "var(--accent-soft)" : "transparent",
                color: theme === t.key ? "var(--accent)" : "var(--text-tertiary)",
              }}
              onClick={() => setTheme(t.key)}>{t.label}</button>
          ))}

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          {/* Double page toggle */}
          {!isWebtoon && (
            <button className="px-2 py-1.5 rounded-lg text-xs"
              style={{
                background: doublePage ? "var(--accent-soft)" : "transparent",
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

          <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

          {/* Page nav */}
          <button className="px-2 py-1.5 rounded-lg" style={{ color: currentPage > 0 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
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
          <button className="px-2 py-1.5 rounded-lg" style={{ color: currentPage < pages.length - 1 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
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
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading...</div>
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
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>No images found</div>
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
            <img src={`asset://localhost/${pages[currentPage]?.image_path}`} alt={pages[currentPage]?.file_name}
              className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
            <img src={`asset://localhost/${pages[currentPage + 1]?.image_path}`} alt={pages[currentPage + 1]?.file_name}
              className="max-h-full max-w-[50%] object-contain" style={{ userSelect: "none" }} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <img src={`asset://localhost/${pages[currentPage]?.image_path}`} alt={pages[currentPage]?.file_name}
              className="max-w-full max-h-full object-contain" style={{ userSelect: "none" }} />
          </div>
        )}

        {/* Click areas */}
        {!isWebtoon && (
          <>
            <div className="absolute left-0 top-0 w-1/4 h-full cursor-pointer" onClick={prevPage} />
            <div className="absolute right-0 top-0 w-1/4 h-full cursor-pointer" onClick={nextPage} />
          </>
        )}
      </div>

      {/* Page slider */}
      {!isWebtoon && pages.length > 1 && (
        <footer className="px-5 py-2.5 flex items-center gap-4 flex-shrink-0"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
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