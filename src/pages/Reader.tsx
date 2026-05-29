import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app";
import { HighlightPopover } from "../components/HighlightPopover";
import { NotePanel } from "../components/NotePanel";

export function Reader() {
  const {
    currentBook,
    chapters,
    currentChapter,
    progress,
    updateProgress,
    loadChapter,
  } = useAppStore();

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight] = useState(1.8);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const sessionStartRef = useRef<Date>(new Date());
  const charsReadRef = useRef(0);

  // Track reading session
  useEffect(() => {
    sessionStartRef.current = new Date();
    charsReadRef.current = 0;

    return () => {
      if (currentBook) {
        const now = new Date();
        const duration = now.getTime() - sessionStartRef.current.getTime();
        if (duration > 5000) {
          invoke("record_reading_session", {
            bookId: currentBook.id,
            startTime: sessionStartRef.current.toISOString(),
            endTime: now.toISOString(),
            durationMs: duration,
            charsRead: charsReadRef.current,
            chaptersRead: 0,
          }).catch(console.error);
        }
      }
    };
  }, [currentBook]);

  // Load chapter content
  useEffect(() => {
    if (!currentChapter) return;

    setLoading(true);
    invoke<string>("get_chapter_content", { chapterId: currentChapter.id })
      .then((text) => {
        setContent(text);
        setLoading(false);
        charsReadRef.current += text.length;
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      })
      .catch((e) => {
        console.error("Failed to load chapter:", e);
        setLoading(false);
      });
  }, [currentChapter]);

  // Save progress on scroll
  const handleScroll = useCallback(() => {
    if (!currentBook || !currentChapter || !contentRef.current) return;

    const el = contentRef.current;
    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    const scrollOffset = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

    const chapterIndex = chapters.findIndex((c) => c.id === currentChapter.id);
    const chapterProgress = (chapterIndex + scrollOffset) / chapters.length;

    updateProgress(currentBook.id, {
      chapter_id: currentChapter.id,
      scroll_offset: scrollOffset,
      percentage: Math.round(chapterProgress * 100),
    });
  }, [currentBook, currentChapter, chapters]);

  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(handleScroll, 1000);
  }, [handleScroll]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentChapter) return;

      const chapterIndex = chapters.findIndex(
        (c) => c.id === currentChapter.id
      );

      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (chapterIndex < chapters.length - 1) {
          loadChapter(chapters[chapterIndex + 1].id);
        }
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (chapterIndex > 0) {
          loadChapter(chapters[chapterIndex - 1].id);
        }
      } else if (e.key === "=" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setFontSize((s) => Math.min(s + 2, 36));
      } else if (e.key === "-" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setFontSize((s) => Math.max(s - 2, 12));
      } else if (e.key === "b" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSidebar((s) => !s);
      } else if (e.key === "n" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowNotes((s) => !s);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentChapter, chapters]);

  // Restore scroll position
  useEffect(() => {
    if (!content || !progress || !contentRef.current) return;

    const el = contentRef.current;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    el.scrollTop = progress.scroll_offset * scrollHeight;
  }, [content]);

  const goToChapter = (chapterId: string) => {
    loadChapter(chapterId);
    setShowSidebar(false);
  };

  const goBack = () => {
    if (currentBook) {
      handleScroll();
    }
    useAppStore.setState({
      currentBook: null,
      chapters: [],
      currentChapter: null,
      progress: null,
    });
  };

  const handleHighlightCreated = () => {};

  const handleJumpTo = (chapterId: string, _offset: number) => {
    loadChapter(chapterId);
  };

  if (!currentBook) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg-primary)" }}
      >
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
    );
  }

  if (!currentChapter) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <div className="flex flex-col items-center gap-4">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            无法加载章节内容
          </div>
          <button
            className="px-4 py-1.5 text-xs rounded-lg text-white"
            style={{ background: "var(--accent)" }}
            onClick={() => {
              useAppStore.setState({
                currentBook: null,
                chapters: [],
                currentChapter: null,
                progress: null,
              });
            }}
          >
            返回书库
          </button>
        </div>
      </div>
    );
  }

  const chapterIndex = chapters.findIndex((c) => c.id === currentChapter.id);
  const progressPct = progress?.percentage ? Math.round(progress.percentage) : 0;

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Sidebar - Chapter list */}
      {showSidebar && (
        <aside
          className="w-72 flex-shrink-0 flex flex-col overflow-hidden animate-slide-right"
          style={{
            background: "var(--bg-secondary)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-sm font-semibold">目录</span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {chapters.length} 章
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {chapters.map((ch, i) => (
              <button
                key={ch.id}
                className="w-full text-left px-5 py-2.5 text-sm transition-all"
                style={{
                  background:
                    ch.id === currentChapter.id
                      ? "var(--accent-soft)"
                      : "transparent",
                  color:
                    ch.id === currentChapter.id
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  borderLeft:
                    ch.id === currentChapter.id
                      ? "3px solid var(--accent)"
                      : "3px solid transparent",
                  fontWeight: ch.id === currentChapter.id ? 500 : 400,
                }}
                onClick={() => goToChapter(ch.id)}
                onMouseEnter={(e) => {
                  if (ch.id !== currentChapter.id) {
                    e.currentTarget.style.background = "var(--bg-tertiary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (ch.id !== currentChapter.id) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span className="mr-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {i + 1}
                </span>
                {ch.title || `第 ${i + 1} 章`}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <header
          className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
          }}
        >
          <div className="flex items-center gap-1">
            <button
              className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
              onClick={goBack}
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

            <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

            <button
              className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
              style={{
                color: showSidebar ? "var(--accent)" : "var(--text-secondary)",
                background: showSidebar ? "var(--accent-soft)" : "transparent",
              }}
              onClick={() => setShowSidebar(!showSidebar)}
              onMouseEnter={(e) => {
                if (!showSidebar) e.currentTarget.style.background = "var(--bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                if (!showSidebar) e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              目录
            </button>

            <button
              className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
              style={{
                color: showNotes ? "var(--accent)" : "var(--text-secondary)",
                background: showNotes ? "var(--accent-soft)" : "transparent",
              }}
              onClick={() => setShowNotes(!showNotes)}
              onMouseEnter={(e) => {
                if (!showNotes) e.currentTarget.style.background = "var(--bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                if (!showNotes) e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              笔记
            </button>
          </div>

          <div
            className="text-sm truncate max-w-md text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            {currentBook.title}
          </div>

          <div className="flex items-center gap-1">
            <button
              className="px-2 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: "var(--text-tertiary)" }}
              onClick={() => setFontSize((s) => Math.max(s - 2, 12))}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              A-
            </button>
            <span
              className="text-xs w-8 text-center tabular-nums"
              style={{ color: "var(--text-tertiary)" }}
            >
              {fontSize}
            </span>
            <button
              className="px-2 py-1.5 rounded-lg text-xs font-medium"
              style={{ color: "var(--text-tertiary)" }}
              onClick={() => setFontSize((s) => Math.min(s + 2, 36))}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              A+
            </button>

            <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />

            {/* Chapter nav */}
            <button
              className="px-2 py-1.5 rounded-lg"
              style={{ color: chapterIndex > 0 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
              disabled={chapterIndex <= 0}
              onClick={() => {
                if (chapterIndex > 0) loadChapter(chapters[chapterIndex - 1].id);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--text-tertiary)" }}
            >
              {chapterIndex + 1}/{chapters.length}
            </span>
            <button
              className="px-2 py-1.5 rounded-lg"
              style={{ color: chapterIndex < chapters.length - 1 ? "var(--text-secondary)" : "var(--text-tertiary)" }}
              disabled={chapterIndex >= chapters.length - 1}
              onClick={() => {
                if (chapterIndex < chapters.length - 1) loadChapter(chapters[chapterIndex + 1].id);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </header>

        {/* Chapter content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto relative"
          onScroll={onScroll}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
                />
                <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  加载中...
                </div>
              </div>
            </div>
          ) : (
            <article
              className="max-w-2xl mx-auto px-8 py-12"
              style={{
                fontSize: `${fontSize}px`,
                lineHeight,
              }}
            >
              <h2
                className="text-2xl font-semibold mb-8 pb-4"
                style={{
                  borderBottom: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
              >
                {currentChapter.title}
              </h2>
              <div
                className={
                  currentBook.format === "md" || currentBook.format === "markdown"
                    ? "markdown-body select-text"
                    : "whitespace-pre-wrap select-text"
                }
                style={{
                  color: "var(--text-primary)",
                  letterSpacing: "0.02em",
                }}
                {...(currentBook.format === "md" || currentBook.format === "markdown"
                  ? { dangerouslySetInnerHTML: { __html: content } }
                  : {}
                )}
              >
                {currentBook.format === "md" || currentBook.format === "markdown" ? null : content}
              </div>
            </article>
          )}

          {/* Highlight popover */}
          <HighlightPopover
            bookId={currentBook.id}
            chapterId={currentChapter.id}
            onCreated={handleHighlightCreated}
          />
        </div>

        {/* Status bar */}
        <footer
          className="flex items-center justify-between px-5 py-2 flex-shrink-0"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-secondary)",
          }}
        >
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {currentChapter.title}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {currentBook.total_chars?.toLocaleString() || "?"} 字
            </span>
            <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
            <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--text-tertiary)" }}>
              {progressPct}%
            </span>
          </div>
        </footer>
      </div>

      {/* Note panel */}
      <NotePanel
        bookId={currentBook.id}
        chapterId={currentChapter.id}
        visible={showNotes}
        onClose={() => setShowNotes(false)}
        onJumpTo={handleJumpTo}
      />
    </div>
  );
}
