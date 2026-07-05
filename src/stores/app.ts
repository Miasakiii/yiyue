import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "../components/Toast";
import type {
  Book,
  BookListItem,
  BookFilter,
  Chapter,
  ReadingProgress,
  UpdateProgress,
  Tag,
  Group,
  ReadingProfile,
  SaveReadingProfile,
  Rule,
  RuleGroup,
  CreateRule,
  UpdateRule,
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
  readingProfile: ReadingProfile | null;

  // Tags & Groups
  tags: Tag[];
  groups: Group[];
  activeTag: string | null;
  activeGroup: string | null;

  // Rules
  rules: Rule[];
  ruleGroups: RuleGroup[];
  rulesLoading: boolean;

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

  // Reading profile actions
  loadReadingProfile: (bookId: string) => Promise<void>;
  saveReadingProfile: (bookId: string, profile: SaveReadingProfile) => Promise<void>;

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

  // Rules actions
  loadRules: () => Promise<void>;
  loadRuleGroups: () => Promise<void>;
  createRule: (rule: CreateRule) => Promise<Rule>;
  updateRule: (id: string, updates: UpdateRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  createRuleGroup: (name: string, description?: string, isPreset?: boolean) => Promise<RuleGroup>;
  deleteRuleGroup: (id: string) => Promise<void>;
  applyRulesToBook: (bookId: string) => Promise<number>;
}

export const useAppStore = create<AppState>((set, get) => ({
  books: [],
  loading: false,
  filter: {},
  viewMode: (localStorage.getItem("reader-view-mode") as "grid" | "list") || "grid",
  currentBook: null,
  chapters: [],
  currentChapter: null,
  progress: null,
  readingProfile: null,
  tags: [],
  groups: [],
  activeTag: null,
  activeGroup: null,
  rules: [],
  ruleGroups: [],
  rulesLoading: false,

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
    localStorage.setItem("reader-view-mode", mode);
    set({ viewMode: mode });
  },

  openBook: async (bookId: string) => {
    try {
      const book = await invoke<Book>("get_book", { id: bookId });
      const chapters = await invoke<Chapter[]>("get_chapters", { bookId });
      const progress = await invoke<ReadingProgress | null>("get_progress", {
        bookId,
      });
      const profile = await invoke<ReadingProfile | null>("get_reading_profile", {
        bookId,
      });

      set({ currentBook: book, chapters, progress, readingProfile: profile });

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
      showToast(`打开书籍失败: ${msg}`, "error");
    }
  },

  closeBook: () => {
    set({ currentBook: null, chapters: [], currentChapter: null, progress: null, readingProfile: null });
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

  // Reading profile actions
  loadReadingProfile: async (bookId: string) => {
    try {
      const profile = await invoke<ReadingProfile | null>("get_reading_profile", {
        bookId,
      });
      set({ readingProfile: profile });
    } catch (e) {
      console.error("Failed to load reading profile:", e);
    }
  },

  saveReadingProfile: async (bookId: string, profile: SaveReadingProfile) => {
    try {
      await invoke("save_reading_profile", { bookId, profile });
      // Reload the profile to get the updated state
      const updated = await invoke<ReadingProfile | null>("get_reading_profile", {
        bookId,
      });
      set({ readingProfile: updated });
    } catch (e) {
      console.error("Failed to save reading profile:", e);
    }
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

  // Rules actions
  loadRules: async () => {
    set({ rulesLoading: true });
    try {
      const rules = await invoke<any[]>("get_rules");
      set({ rules, rulesLoading: false });
    } catch (e) {
      console.error("Failed to load rules:", e);
      set({ rulesLoading: false });
    }
  },

  loadRuleGroups: async () => {
    try {
      const groups = await invoke<any[]>("get_rule_groups");
      set({ ruleGroups: groups });
    } catch (e) {
      console.error("Failed to load rule groups:", e);
    }
  },

  createRule: async (rule: CreateRule) => {
    try {
      const created = await invoke<any>("create_rule", {
        name: rule.name,
        pattern: rule.pattern,
        replacement: rule.replacement,
        scope: rule.scope,
        isRegex: rule.is_regex,
        priority: rule.priority,
        groupId: rule.group_id,
        description: rule.description,
      });
      set({ rules: [...get().rules, created] });
      return created;
    } catch (e) {
      console.error("Failed to create rule:", e);
      showToast("创建规则失败", "error");
      throw e;
    }
  },

  updateRule: async (id: string, updates: UpdateRule) => {
    try {
      await invoke("update_rule", {
        id,
        name: updates.name,
        pattern: updates.pattern,
        replacement: updates.replacement,
        scope: updates.scope,
        isRegex: updates.is_regex,
        enabled: updates.enabled,
        priority: updates.priority,
        groupId: updates.group_id,
        description: updates.description,
      });
      get().loadRules();
    } catch (e) {
      console.error("Failed to update rule:", e);
      showToast("更新规则失败", "error");
    }
  },

  deleteRule: async (id: string) => {
    try {
      await invoke("delete_rule", { id });
      set({ rules: get().rules.filter((r) => r.id !== id) });
    } catch (e) {
      console.error("Failed to delete rule:", e);
      showToast("删除规则失败", "error");
    }
  },

  createRuleGroup: async (name: string, description?: string, isPreset?: boolean) => {
    try {
      const group = await invoke<any>("create_rule_group", {
        name,
        description,
        isPreset: isPreset ?? false,
      });
      set({ ruleGroups: [...get().ruleGroups, group] });
      return group;
    } catch (e) {
      console.error("Failed to create rule group:", e);
      showToast("创建分组失败", "error");
      throw e;
    }
  },

  deleteRuleGroup: async (id: string) => {
    try {
      await invoke("delete_rule_group", { id });
      set({ ruleGroups: get().ruleGroups.filter((g) => g.id !== id) });
    } catch (e) {
      console.error("Failed to delete rule group:", e);
      showToast("删除分组失败", "error");
    }
  },

  applyRulesToBook: async (_bookId: string) => {
    return 0;
  },
}));
