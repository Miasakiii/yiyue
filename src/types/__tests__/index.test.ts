import { describe, it, expect } from "vitest";
import type {
  Book,
  BookListItem,
  BookFilter,
  ComicPage,
} from "../index";

describe("Type compatibility", () => {
  it("Book should have all required fields", () => {
    const book: Book = {
      id: "1",
      kind: "novel",
      title: "测试",
      author: null,
      file_hash: "abc",
      file_path: "path",
      file_size: 100,
      format: "txt",
      cover_path: null,
      description: null,
      language: "zh",
      total_chapters: null,
      total_chars: null,
      metadata_json: null,
      reading_mode: null,
      added_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    expect(book.id).toBe("1");
  });

  it("BookListItem should have reading_percentage and starred", () => {
    const item: BookListItem = {
      id: "1",
      kind: "novel",
      title: "测试",
      author: null,
      format: "txt",
      cover_path: null,
      file_size: 100,
      total_chapters: null,
      added_at: "2026-01-01",
      updated_at: "2026-01-01",
      reading_percentage: 50.5,
      starred: true,
    };
    expect(item.reading_percentage).toBe(50.5);
    expect(item.starred).toBe(true);
  });

  it("BookFilter should accept partial fields", () => {
    const filter: BookFilter = { kind: "novel" };
    expect(filter.kind).toBe("novel");
    expect(filter.tag).toBeUndefined();
  });

  it("ComicPage should have dimensions", () => {
    const page: ComicPage = {
      index: 0,
      file_name: "001.jpg",
      width: 800,
      height: 1200,
      image_path: "/cache/001.jpg",
    };
    expect(page.width).toBe(800);
  });
});
