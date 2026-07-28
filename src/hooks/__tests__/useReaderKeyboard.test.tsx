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
  renderHook(() =>
    useReaderKeyboard({
      currentChapter,
      chapters,
      loadChapter,
      setFontSize: vi.fn(),
      setShowSidebar: vi.fn(),
      setShowNotes: vi.fn(),
      setSettingsOpen: vi.fn(),
      settingsOpen: false,
      showNotes: false,
      showSidebar: false,
      toggleFullscreen: vi.fn(),
      handleAddBookmark: vi.fn(),
      currentBook: null,
    })
  );
  return { loadChapter };
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

  it("does not preventDefault on ArrowRight at the last chapter (dead-key passthrough)", () => {
    setup(chapters[2]);
    // fireEvent returns false only when preventDefault was called
    const notPrevented = fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(notPrevented).toBe(true);
  });
});
