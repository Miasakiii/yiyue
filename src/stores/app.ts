import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  Book,
  BookListItem,
  BookFilter,
  Chapter,
  ReadingProgress,
  UpdateProgress,
  Tag,
  Group,
} from "../types";

interface AppState {
  // Library
  books: BookListItem[];
  loading: boolean;
  filter: BookFilter;
  viewMode: "grid" | "list";

  // Current book
  currentBook: Book | null;
  chapters: Chapter[];
  currentChapter: Chapter | null;
  progress: ReadingProgress | null;

  // Tags & Groups
  tags: Tag[];
  groups: Group[];
  activeTag: string | null;
  activeGroup: string | null;

  // Theme
  theme: "light" | "dark" | "sepia";

  // Actions
  loadBooks: (filter?: BookFilter) => Promise<void>;
  setFilter: (filter: BookFilter) => void;
  setViewMode: (mode: "grid" | "list") => void;
  openBook: (bookId: string) => Promise<void>;
  closeBook: () => void;
  loadChapter: (chapterId: string) => Promise<string>;
  updateProgress: (bookId: string, progress: UpdateProgress) => Promise<void>;
  toggleFavorite: (bookId: string) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  importBook: (filePath: string, encoding?: string) => Promise<Book>;
  setTheme: (theme: "light" | "dark" | "sepia") => void;

  // Tag actions
  loadTags: () => Promise<void>;
  createTag: (name: string, color?: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  setActiveTag: (tag: string | null) => void;

  // Group actions
  loadGroups: () => Promise<void>;
  createGroup: (name: string, icon?: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  setActiveGroup: (groupId: string | null) => void;

  // Book-Tag/Group actions
  addBookTag: (bookId: string, tagId: string) => Promise<void>;
  removeBookTag: (bookId: string, tagId: string) => Promise<void>;
  getBookTags: (bookId: string) => Promise<Tag[]>;
  addBookGroup: (bookId: string, groupId: string) => Promise<void>;
  removeBookGroup: (bookId: string, groupId: string) => Promise<void>;
  getBookGroups: (bookId: string) => Promise<Group[]>;
}

export const useAppStore = create<AppState>((set, get) => ({
  books: [],
  loading: false,
  filter: {},
  viewMode: "grid",
  currentBook: null,
  chapters: [],
  currentChapter: null,
  progress: null,
  tags: [],
  groups: [],
  activeTag: null,
  activeGroup: null,
  theme: (localStorage.getItem("reader-theme") as "light" | "dark" | "sepia") || "light",

  loadBooks: async (filter?: BookFilter) => {
    set({ loading: true });
    try {
      const books = await invoke<BookListItem[]>("get_books", {
        filter: filter || get().filter,
      });
      set({ books, loading: false });
    } catch (e) {
      console.error("Failed to load books:", e);
      set({ loading: false });
    }
  },

  setFilter: (filter: BookFilter) => {
    set({ filter });
    get().loadBooks(filter);
  },

  setViewMode: (mode: "grid" | "list") => {
    set({ viewMode: mode });
  },

  openBook: async (bookId: string) => {
    try {
      const book = await invoke<Book>("get_book", { id: bookId });
      const chapters = await invoke<Chapter[]>("get_chapters", { bookId });
      const progress = await invoke<ReadingProgress | null>("get_progress", {
        bookId,
      });

      set({ currentBook: book, chapters, progress });

      // Load the current chapter — always resolve to a valid chapter
      let chapter: Chapter | undefined;
      if (progress?.chapter_id) {
        chapter = chapters.find((c) => c.id === progress.chapter_id);
      }
      if (!chapter && chapters.length > 0) {
        chapter = chapters[0];
      }
      set({ currentChapter: chapter ?? null });
    } catch (e: any) {
      const msg = e?.toString() || String(e);
      console.error("Failed to open book:", e);
      // Show error to user
      alert(`打开书籍失败: ${msg}`);
    }
  },

  closeBook: () => {
    set({ currentBook: null, chapters: [], currentChapter: null, progress: null });
  },

  loadChapter: async (chapterId: string) => {
    const chapter = get().chapters.find((c) => c.id === chapterId);
    if (chapter) {
      set({ currentChapter: chapter });
      // Fetch content via IPC — the Reader component also does this in its
      // own useEffect, but having it here allows callers (e.g. keyboard nav)
      // to preload content without waiting for the Reader to re-render.
      try {
        const content = await invoke<string>("get_chapter_content", { chapterId });
        return content;
      } catch (e) {
        console.error("Failed to load chapter content:", e);
        return "";
      }
    }
    return "";
  },

  updateProgress: async (bookId: string, progress: UpdateProgress) => {
    try {
      await invoke("update_progress", { bookId, progress });
      const updated = await invoke<ReadingProgress | null>("get_progress", {
        bookId,
      });
      set({ progress: updated });
    } catch (e) {
      console.error("Failed to update progress:", e);
    }
  },

  toggleFavorite: async (bookId: string) => {
    try {
      await invoke("toggle_favorite", { bookId });
      get().loadBooks();
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  },

  deleteBook: async (bookId: string) => {
    try {
      await invoke("delete_book", { id: bookId });
      get().loadBooks();
    } catch (e) {
      console.error("Failed to delete book:", e);
    }
  },

  importBook: async (filePath: string, encoding?: string) => {
    const result = await invoke<{ book: Book; warnings: string[] }>(
      "import_book",
      { filePath, encoding }
    );
    get().loadBooks();
    return result.book;
  },

  setTheme: (theme: "light" | "dark" | "sepia") => {
    document.documentElement.classList.remove("dark", "sepia");
    if (theme !== "light") document.documentElement.classList.add(theme);
    localStorage.setItem("reader-theme", theme);
    set({ theme });
  },

  // Tag actions
  loadTags: async () => {
    try {
      const tags = await invoke<Tag[]>("get_tags");
      set({ tags });
    } catch (e) {
      console.error("Failed to load tags:", e);
    }
  },

  createTag: async (name: string, color?: string) => {
    try {
      await invoke("create_tag", { name, color });
      get().loadTags();
    } catch (e) {
      console.error("Failed to create tag:", e);
    }
  },

  deleteTag: async (id: string) => {
    try {
      // Look up tag name before deletion to avoid stale state
      const tagName = get().tags.find((t) => t.id === id)?.name;
      await invoke("delete_tag", { id });
      get().loadTags();
      if (tagName && get().activeTag === tagName) {
        set({ activeTag: null });
        get().loadBooks({ ...get().filter, tag: undefined });
      }
    } catch (e) {
      console.error("Failed to delete tag:", e);
    }
  },

  setActiveTag: (tag: string | null) => {
    set({ activeTag: tag, activeGroup: null });
    get().loadBooks({ ...get().filter, tag: tag || undefined, group: undefined });
  },

  // Group actions
  loadGroups: async () => {
    try {
      const groups = await invoke<Group[]>("get_groups");
      set({ groups });
    } catch (e) {
      console.error("Failed to load groups:", e);
    }
  },

  createGroup: async (name: string, icon?: string) => {
    try {
      await invoke("create_group", { name, icon });
      get().loadGroups();
    } catch (e) {
      console.error("Failed to create group:", e);
    }
  },

  deleteGroup: async (id: string) => {
    try {
      await invoke("delete_group", { id });
      get().loadGroups();
      if (get().activeGroup === id) {
        set({ activeGroup: null });
        get().loadBooks({ ...get().filter, group: undefined });
      }
    } catch (e) {
      console.error("Failed to delete group:", e);
    }
  },

  setActiveGroup: (groupId: string | null) => {
    set({ activeGroup: groupId, activeTag: null });
    get().loadBooks({ ...get().filter, group: groupId || undefined, tag: undefined });
  },

  // Book-Tag/Group actions
  addBookTag: async (bookId: string, tagId: string) => {
    try {
      await invoke("add_book_tag", { bookId, tagId });
    } catch (e) {
      console.error("Failed to add book tag:", e);
    }
  },

  removeBookTag: async (bookId: string, tagId: string) => {
    try {
      await invoke("remove_book_tag", { bookId, tagId });
    } catch (e) {
      console.error("Failed to remove book tag:", e);
    }
  },

  getBookTags: async (bookId: string) => {
    try {
      return await invoke<Tag[]>("get_book_tags", { bookId });
    } catch (e) {
      console.error("Failed to get book tags:", e);
      return [];
    }
  },

  addBookGroup: async (bookId: string, groupId: string) => {
    try {
      await invoke("add_book_group", { bookId, groupId });
    } catch (e) {
      console.error("Failed to add book group:", e);
    }
  },

  removeBookGroup: async (bookId: string, groupId: string) => {
    try {
      await invoke("remove_book_group", { bookId, groupId });
    } catch (e) {
      console.error("Failed to remove book group:", e);
    }
  },

  getBookGroups: async (bookId: string) => {
    try {
      return await invoke<Group[]>("get_book_groups", { bookId });
    } catch (e) {
      console.error("Failed to get book groups:", e);
      return [];
    }
  },
}));
