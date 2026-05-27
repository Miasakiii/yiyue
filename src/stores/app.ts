import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  Book,
  BookListItem,
  BookFilter,
  Chapter,
  ReadingProgress,
  UpdateProgress,
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

  // Theme
  theme: "light" | "dark" | "sepia";

  // Actions
  loadBooks: (filter?: BookFilter) => Promise<void>;
  setFilter: (filter: BookFilter) => void;
  setViewMode: (mode: "grid" | "list") => void;
  openBook: (bookId: string) => Promise<void>;
  loadChapter: (chapterId: string) => Promise<string>;
  updateProgress: (bookId: string, progress: UpdateProgress) => Promise<void>;
  toggleFavorite: (bookId: string) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
  importBook: (filePath: string, encoding?: string) => Promise<Book>;
  setTheme: (theme: "light" | "dark" | "sepia") => void;
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
  theme: "light",

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

      // Load the current chapter
      if (progress?.chapter_id) {
        const chapter = chapters.find((c) => c.id === progress.chapter_id);
        if (chapter) {
          set({ currentChapter: chapter });
        }
      } else if (chapters.length > 0) {
        set({ currentChapter: chapters[0] });
      }
    } catch (e) {
      console.error("Failed to open book:", e);
    }
  },

  loadChapter: async (chapterId: string) => {
    // For now, return empty string - will be implemented with content loading
    const chapter = get().chapters.find((c) => c.id === chapterId);
    if (chapter) {
      set({ currentChapter: chapter });
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
    document.documentElement.className = theme === "light" ? "" : theme;
    set({ theme });
  },
}));
