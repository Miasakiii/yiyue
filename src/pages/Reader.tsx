import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app";
import { HighlightPopover } from "../components/HighlightPopover";
import { NotePanel } from "../components/NotePanel";
import { THEMES } from "../constants";
import { useFullscreen } from "../hooks/useFullscreen";
import { showToast } from "../components/Toast";
import type { SaveReadingProfile } from "../types";

/* ---------- Reading settings helpers ---------- */
const FONT_FAMILIES = [
  { key: "default", label: "Sans", value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { key: "serif", label: "Serif", value: "Georgia, 'Noto Serif SC', 'Source Han Serif SC', serif" },
  { key: "mono", label: "Mono", value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
] as const;

const LINE_HEIGHT_PRESETS = [1.4, 1.6, 1.8, 2.0, 2.4] as const;

const CONTENT_WIDTH_PRESETS = [
  { key: "narrow", label: "窄", value: 480 },
  { key: "medium", label: "中", value: 640 },
  { key: "wide", label: "宽", value: 768 },
  { key: "full", label: "全", value: 960 },
] as const;

/* ---------- Component ---------- */
export function Reader() {
  const {
    currentBook, chapters, currentChapter, progress, readingProfile,
    updateProgress, loadChapter, theme, setTheme, saveReadingProfile,
  } = useAppStore();

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [charsPerMinute, setCharsPerMinute] = useState(300);

  // Reading settings — initialized from localStorage (global defaults)
  const [fontSize, setFontSize] = useState(
    () => Number(localStorage.getItem("reader-font-size")) || 18
  );
  const [lineHeight, setLineHeight] = useState(
    () => Number(localStorage.getItem("reader-line-height")) || 1.8
  );
  const [fontFamilyKey, setFontFamilyKey] = useState(
    () => localStorage.getItem("reader-font-family") || "default"
  );
  const [contentWidthKey, setContentWidthKey] = useState(
    () => localStorage.getItem("reader-content-width") || "medium"
  );
  const [paragraphSpacing, setParagraphSpacing] = useState(
    () => Number(localStorage.getItem("reader-paragraph-spacing")) || 0.8
  );
  const [textAlign, setTextAlign] = useState<"left" | "justify">(
    () => (localStorage.getItem("reader-text-align") as "left" | "justify") || "left"
  );
  const [pageAnimation, setPageAnimation] = useState(
    () => localStorage.getItem("reader-page-animation") || "none"
  );
  const [animClass, setAnimClass] = useState("");
  const prevChapterRef = useRef<string | null>(null);

  // Apply per-book reading profile when it changes (overrides localStorage defaults)
  useEffect(() => {
    if (readingProfile) {
      setFontSize(readingProfile.font_size);
      setLineHeight(readingProfile.line_height);
      setFontFamilyKey(readingProfile.font_family);
      setContentWidthKey(readingProfile.content_width);
      setParagraphSpacing(readingProfile.paragraph_spacing);
      setTextAlign(readingProfile.text_align as "left" | "justify");
      if (readingProfile.page_animation && readingProfile.page_animation !== "none") {
        setPageAnimation(readingProfile.page_animation);
      }
    }
  }, [readingProfile]);

  const [showSidebar, setShowSidebar] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const sessionStartRef = useRef<Date>(new Date());
  const charsReadRef = useRef(0);

  const fontFamily =
    FONT_FAMILIES.find((f) => f.key === fontFamilyKey)?.value ??
    FONT_FAMILIES[0].value;

  /* ---- Persist reading settings (localStorage + per-book backend) ---- */
  useEffect(() => { localStorage.setItem("reader-font-size", String(fontSize)); }, [fontSize]);
  useEffect(() => { localStorage.setItem("reader-line-height", String(lineHeight)); }, [lineHeight]);
  useEffect(() => { localStorage.setItem("reader-font-family", fontFamilyKey); }, [fontFamilyKey]);
  useEffect(() => { localStorage.setItem("reader-content-width", contentWidthKey); }, [contentWidthKey]);
  useEffect(() => { localStorage.setItem("reader-paragraph-spacing", String(paragraphSpacing)); }, [paragraphSpacing]);
  useEffect(() => { localStorage.setItem("reader-text-align", textAlign); }, [textAlign]);
  useEffect(() => { localStorage.setItem("reader-page-animation", pageAnimation); }, [pageAnimation]);

  // Debounced save to per-book reading profile in backend
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!currentBook) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const profile: SaveReadingProfile = {
        font_size: fontSize,
        line_height: lineHeight,
        font_family: fontFamilyKey,
        content_width: contentWidthKey,
        paragraph_spacing: paragraphSpacing,
        text_align: textAlign,
        page_animation: pageAnimation,
      };
      saveReadingProfile(currentBook.id, profile);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [fontSize, lineHeight, fontFamilyKey, contentWidthKey, paragraphSpacing, textAlign, currentBook]);

  const contentWidth = CONTENT_WIDTH_PRESETS.find((w) => w.key === contentWidthKey)?.value ?? 640;

  /* ---- Close settings popover on outside click ---- */
  useEffect(() => {
    if (!settingsOpen) return;
    const close = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [settingsOpen]);

  /* ---- Fullscreen toggle (F11) ---- */
  const toggleFullscreen = useFullscreen();

  /* ---- Track reading session ---- */
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

  /* ---- Load reading speed for time estimate ---- */
  useEffect(() => {
    if (!currentBook) return;
    invoke<{ chars_per_minute: number }>("get_reading_speed", { bookId: currentBook.id })
      .then((speed) => setCharsPerMinute(speed.chars_per_minute))
      .catch(() => setCharsPerMinute(300));
  }, [currentBook]);

  /* ---- Trigger page animation on chapter change ---- */
  useEffect(() => {
    if (!currentChapter || !prevChapterRef.current || pageAnimation === "none") {
      prevChapterRef.current = currentChapter?.id ?? null;
      return;
    }
    if (currentChapter.id !== prevChapterRef.current) {
      // Determine direction: find index of old vs new chapter
      const oldIdx = chapters.findIndex(c => c.id === prevChapterRef.current);
      const newIdx = chapters.findIndex(c => c.id === currentChapter.id);
      const direction = newIdx > oldIdx ? "forward" : "backward";
      const cls = pageAnimation === "fade"
        ? "page-anim-fade"
        : direction === "forward" ? "page-anim-slide-left" : "page-anim-slide-right";
      setAnimClass(cls);
      // Remove animation class after it completes
      const timer = setTimeout(() => setAnimClass(""), 350);
      prevChapterRef.current = currentChapter.id;
      return () => clearTimeout(timer);
    }
  }, [currentChapter, pageAnimation, chapters]);

  /* ---- Load chapter content ---- */
  useEffect(() => {
    if (!currentChapter) return;
    setLoading(true);
    invoke<string>("get_chapter_content", { chapterId: currentChapter.id })
      .then((text) => {
        setContent(text);
        setLoading(false);
        charsReadRef.current += text.length;
        if (contentRef.current) contentRef.current.scrollTop = 0;
      })
      .catch((e) => {
        console.error("Failed to load chapter:", e);
        setLoading(false);
      });
  }, [currentChapter]);

  /* ---- Save progress on scroll ---- */
  const handleScroll = useCallback(() => {
    if (!currentBook || !currentChapter || !contentRef.current) return;
    const el = contentRef.current;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    const scrollOffset = scrollHeight > 0 ? el.scrollTop / scrollHeight : 0;
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
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(handleScroll, 1000);
  }, [handleScroll]);

  /* ---- Keyboard navigation ---- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentChapter) return;
      const chapterIndex = chapters.findIndex((c) => c.id === currentChapter.id);
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (chapterIndex < chapters.length - 1) loadChapter(chapters[chapterIndex + 1].id);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (chapterIndex > 0) loadChapter(chapters[chapterIndex - 1].id);
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
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+D: toggle favorite / bookmark
        e.preventDefault();
        if (currentBook) {
          useAppStore.getState().toggleFavorite(currentBook.id);
          showToast("已切换收藏状态", "success");
        }
      } else if (e.key === "g" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+G: open sidebar for chapter jump
        e.preventDefault();
        setShowSidebar(true);
      } else if (e.key === "f" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        // Ctrl+F: search current book (dispatch global search event)
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("open-search"));
      } else if (e.key === "Escape") {
        // Escape: close open panels
        e.preventDefault();
        if (settingsOpen) setSettingsOpen(false);
        else if (showNotes) setShowNotes(false);
        else if (showSidebar) setShowSidebar(false);
      } else if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentChapter, chapters, toggleFullscreen, settingsOpen, showNotes, showSidebar, currentBook]);

  /* ---- Restore scroll position ---- */
  useEffect(() => {
    if (!content || !progress || !currentChapter || !contentRef.current) return;
    // Only restore scroll if progress matches the current chapter
    if (progress.chapter_id !== currentChapter.id) return;
    const el = contentRef.current;
    const scrollHeight = el.scrollHeight - el.clientHeight;
    el.scrollTop = progress.scroll_offset * scrollHeight;
  }, [content, currentChapter, progress]);

  const goToChapter = (chapterId: string) => {
    loadChapter(chapterId);
    setShowSidebar(false);
  };

  const { closeBook } = useAppStore.getState();
  const goBack = () => {
    if (currentBook) handleScroll();
    closeBook();
  };
  const handleJumpTo = (chapterId: string, offset: number) => {
    loadChapter(chapterId).then(() => {
      // After content loads, try to scroll to the annotation offset
      // Use a small delay to ensure DOM is ready
      setTimeout(() => {
        if (!contentRef.current) return;
        const el = contentRef.current;
        const article = el.querySelector("article");
        if (!article) return;
        // Approximate: offset is char index, estimate position by ratio
        const totalChars = article.textContent?.length || 1;
        const ratio = Math.min(offset / totalChars, 1);
        const scrollHeight = el.scrollHeight - el.clientHeight;
        el.scrollTop = ratio * scrollHeight;
      }, 100);
    });
  };

  /* ---- Early returns ---- */
  if (!currentBook) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-primary)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>加载中...</div>
        </div>
      </div>
    );
  }

  if (!currentChapter) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <div className="flex flex-col items-center gap-4">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>无法加载章节内容</div>
          <button className="px-4 py-1.5 text-xs rounded-lg text-white" style={{ background: "var(--accent)" }}
            onClick={closeBook}>
            返回书库
          </button>
        </div>
      </div>
    );
  }

  const chapterIndex = chapters.findIndex((c) => c.id === currentChapter.id);
  const progressPct = progress?.percentage ? Math.round(progress.percentage) : 0;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Sidebar - Chapter list */}
      {showSidebar && (
        <aside className="w-72 flex-shrink-0 flex flex-col overflow-hidden animate-slide-right"
          style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-sm font-semibold">目录</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              {chapterIndex + 1} / {chapters.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-2" ref={(el) => {
            // Auto-scroll to current chapter
            if (el && currentChapter) {
              const current = el.querySelector(`[data-chapter-id="${currentChapter.id}"]`);
              if (current) current.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }}>
            {chapters.map((ch, i) => (
              <button key={ch.id} data-chapter-id={ch.id}
                className={`w-full text-left px-5 py-2.5 text-sm sidebar-item ${ch.id === currentChapter.id ? 'active' : ''}`}
                onClick={() => goToChapter(ch.id)}
              >
                <span className="mr-2 text-xs tabular-nums" style={{ color: "var(--text-tertiary)", minWidth: 24, display: "inline-block" }}>{i + 1}</span>
                {ch.title || `第 ${i + 1} 章`}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Toolbar */}
        <header className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-1">
            <ToolbarBtn onClick={goBack} title="返回">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </ToolbarBtn>
            <ToolbarBtn active={showSidebar} onClick={() => setShowSidebar(!showSidebar)} title="目录">
              <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
            </ToolbarBtn>
            <ToolbarBtn active={showNotes} onClick={() => setShowNotes(!showNotes)} title="笔记">
              <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>
            </ToolbarBtn>
          </div>

          <div className="text-sm truncate max-w-md text-center" style={{ color: "var(--text-secondary)" }}>
            {currentBook.title}
          </div>

          <div className="flex items-center gap-1">
            {/* Settings button */}
            <div className="relative" ref={settingsRef}>
              <button className="px-2 py-1.5 rounded-lg text-xs flex items-center gap-1"
                style={{
                  color: settingsOpen ? "var(--accent)" : "var(--text-tertiary)",
                  background: settingsOpen ? "var(--accent-soft)" : "transparent",
                }}
                onClick={() => setSettingsOpen(!settingsOpen)}
                title="Settings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              {/* Settings Popover */}
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 animate-scale-in"
                  style={{
                    width: 260, background: "var(--bg-elevated)", border: "1px solid var(--border)",
                    borderRadius: 10, boxShadow: "var(--shadow-xl)", padding: "8px 0",
                  }}>
                  {/* Font size slider */}
                  <SettingRow label="字号">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs tabular-nums w-6 text-right" style={{ color: "var(--text-tertiary)" }}>{fontSize}</span>
                      <input type="range" min={12} max={36} step={1} value={fontSize}
                        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                        style={{ accentColor: "var(--accent)" }}
                        onChange={(e) => setFontSize(Number(e.target.value))} />
                    </div>
                  </SettingRow>

                  {/* Line height */}
                  <SettingRow label="行高">
                    <div className="flex gap-1">
                      {LINE_HEIGHT_PRESETS.map((lh) => (
                        <button key={lh} className="px-1.5 py-1 rounded-md text-xs tabular-nums"
                          style={{
                            background: lineHeight === lh ? "var(--accent-soft)" : "var(--bg-tertiary)",
                            color: lineHeight === lh ? "var(--accent)" : "var(--text-tertiary)",
                            fontWeight: lineHeight === lh ? 600 : 400,
                          }}
                          onClick={() => setLineHeight(lh)}>{lh}</button>
                      ))}
                    </div>
                  </SettingRow>

                  {/* Content width */}
                  <SettingRow label="宽度">
                    <div className="flex gap-1">
                      {CONTENT_WIDTH_PRESETS.map((w) => (
                        <button key={w.key} className="px-1.5 py-1 rounded-md text-xs"
                          style={{
                            background: contentWidthKey === w.key ? "var(--accent-soft)" : "var(--bg-tertiary)",
                            color: contentWidthKey === w.key ? "var(--accent)" : "var(--text-tertiary)",
                            fontWeight: contentWidthKey === w.key ? 600 : 400,
                          }}
                          onClick={() => setContentWidthKey(w.key)}>{w.label}</button>
                      ))}
                    </div>
                  </SettingRow>

                  {/* Paragraph spacing */}
                  <SettingRow label="段距">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs tabular-nums w-6 text-right" style={{ color: "var(--text-tertiary)" }}>{paragraphSpacing.toFixed(1)}</span>
                      <input type="range" min={0} max={2} step={0.1} value={paragraphSpacing}
                        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                        style={{ accentColor: "var(--accent)" }}
                        onChange={(e) => setParagraphSpacing(Number(e.target.value))} />
                    </div>
                  </SettingRow>

                  {/* Text align */}
                  <SettingRow label="对齐">
                    <div className="flex gap-1">
                      <button className="px-2 py-1 rounded-md text-xs"
                        style={{
                          background: textAlign === "left" ? "var(--accent-soft)" : "var(--bg-tertiary)",
                          color: textAlign === "left" ? "var(--accent)" : "var(--text-tertiary)",
                          fontWeight: textAlign === "left" ? 600 : 400,
                        }}
                        onClick={() => setTextAlign("left")}>左</button>
                      <button className="px-2 py-1 rounded-md text-xs"
                        style={{
                          background: textAlign === "justify" ? "var(--accent-soft)" : "var(--bg-tertiary)",
                          color: textAlign === "justify" ? "var(--accent)" : "var(--text-tertiary)",
                          fontWeight: textAlign === "justify" ? 600 : 400,
                        }}
                        onClick={() => setTextAlign("justify")}>两端</button>
                    </div>
                  </SettingRow>

                  {/* Font family */}
                  <SettingRow label="字体">
                    <div className="flex gap-1">
                      {FONT_FAMILIES.map((f) => (
                        <button key={f.key} className="px-1.5 py-1 rounded-md text-xs"
                          style={{
                            background: fontFamilyKey === f.key ? "var(--accent-soft)" : "var(--bg-tertiary)",
                            color: fontFamilyKey === f.key ? "var(--accent)" : "var(--text-tertiary)",
                            fontWeight: fontFamilyKey === f.key ? 600 : 400,
                            fontFamily: f.value,
                          }}
                          onClick={() => setFontFamilyKey(f.key)}>{f.label}</button>
                      ))}
                    </div>
                  </SettingRow>

                  {/* Theme */}
                  <SettingRow label="主题">
                    <div className="flex gap-1">
                      {THEMES.map((t) => (
                        <button key={t.key} className="px-2 py-1 rounded-md text-xs"
                          style={{
                            background: theme === t.key ? "var(--accent-soft)" : "var(--bg-tertiary)",
                            color: theme === t.key ? "var(--accent)" : "var(--text-tertiary)",
                            fontWeight: theme === t.key ? 600 : 400,
                          }}
                          onClick={() => setTheme(t.key)}>{t.label}</button>
                      ))}
                    </div>
                  </SettingRow>

                  {/* Page animation */}
                  <SettingRow label="翻页">
                    <div className="flex gap-1">
                      {[
                        { key: "none", label: "无" },
                        { key: "fade", label: "淡入" },
                        { key: "slide", label: "滑动" },
                      ].map((a) => (
                        <button key={a.key} className="px-1.5 py-1 rounded-md text-xs"
                          style={{
                            background: pageAnimation === a.key ? "var(--accent-soft)" : "var(--bg-tertiary)",
                            color: pageAnimation === a.key ? "var(--accent)" : "var(--text-tertiary)",
                            fontWeight: pageAnimation === a.key ? 600 : 400,
                          }}
                          onClick={() => setPageAnimation(a.key)}>{a.label}</button>
                      ))}
                    </div>
                  </SettingRow>
                </div>
              )}
            </div>

            <Divider />

            {/* Chapter selector */}
            <div className="relative">
              <select
                className="text-xs px-2 py-1.5 rounded-lg outline-none cursor-pointer appearance-none pr-6"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  maxWidth: 200,
                }}
                value={currentChapter.id}
                onChange={(e) => loadChapter(e.target.value)}
              >
                {chapters.map((ch, i) => (
                  <option key={ch.id} value={ch.id}>
                    {i + 1}. {ch.title || `第 ${i + 1} 章`}
                  </option>
                ))}
              </select>
              <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
        </header>

        {/* Chapter content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto relative" onScroll={onScroll}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
                <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading...</div>
              </div>
            </div>
          ) : (
            <article className={`mx-auto px-8 py-12 ${animClass}`}
              style={{
                fontSize: `${fontSize}px`, lineHeight, fontFamily,
                maxWidth: `${contentWidth}px`, textAlign,
                '--reader-paragraph-spacing': `${paragraphSpacing}em`,
              } as React.CSSProperties}>
              <h2 className="text-2xl font-semibold mb-8 pb-4"
                style={{ borderBottom: "1px solid var(--border-light)", color: "var(--text-primary)" }}>
                {currentChapter.title}
              </h2>
              <div className={
                  currentBook.format === "md" || currentBook.format === "markdown"
                    ? "markdown-body select-text" : "whitespace-pre-wrap select-text"
                }
                style={{ color: "var(--text-primary)", letterSpacing: "0.02em" }}
                {...(currentBook.format === "md" || currentBook.format === "markdown"
                  ? { dangerouslySetInnerHTML: { __html: content } } : {}
                )}>
                {currentBook.format === "md" || currentBook.format === "markdown" ? null : content}
              </div>
            </article>
          )}
          <HighlightPopover bookId={currentBook.id} chapterId={currentChapter.id} />
        </div>

        {/* Floating chapter navigation - outside scroll container */}
        {chapterIndex > 0 && (
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-20 rounded-lg flex items-center justify-center z-40 group"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-md)",
              color: "var(--text-tertiary)",
              opacity: 0.3,
              transition: "all 200ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
            onClick={() => loadChapter(chapters[chapterIndex - 1].id)}
            title="上一章"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {chapterIndex < chapters.length - 1 && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-20 rounded-lg flex items-center justify-center z-40 group"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-md)",
              color: "var(--text-tertiary)",
              opacity: 0.3,
              transition: "all 200ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
            onClick={() => loadChapter(chapters[chapterIndex + 1].id)}
            title="下一章"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* Status bar */}
        <footer className="flex items-center justify-between px-5 py-2 flex-shrink-0"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              第 {chapterIndex + 1}/{chapters.length} 章
            </span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {currentChapter.title}
            </span>
            {(() => {
              const chapterChars = currentChapter.char_count ?? 0;
              const readRatio = progress?.chapter_id === currentChapter.id ? (progress.scroll_offset ?? 0) : 0;
              const remainingChars = Math.max(0, chapterChars * (1 - readRatio));
              const remainingMin = Math.max(1, Math.round(remainingChars / charsPerMinute));
              return chapterChars > 0 ? (
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  约剩 {remainingMin} 分钟
                </span>
              ) : null;
            })()}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {currentBook.total_chars?.toLocaleString() || "?"} 字
            </span>
            <div className="w-20 progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--text-tertiary)" }}>{progressPct}%</span>
          </div>
        </footer>
      </div>

      {/* Note panel */}
      <NotePanel bookId={currentBook.id} chapterId={currentChapter.id} visible={showNotes} onClose={() => setShowNotes(false)} onJumpTo={handleJumpTo} />
    </div>
  );
}

/* ---- Small helpers ---- */
function ToolbarBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button className={`px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5 hover-bg`}
      style={{ color: active ? "var(--accent)" : "var(--text-secondary)", background: active ? "var(--accent-soft)" : "transparent" }}
      onClick={onClick}
      title={title}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
      {title}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />;
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}