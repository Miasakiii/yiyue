import { useEffect } from "react";
import { useAppStore } from "../stores/app";
import { showToast } from "../components/Toast";
import type { Chapter } from "../types";

interface UseReaderKeyboardOpts {
  currentChapter: Chapter | null;
  chapters: Chapter[];
  loadChapter: (id: string) => void;
  setFontSize: (fn: (n: number) => number) => void;
  setShowSidebar: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowNotes: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSettingsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  settingsOpen: boolean;
  showNotes: boolean;
  showSidebar: boolean;
  toggleFullscreen: () => void;
  handleAddBookmark: () => void;
  currentBook: { id: string } | null;
}

export function useReaderKeyboard({
  currentChapter, chapters, loadChapter, setFontSize,
  setShowSidebar, setShowNotes, setSettingsOpen,
  settingsOpen, showNotes, showSidebar,
  toggleFullscreen, handleAddBookmark, currentBook,
}: UseReaderKeyboardOpts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts while typing in inputs/textareas/selects (e.g. note
      // editor, goal input, search box) so arrows/PageUp/PageDown don't flip chapters.
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
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
      } else if ((e.key === "b" || e.key === "B") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          handleAddBookmark();
        } else {
          setShowSidebar((s) => !s);
        }
      } else if (e.key === "n" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowNotes((s) => !s);
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (currentBook) {
          useAppStore.getState().toggleFavorite(currentBook.id);
          showToast("已切换收藏状态", "success");
        }
      } else if (e.key === "g" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSidebar(true);
      } else if (e.key === "f" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("open-search"));
      } else if (e.key === "Escape") {
        // Only swallow Esc when there is actually a panel/popover to close.
        if (settingsOpen) { e.preventDefault(); setSettingsOpen(false); }
        else if (showNotes) { e.preventDefault(); setShowNotes(false); }
        else if (showSidebar) { e.preventDefault(); setShowSidebar(false); }
      } else if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentChapter, chapters, loadChapter, setFontSize, setShowSidebar, setShowNotes, setSettingsOpen, settingsOpen, showNotes, showSidebar, currentBook, handleAddBookmark, toggleFullscreen]);
}
