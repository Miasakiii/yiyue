import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { useAppStore } from "../stores/app";
import { NotePanel } from "../components/NotePanel";
import { useFullscreen } from "../hooks/useFullscreen";
import { useReaderKeyboard } from "../hooks/useReaderKeyboard";
import { showToast } from "../components/Toast";
import { ToolbarBtn, Divider } from "./reader/helpers";
import { ReaderSettings } from "./reader/ReaderSettings";
import { ReaderSidebar } from "./reader/ReaderSidebar";
import { ReaderStatusBar } from "./reader/ReaderStatusBar";
import { ReaderContent } from "./reader/ReaderContent";
import type { SaveReadingProfile, Bookmark } from "../types";

import { FONT_FAMILIES, CONTENT_WIDTH_PRESETS, type Preset } from "./reader/constants";

/* ---------- Component ---------- */
export function Reader() {
  const navigate = useNavigate();
  const {
    currentBook, chapters, currentChapter, progress, readingProfile,
    bookmarks, createBookmark, deleteBookmark, closeBook, contentVersion,
    updateProgress, loadChapter, theme, setTheme, saveReadingProfile,
  } = useAppStore();

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [charsPerMinute, setCharsPerMinute] = useState(300);
  const [dailyGoal, setDailyGoal] = useState(() => Number(localStorage.getItem("reader-daily-goal")) || 0);
  const [todayStats, setTodayStats] = useState<{ date: string; chars_read: number; duration_ms: number; sessions: number } | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [activePreset, setActivePreset] = useState(() => localStorage.getItem("reader-preset") || null);

  const applyPreset = (preset: Preset) => {
    setFontSize(preset.font_size);
    setLineHeight(preset.line_height);
    setFontFamilyKey(preset.font_family as "default" | "serif" | "mono");
    setContentWidthKey(preset.content_width as "narrow" | "medium" | "wide" | "full");
    setParagraphSpacing(preset.paragraph_spacing);
    setTextAlign(preset.text_align);
    setPageAnimation(preset.page_animation);
  };

  // Markdown content is rendered as HTML — sanitize it to prevent XSS from
  // untrusted local files. Pure-text formats bypass this path entirely.
  const isMarkdown =
    currentBook?.format === "md" || currentBook?.format === "markdown";
  const sanitizedHtml = useMemo(() => {
    if (!isMarkdown || !content) return "";
    return DOMPurify.sanitize(content, { USE_PROFILES: { html: true } });
  }, [content, isMarkdown]);

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

  /* ---- TTS (Text-to-Speech) ---- */
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ttsRate, setTtsRate] = useState(() => Number(localStorage.getItem("reader-tts-rate")) || 1.0);
  const [ttsVoice, setTtsVoice] = useState<string | null>(null);

  const getPlainText = useCallback(() => {
    if (!content) return "";
    if (isMarkdown) {
      return content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    }
    return content;
  }, [content, isMarkdown]);

  const startTts = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      showToast("当前环境不支持语音朗读", "error");
      return;
    }
    const text = getPlainText();
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = ttsRate;
    if (ttsVoice) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === ttsVoice);
      if (voice) utterance.voice = voice;
    }
    utterance.onend = () => {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    setIsPaused(false);
  }, [getPlainText, ttsRate, ttsVoice, showToast]);

  const pauseTts = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeTts = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const stopTts = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("reader-tts-rate", String(ttsRate));
  }, [ttsRate]);

  // Stop TTS when chapter changes
  useEffect(() => {
    stopTts();
  }, [currentChapter?.id, stopTts]);

  // Load available voices
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.startsWith("zh"));
      if (zhVoice) setTtsVoice(zhVoice.name);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

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

  /* ---- Load today's reading stats for goal progress ---- */
  useEffect(() => {
    if (!currentBook) return;
    invoke<{ date: string; chars_read: number; duration_ms: number; sessions: number }[]>("get_daily_stats", { days: 1 })
      .then((stats) => {
        if (stats && stats.length > 0) {
          setTodayStats(stats[0]);
        } else {
          setTodayStats({ date: "", chars_read: 0, duration_ms: 0, sessions: 0 });
        }
      })
      .catch(() => setTodayStats({ date: "", chars_read: 0, duration_ms: 0, sessions: 0 }));
  }, [currentBook]);

  // Persist daily goal
  useEffect(() => {
    localStorage.setItem("reader-daily-goal", String(dailyGoal));
  }, [dailyGoal]);

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
  }, [currentChapter, contentVersion]);

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

  /* ---- Bookmarks ---- */
  const handleAddBookmark = useCallback(() => {
    if (!currentBook || !currentChapter) return;
    const chapterIdx = chapters.findIndex((c) => c.id === currentChapter.id);
    const scrollOffset = progress?.scroll_offset ?? 0;
    const chapterTitle = currentChapter.title || `第 ${chapterIdx + 1} 章`;
    const title = `${chapterIdx + 1}. ${chapterTitle} · ${Math.round(scrollOffset * 100)}%`;
    createBookmark({
      book_id: currentBook.id,
      chapter_id: currentChapter.id,
      scroll_offset: scrollOffset,
      title,
    })
      .then(() => {
        showToast("已添加书签", "success");
        setShowSidebar(true);
      })
      .catch(() => {});
  }, [currentBook, currentChapter, chapters, progress, createBookmark]);

  const handleJumpToBookmark = (bookmark: Bookmark) => {
    if (!bookmark.chapter_id) return;
    loadChapter(bookmark.chapter_id).then(() => {
      setTimeout(() => {
        if (!contentRef.current) return;
        const el = contentRef.current;
        const scrollHeight = el.scrollHeight - el.clientHeight;
        el.scrollTop = bookmark.scroll_offset * scrollHeight;
        setShowSidebar(false);
      }, 150);
    });
  };

  /* ---- Keyboard navigation ---- */
  useReaderKeyboard({
    currentChapter, chapters, loadChapter, setFontSize,
    setShowSidebar, setShowNotes, setSettingsOpen,
    settingsOpen, showNotes, showSidebar,
    toggleFullscreen, handleAddBookmark, currentBook,
  });

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

  const goBack = () => {
    if (currentBook) handleScroll();
    useAppStore.getState().closeBook();
    navigate("/");
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
      <div className="flex items-center justify-center h-full" style={{ background: "var(--bg-primary)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>加载中…</div>
        </div>
      </div>
    );
  }

  if (!currentChapter) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
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
    <div className="flex h-full overflow-hidden" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Sidebar - Chapter list */}
      {showSidebar && (
        <ReaderSidebar
          chapters={chapters}
          currentChapter={currentChapter}
          goToChapter={goToChapter}
          bookmarks={bookmarks}
          addBookmark={handleAddBookmark}
          deleteBookmark={deleteBookmark}
          jumpToBookmark={handleJumpToBookmark}
        />
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
            {/* TTS button — directly toggles speak/pause/resume */}
            <ToolbarBtn
              active={isSpeaking}
              onClick={() => (isSpeaking ? (isPaused ? resumeTts() : pauseTts()) : startTts())}
              title={isSpeaking ? (isPaused ? "继续" : "暂停") : "朗读"}>
              {isSpeaking && !isPaused ? (
                <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>
              ) : (
                <polygon points="5 3 19 12 5 21 5 3" />
              )}
            </ToolbarBtn>

            {/* Settings button */}
            <div className="relative" ref={settingsRef}>
              <ToolbarBtn active={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} title="设置">
                <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2 2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-.33-1.82l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1-2.83 0l-.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2 2 2 2 0 0 1 2 2h.09a1.65 1.65 0 0 0-1.51 1z" /></>
              </ToolbarBtn>

              {/* Settings Popover */}
              {settingsOpen && (
                <ReaderSettings
                  fontSize={fontSize} setFontSize={setFontSize}
                  lineHeight={lineHeight} setLineHeight={setLineHeight}
                  fontFamilyKey={fontFamilyKey} setFontFamilyKey={setFontFamilyKey}
                  contentWidthKey={contentWidthKey} setContentWidthKey={setContentWidthKey}
                  paragraphSpacing={paragraphSpacing} setParagraphSpacing={setParagraphSpacing}
                  textAlign={textAlign} setTextAlign={setTextAlign}
                  pageAnimation={pageAnimation} setPageAnimation={setPageAnimation}
                  theme={theme} setTheme={setTheme}
                  activePreset={activePreset} applyPreset={applyPreset}
                  setActivePreset={setActivePreset}
                  isSpeaking={isSpeaking} isPaused={isPaused}
                  startTts={startTts} pauseTts={pauseTts} resumeTts={resumeTts} stopTts={stopTts}
                  ttsRate={ttsRate} setTtsRate={setTtsRate}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>

            <Divider />

            {/* Chapter selector */}
            <div className="relative">
              <select
                className="text-xs px-2 py-1.5 rounded outline-none cursor-pointer appearance-none pr-6"
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
        <ReaderContent
          content={content}
          loading={loading}
          isMarkdown={isMarkdown}
          sanitizedHtml={sanitizedHtml}
          currentChapter={currentChapter}
          fontSize={fontSize}
          lineHeight={lineHeight}
          fontFamily={fontFamily}
          contentWidth={contentWidth}
          textAlign={textAlign}
          paragraphSpacing={paragraphSpacing}
          animClass={animClass}
          contentRef={contentRef}
          onScroll={onScroll}
          bookId={currentBook.id}
          chapterId={currentChapter.id}
        />

        {/* Floating chapter navigation - outside scroll container */}
        {chapterIndex > 0 && (
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-20 rounded-lg flex items-center justify-center opacity-30 hover:opacity-100 hover:text-[var(--text-primary)]"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-md)",
              color: "var(--text-tertiary)",
              transition: "all var(--transition-fast)",
              zIndex: "var(--z-popover)",
            }}
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
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-20 rounded-lg flex items-center justify-center opacity-30 hover:opacity-100 hover:text-[var(--text-primary)]"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-md)",
              color: "var(--text-tertiary)",
              transition: "all var(--transition-fast)",
              zIndex: "var(--z-popover)",
            }}
            onClick={() => loadChapter(chapters[chapterIndex + 1].id)}
            title="下一章"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* Status bar */}
        <ReaderStatusBar
          chapterIndex={chapterIndex}
          chapters={chapters}
          currentChapter={currentChapter}
          currentBook={currentBook}
          progress={progress}
          charsPerMinute={charsPerMinute}
          dailyGoal={dailyGoal}
          setDailyGoal={setDailyGoal}
          todayStats={todayStats}
          progressPct={progressPct}
          editingGoal={editingGoal}
          setEditingGoal={setEditingGoal}
          goalInput={goalInput}
          setGoalInput={setGoalInput}
        />
      </div>

      {/* Note panel */}
      <NotePanel bookId={currentBook.id} chapterId={currentChapter.id} visible={showNotes} onClose={() => setShowNotes(false)} onJumpTo={handleJumpTo} />
    </div>
  );
}