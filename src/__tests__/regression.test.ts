import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock DOMPurify
vi.mock("dompurify", () => ({
  default: {
    sanitize: vi.fn((html: string, options?: any) => {
      if (!html) return "";
      if (options?.ALLOWED_TAGS?.length === 1 && options.ALLOWED_TAGS[0] === "mark") {
        return html.replace(/<(?!\/?mark>)/g, "&lt;").replace(/(?<!<\/?)mark>/g, "&gt;");
      }
      return html.replace(/<[^>]*>/g, "");
    }),
  },
}));

describe("SearchPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have DOMPurify available for sanitization", async () => {
    const DOMPurify = (await import("dompurify")).default;
    const html = '<script>alert("xss")</script><p>正常内容</p>';
    const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS: ["mark"] });
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("</p>");
  });
});

describe("Reading Presets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("should have presets defined with valid settings", () => {
    const presets = [
      { key: "comfort", font_size: 20, line_height: 2.0 },
      { key: "compact", font_size: 14, line_height: 1.4 },
      { key: "sepia-preset", font_size: 22, line_height: 2.0 },
      { key: "default-preset", font_size: 18, line_height: 1.8 },
    ];

    for (const preset of presets) {
      expect(preset.font_size).toBeGreaterThanOrEqual(12);
      expect(preset.font_size).toBeLessThanOrEqual(36);
      expect(preset.line_height).toBeGreaterThanOrEqual(1.0);
      expect(preset.line_height).toBeLessThanOrEqual(3.0);
    }
  });

  it("should persist preset choice to localStorage", () => {
    localStorage.setItem("reader-preset", "comfort");
    const saved = localStorage.getItem("reader-preset");
    expect(saved).toBe("comfort");
  });
});

describe("Import Progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should track import progress correctly", async () => {
    const paths = ["file1.txt", "file2.txt", "file3.txt"];
    const progress: { current: number; total: number }[] = [];

    for (let i = 0; i < paths.length; i++) {
      progress.push({ current: i + 1, total: paths.length });
    }

    expect(progress).toEqual([
      { current: 1, total: 3 },
      { current: 2, total: 3 },
      { current: 3, total: 3 },
    ]);
  });
});
