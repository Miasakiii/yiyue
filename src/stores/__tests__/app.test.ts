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
});
