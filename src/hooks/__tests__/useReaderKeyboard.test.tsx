import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook, fireEvent } from "@testing-library/react";
import { useReaderKeyboard } from "../useReaderKeyboard";
import type { Chapter } from "../../types";

// Mock @tauri-apps/api/core (pulled in transitively via stores/app)
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const chapters = [
  { id: "ch1", book_id: "b1", title: "第一章", level: 1, sort_order: 0, start_offset: 0, end_offset: 100, char_count: 100 },
  { id: "ch2", book_id: "b1", title: "第二章", level: 1, sort_order: 1, start_offset: 100, end_offset: 200, char_count: 100 },
  { id: "ch3", book_id: "b1", title: "第三章", level: 1, sort_order: 2, start_offset: 200, end_offset: 300, char_count: 100 },
] as Chapter[];

function setup(currentChapter: Chapter = chapters[0]) {
  const loadChapter = vi.fn();
  const setFontSize = vi.fn();
  const setShowSidebar = vi.fn();
  const setShowNotes = vi.fn();
  const toggleImmersive = vi.fn();
  const handleAddBookmark = vi.fn();
  renderHook(() =>
    useReaderKeyboard({
      currentChapter,
      chapters,
      loadChapter,
      setFontSize,
      setShowSidebar,
      setShowNotes,
      setSettingsOpen: vi.fn(),
      settingsOpen: false,
      showNotes: false,
      showSidebar: false,
      toggleImmersive,
      handleAddBookmark,
      currentBook: null,
    })
  );
  return { loadChapter, setFontSize, setShowSidebar, setShowNotes, toggleImmersive, handleAddBookmark };
}

describe("useReaderKeyboard input guard", () => {
  afterEach(() => {
    delete document.body.dataset.modalOpen;
  });

  it("ignores arrow keys pressed inside <input>", () => {
    const { loadChapter } = setup();
    const { getByTestId } = render(<input data-testid="field" />);

    fireEvent.keyDown(getByTestId("field"), { key: "ArrowRight" });
    fireEvent.keyDown(getByTestId("field"), { key: "PageDown" });

    expect(loadChapter).not.toHaveBeenCalled();
  });

  it("ignores arrow keys pressed inside <textarea>", () => {
    const { loadChapter } = setup(chapters[1]);
    const { getByTestId } = render(<textarea data-testid="field" />);

    fireEvent.keyDown(getByTestId("field"), { key: "ArrowLeft" });
    fireEvent.keyDown(getByTestId("field"), { key: "PageUp" });

    expect(loadChapter).not.toHaveBeenCalled();
  });

  it("navigates to the next chapter from a plain element", () => {
    const { loadChapter } = setup();

    fireEvent.keyDown(document.body, { key: "ArrowRight" });

    expect(loadChapter).toHaveBeenCalledTimes(1);
    expect(loadChapter).toHaveBeenCalledWith("ch2");
  });

  it("navigates to the previous chapter from a plain element", () => {
    const { loadChapter } = setup(chapters[1]);

    fireEvent.keyDown(document.body, { key: "PageUp" });

    expect(loadChapter).toHaveBeenCalledTimes(1);
    expect(loadChapter).toHaveBeenCalledWith("ch1");
  });

  it("does nothing on ArrowRight in the last chapter", () => {
    const { loadChapter } = setup(chapters[2]);

    fireEvent.keyDown(document.body, { key: "ArrowRight" });

    expect(loadChapter).not.toHaveBeenCalled();
  });

  it("ignores navigation keys while a modal overlay owns the keyboard", () => {
    const { loadChapter } = setup();
    document.body.dataset.modalOpen = "true";

    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "PageDown" });

    expect(loadChapter).not.toHaveBeenCalled();
  });

  it("consumes the key when a page actually turns, but lets it fall through at the boundary", () => {
    // Middle chapter: navigation happens, default is prevented
    const { loadChapter } = setup(chapters[1]);
    const consumed = !fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(consumed).toBe(true);
    expect(loadChapter).toHaveBeenCalledWith("ch3");
  });

  it("turns in-chapter page via tryTurnPage before switching chapters", () => {
    const tryTurnPage = vi.fn(() => true);
    const loadChapter = vi.fn();
    renderHook(() =>
      useReaderKeyboard({
        currentChapter: chapters[0],
        chapters,
        loadChapter,
        setFontSize: vi.fn(),
        setShowSidebar: vi.fn(),
        setShowNotes: vi.fn(),
        setSettingsOpen: vi.fn(),
        settingsOpen: false,
        showNotes: false,
        showSidebar: false,
        toggleImmersive: vi.fn(),
        handleAddBookmark: vi.fn(),
        currentBook: null,
        tryTurnPage,
      }),
    );

    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(tryTurnPage).toHaveBeenCalledWith(1);
    expect(loadChapter).not.toHaveBeenCalled();
  });

  it("falls through to next chapter when tryTurnPage returns false", () => {
    const tryTurnPage = vi.fn(() => false);
    const loadChapter = vi.fn();
    renderHook(() =>
      useReaderKeyboard({
        currentChapter: chapters[0],
        chapters,
        loadChapter,
        setFontSize: vi.fn(),
        setShowSidebar: vi.fn(),
        setShowNotes: vi.fn(),
        setSettingsOpen: vi.fn(),
        settingsOpen: false,
        showNotes: false,
        showSidebar: false,
        toggleImmersive: vi.fn(),
        handleAddBookmark: vi.fn(),
        currentBook: null,
        tryTurnPage,
      }),
    );

    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(tryTurnPage).toHaveBeenCalledWith(1);
    expect(loadChapter).toHaveBeenCalledWith("ch2");
  });

  it("does not preventDefault on ArrowRight at the last chapter (dead-key passthrough)", () => {
    setup(chapters[2]);
    // fireEvent returns false only when preventDefault was called
    const notPrevented = fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(notPrevented).toBe(true);
  });
});

// 自 TEST_CHECKLIST.md「键盘快捷键」迁移的自动化回归（迁移日期 2026-07-28）：
// Ctrl+= 增大字号 / Ctrl+- 缩小字号 / Ctrl+B 目录侧边栏 / Ctrl+N 笔记面板 / F11 沉浸阅读
describe("useReaderKeyboard shortcuts (migrated from TEST_CHECKLIST.md)", () => {
  /** 取最近一次 setFontSize 收到的 updater，验证其对给定字号的计算结果 */
  function lastFontUpdater(setFontSize: ReturnType<typeof vi.fn>) {
    const calls = setFontSize.mock.calls;
    return calls[calls.length - 1][0] as (n: number) => number;
  }

  it("Ctrl+= increases font size by 2, capped at 36", () => {
    const { setFontSize } = setup();

    fireEvent.keyDown(document.body, { key: "=", ctrlKey: true });

    expect(setFontSize).toHaveBeenCalledTimes(1);
    const updater = lastFontUpdater(setFontSize);
    expect(updater(16)).toBe(18);
    expect(updater(36)).toBe(36);
    expect(updater(35)).toBe(36);
  });

  it("Ctrl+- decreases font size by 2, floored at 12", () => {
    const { setFontSize } = setup();

    fireEvent.keyDown(document.body, { key: "-", ctrlKey: true });

    expect(setFontSize).toHaveBeenCalledTimes(1);
    const updater = lastFontUpdater(setFontSize);
    expect(updater(16)).toBe(14);
    expect(updater(12)).toBe(12);
    expect(updater(13)).toBe(12);
  });

  it("Ctrl+B toggles the sidebar (without adding a bookmark)", () => {
    const { setShowSidebar, handleAddBookmark } = setup();

    fireEvent.keyDown(document.body, { key: "b", ctrlKey: true });

    expect(setShowSidebar).toHaveBeenCalledTimes(1);
    expect(handleAddBookmark).not.toHaveBeenCalled();
    // 传入的是取反 updater：true -> false，false -> true
    const updater = setShowSidebar.mock.calls[0][0] as (prev: boolean) => boolean;
    expect(updater(true)).toBe(false);
    expect(updater(false)).toBe(true);
  });

  it("Ctrl+Shift+B adds a bookmark instead of toggling the sidebar", () => {
    const { setShowSidebar, handleAddBookmark } = setup();

    fireEvent.keyDown(document.body, { key: "B", ctrlKey: true, shiftKey: true });

    expect(handleAddBookmark).toHaveBeenCalledTimes(1);
    expect(setShowSidebar).not.toHaveBeenCalled();
  });

  it("Ctrl+N toggles the notes panel", () => {
    const { setShowNotes } = setup();

    fireEvent.keyDown(document.body, { key: "n", ctrlKey: true });

    expect(setShowNotes).toHaveBeenCalledTimes(1);
    const updater = setShowNotes.mock.calls[0][0] as (prev: boolean) => boolean;
    expect(updater(false)).toBe(true);
    expect(updater(true)).toBe(false);
  });

  it("F11 toggles immersive reading", () => {
    const { toggleImmersive } = setup();

    fireEvent.keyDown(document.body, { key: "F11" });

    expect(toggleImmersive).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts typed inside an input (guard also covers migrated keys)", () => {
    const { setFontSize, setShowSidebar } = setup();
    const { getByTestId } = render(<input data-testid="field" />);

    fireEvent.keyDown(getByTestId("field"), { key: "=", ctrlKey: true });
    fireEvent.keyDown(getByTestId("field"), { key: "b", ctrlKey: true });

    expect(setFontSize).not.toHaveBeenCalled();
    expect(setShowSidebar).not.toHaveBeenCalled();
  });
});
