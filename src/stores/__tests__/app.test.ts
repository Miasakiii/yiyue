import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../app";

const mockInvoke = vi.mocked(invoke);

describe("useAppStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAppStore.setState({
      books: [],
      loading: false,
      currentBook: null,
      chapters: [],
      currentChapter: null,
      progress: null,
      contentVersion: 0,
      tags: [],
      groups: [],
    });
  });

  describe("loadBooks", () => {
    it("should load books and set loading state", async () => {
      const fakeBooks = [
        {
          id: "1",
          kind: "novel",
          title: "测试书",
          author: "作者",
          format: "txt",
          cover_path: null,
          file_size: 1024,
          total_chapters: 10,
          added_at: "2026-01-01",
          updated_at: "2026-01-01",
          reading_percentage: 0,
          starred: false,
        },
      ];
      mockInvoke.mockResolvedValueOnce(fakeBooks);

      await useAppStore.getState().loadBooks();

      const state = useAppStore.getState();
      expect(state.books).toEqual(fakeBooks);
      expect(state.loading).toBe(false);
      expect(mockInvoke).toHaveBeenCalledWith("get_books", { filter: {} });
    });

    it("should handle loadBooks error gracefully", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("db error"));

      await useAppStore.getState().loadBooks();

      const state = useAppStore.getState();
      expect(state.books).toEqual([]);
      expect(state.loading).toBe(false);
    });
  });

  describe("openBook", () => {
    it("should open a book and load chapters", async () => {
      const fakeBook = {
        id: "1",
        kind: "novel",
        title: "测试书",
        author: null,
        file_hash: "abc",
        file_path: "abc.txt",
        file_size: 1024,
        format: "txt",
        cover_path: null,
        description: null,
        language: "zh",
        total_chapters: 2,
        total_chars: 1000,
        metadata_json: null,
        reading_mode: null,
        added_at: "2026-01-01",
        updated_at: "2026-01-01",
      };
      const fakeChapters = [
        {
          id: "ch1",
          book_id: "1",
          title: "第一章",
          level: 1,
          sort_order: 0,
          start_offset: 0,
          end_offset: 500,
          char_count: 500,
        },
        {
          id: "ch2",
          book_id: "1",
          title: "第二章",
          level: 1,
          sort_order: 1,
          start_offset: 500,
          end_offset: 1000,
          char_count: 500,
        },
      ];

      mockInvoke
        .mockResolvedValueOnce(fakeBook)
        .mockResolvedValueOnce(fakeChapters)
        .mockResolvedValueOnce(null);

      await useAppStore.getState().openBook("1");

      const state = useAppStore.getState();
      expect(state.currentBook).toEqual(fakeBook);
      expect(state.chapters).toEqual(fakeChapters);
      expect(state.currentChapter).toEqual(fakeChapters[0]);
    });
  });

  describe("setTheme", () => {
    it("should apply theme class to document", () => {
      const addSpy = vi.spyOn(document.documentElement.classList, "add");
      const removeSpy = vi.spyOn(document.documentElement.classList, "remove");

      useAppStore.getState().setTheme("dark");

      expect(removeSpy).toHaveBeenCalledWith("dark", "sepia");
      expect(addSpy).toHaveBeenCalledWith("dark");
      expect(useAppStore.getState().theme).toBe("dark");

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe("setViewMode", () => {
    it("should update viewMode", () => {
      useAppStore.getState().setViewMode("list");
      expect(useAppStore.getState().viewMode).toBe("list");
    });
  });

  describe("closeBook", () => {
    it("should clear current book state", () => {
      useAppStore.setState({
        currentBook: { id: "1" } as any,
        chapters: [{ id: "ch1" }] as any,
        currentChapter: { id: "ch1" } as any,
        progress: { book_id: "1" } as any,
      });

      useAppStore.getState().closeBook();

      const state = useAppStore.getState();
      expect(state.currentBook).toBeNull();
      expect(state.chapters).toEqual([]);
      expect(state.currentChapter).toBeNull();
      expect(state.progress).toBeNull();
    });
  });

  describe("saveReadingProfile", () => {
    it("fires and forgets: does not reload the profile after saving", async () => {
      const existing = { book_id: "b1", font_size: 18 } as any;
      useAppStore.setState({ readingProfile: existing });
      mockInvoke.mockResolvedValueOnce(undefined); // save_reading_profile

      await useAppStore.getState().saveReadingProfile("b1", { font_size: 20 } as any);

      // Only the save call — reloading would re-trigger the Reader apply
      // effect and yank settings back (the "change one, others jump" loop).
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith("save_reading_profile", {
        bookId: "b1",
        profile: { font_size: 20 },
      });
      expect(useAppStore.getState().readingProfile).toBe(existing);
    });
  });

  describe("filter state sync", () => {
    it("setActiveTag stores exactly the tag filter (drops stale keys)", async () => {
      useAppStore.setState({ filter: { starred: true } as any });
      mockInvoke.mockResolvedValueOnce([]); // get_books

      useAppStore.getState().setActiveTag("科幻");

      // Stale `starred` must not leak into the tag view, or later no-arg
      // loadBooks() calls would silently keep the old constraint.
      expect(useAppStore.getState().filter).toEqual({ tag: "科幻" });
      expect(useAppStore.getState().activeTag).toBe("科幻");
      expect(useAppStore.getState().activeGroup).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith("get_books", { filter: { tag: "科幻" } });
    });

    it("setActiveGroup stores exactly the group filter", async () => {
      useAppStore.setState({ filter: { tag: "旧标签" } as any });
      mockInvoke.mockResolvedValueOnce([]); // get_books

      useAppStore.getState().setActiveGroup("g1");

      expect(useAppStore.getState().filter).toEqual({ group: "g1" });
      expect(useAppStore.getState().activeTag).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith("get_books", { filter: { group: "g1" } });
    });
  });

  describe("applyRulesToBook", () => {
    it("should bump contentVersion when rules are applied to the open book", async () => {
      mockInvoke
        .mockResolvedValueOnce(3) // apply_rules_to_book → replaced count
        .mockResolvedValueOnce([]); // loadBooks → get_books
      useAppStore.setState({
        currentBook: { id: "b1" } as any,
        currentChapter: { id: "c1" } as any,
        contentVersion: 0,
      });

      const count = await useAppStore.getState().applyRulesToBook("b1");

      expect(count).toBe(3);
      expect(mockInvoke).toHaveBeenCalledWith("apply_rules_to_book", { bookId: "b1" });
      expect(useAppStore.getState().contentVersion).toBe(1);
    });

    it("should not bump contentVersion when another book is affected", async () => {
      mockInvoke
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce([]);
      useAppStore.setState({
        currentBook: { id: "b1" } as any,
        currentChapter: { id: "c1" } as any,
        contentVersion: 5,
      });

      await useAppStore.getState().applyRulesToBook("other-book");

      expect(useAppStore.getState().contentVersion).toBe(5);
    });
  });
});
