import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, FilePenLine, List, Pause, Play, Settings } from "lucide-react";
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

import { FONT_FAMILIES, CONTENT_WIDTH_PRESETS, PRESETS, type Preset } from "./reader/constants";

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
  // 每日目标：settings 表持久化（可 WebDAV 同步）；localStorage 旧值首启迁移
  const [dailyGoal, setDailyGoal] = useState<number>(() => Number(localStorage.getItem("reader-daily-goal")) || 0);
  useEffect(() => {
    invoke<number>("get_reading_goal")
      .then((goal) => {
        if (goal > 0) {
          setDailyGoal(goal);
          localStorage.setItem("reader-daily-goal", String(goal));
        } else if (Number(localStorage.getItem("reader-daily-goal")) > 0) {
          // 旧版 localStorage 值迁移到后端
          const legacy = Number(localStorage.getItem("reader-daily-goal"));
          invoke("save_reading_goal", { goal: legacy }).catch(console.error);
        }
      })
      .catch(console.error);
  }, []);
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
    () => localStorage.getItem("reader-page-animation") || "fade"
  );
  const [animClass, setAnimClass] = useState("");
  const [chapterToast, setChapterToast] = useState<string | null>(null);
  const prevChapterRef = useRef<string | null>(null);

  // Apply per-book reading profile when it changes (overrides localStorage defaults).
  // Fires only on load — saveReadingProfile is fire-and-forget by design.
  useEffect(() => {
    if (readingProfile) {
      setFontSize(readingProfile.font_size);
      setLineHeight(readingProfile.line_height);
      setFontFamilyKey(readingProfile.font_family);
      setContentWidthKey(readingProfile.content_width);
      setParagraphSpacing(readingProfile.paragraph_spacing);
      setTextAlign(readingProfile.text_align as "left" | "justify");
      // "none" (scroll mode) is a valid choice too — apply any persisted value.
      if (readingProfile.page_animation) {
        setPageAnimation(readingProfile.page_animation);
      }
      // Keep the preset highlight in sync with the applied values
      const match = PRESETS.find(
        (p) =>
          p.font_size === readingProfile.font_size &&
          Math.abs(p.line_height - readingProfile.line_height) < 0.01 &&
          p.font_family === readingProfile.font_family &&
          p.content_width === readingProfile.content_width &&
          Math.abs(p.paragraph_spacing - readingProfile.paragraph_spacing) < 0.01 &&
          p.text_align === readingProfile.text_align &&
          p.page_animation === readingProfile.page_animation
      );
      setActivePreset(match?.key ?? null);
      if (match) localStorage.setItem("reader-preset", match.key);
      else localStorage.removeItem("reader-preset");
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

  // Cancel any in-flight speech when the reader unmounts (leaving the book).
  useEffect(() => () => stopTts(), [stopTts]);

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
  }, [fontSize, lineHeight, fontFamilyKey, contentWidthKey, paragraphSpacing, textAlign, pageAnimation, currentBook]);

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
          })
            .then(() => invoke<{ name: string }[]>("check_achievements"))
            .then((unlocked) => {
              for (const a of unlocked) {
                showToast(`🏅 解锁成就：${a.name}`, "success");
              }
            })
            .catch(console.error);
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
    invoke("save_reading_goal", { goal: dailyGoal }).catch(console.error);
  }, [dailyGoal]);

  /* ---- Chapter change feedback: toast badge + page animation ----
     Deferred until the new chapter's content has finished loading, so the
     animation/toast play on real content instead of the loading spinner. */
  const pendingFeedbackRef = useRef<{ chapterId: string; prevId: string } | null>(null);
  useEffect(() => {
    const prevId = prevChapterRef.current;
    prevChapterRef.current = currentChapter?.id ?? null;
    if (!currentChapter || !prevId || currentChapter.id === prevId) return;
    pendingFeedbackRef.current = { chapterId: currentChapter.id, prevId };
  }, [currentChapter]);

  useEffect(() => {
    if (loading) return;
    const pending = pendingFeedbackRef.current;
    if (!pending || !currentChapter || pending.chapterId !== currentChapter.id) return;
    pendingFeedbackRef.current = null;

    const newIdx = chapters.findIndex((c) => c.id === currentChapter.id);
    setChapterToast(
      newIdx >= 0 ? `第 ${newIdx + 1} 章 · ${currentChapter.title}` : currentChapter.title
    );
    const toastTimer = setTimeout(() => setChapterToast(null), 1200);

    let animTimer: ReturnType<typeof setTimeout> | undefined;
    if (pageAnimation !== "none") {
      const oldIdx = chapters.findIndex((c) => c.id === pending.prevId);
      const direction = newIdx > oldIdx ? "forward" : "backward";
      const cls = pageAnimation === "fade"
        ? "page-anim-fade"
        : direction === "forward" ? "page-anim-slide-left" : "page-anim-slide-right";
      setAnimClass(cls);
      animTimer = setTimeout(() => setAnimClass(""), 350);
    }
    return () => {
      clearTimeout(toastTimer);
      if (animTimer) clearTimeout(animTimer);
    };
  }, [loading, currentChapter, pageAnimation, chapters]);

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
<BookOpen size={ 40 } strokeWidth={1.5} />
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
              <ChevronLeft size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn active={showSidebar} onClick={() => setShowSidebar(!showSidebar)} title="目录">
              <List size={14} strokeWidth={2} />
            </ToolbarBtn>
            <ToolbarBtn active={showNotes} onClick={() => setShowNotes(!showNotes)} title="笔记">
              <FilePenLine size={14} strokeWidth={2} />
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
                <Pause size={14} strokeWidth={2} />
              ) : (
                <Play size={14} strokeWidth={2} />
              )}
            </ToolbarBtn>

            {/* Settings button */}
            <div className="relative" ref={settingsRef}>
              <ToolbarBtn active={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} title="设置">
                <Settings size={14} strokeWidth={2} />
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
<ChevronDown size={ 10 } strokeWidth={2} />
            </div>
          </div>
        </header>

        {/* Chapter change toast badge */}
        {chapterToast && (
          <div className="absolute left-1/2 top-14 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-xs animate-slide-down pointer-events-none"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-md)",
              zIndex: "var(--z-popover)",
              maxWidth: "70%",
            }}>
            <span className="truncate block">{chapterToast}</span>
          </div>
        )}

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

        {/* Floating chapter navigation — edge hot-zone reveals the button */}
        {chapterIndex > 0 && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 group pl-1.5 pr-3 py-8"
            style={{ zIndex: "var(--z-popover)" }}
          >
            <button
              className="w-10 h-24 rounded-lg flex items-center justify-center text-[var(--text-secondary)] opacity-60 -translate-x-1 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-[var(--accent)]"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md)",
              }}
              onClick={() => loadChapter(chapters[chapterIndex - 1].id)}
              title="上一章"
            >
<ChevronRight size={ 18 } strokeWidth={2} />
            </button>
          </div>
        )}
        {chapterIndex < chapters.length - 1 && !showNotes && (
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 group pr-1.5 pl-3 py-8"
            style={{ zIndex: "var(--z-popover)" }}
          >
            <button
              className="w-10 h-24 rounded-lg flex items-center justify-center text-[var(--text-secondary)] opacity-60 translate-x-1 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-[var(--accent)]"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md)",
              }}
              onClick={() => loadChapter(chapters[chapterIndex + 1].id)}
              title="下一章"
            >
<ChevronLeft size={ 18 } strokeWidth={2} />
            </button>
          </div>
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