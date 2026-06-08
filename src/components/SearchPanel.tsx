import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app";

/** Sanitize FTS5 snippet: escape HTML but preserve <mark> tags */
function sanitizeSnippet(html: string): string {
  return html
    .replace(/&(?!amp;|lt;|gt;|quot;|#39;)/g, "&amp;")
    .replace(/<(?!\/?mark>)/g, "&lt;")
    .replace(/(?<!<\/?)mark>/g, "&gt;");
}

interface SearchResult {
  result_type: string;
  id: string;
  book_id: string | null;
  book_title: string;
  chapter_id: string | null;
  chapter_title: string | null;
  matched_text: string;
  snippet: string;
  color: string | null;
}

const SCOPE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "books", label: "书库" },
  { value: "content", label: "正文" },
  { value: "annotations", label: "笔记" },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  book: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  content: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  annotation: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
};

export function SearchPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { openBook, loadChapter } = useAppStore();

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const result = await invoke<SearchResult[]>("search_all", {
        query: query.trim(),
        scope,
      });
      setResults(result);

      setSearchHistory((prev) => {
        const updated = [query.trim(), ...prev.filter((q) => q !== query.trim())].slice(0, 10);
        return updated;
      });
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setLoading(false);
    }
  }, [query, scope]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const handleResultClick = async (result: SearchResult) => {
    if (result.book_id) {
      await openBook(result.book_id);
      if (result.chapter_id) {
        await loadChapter(result.chapter_id);
      }
      onClose();
    }
  };

  const handleHistoryClick = (term: string) => {
    setQuery(term);
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "book": return "书籍";
      case "content": return "正文";
      case "annotation": return "笔记";
      default: return type;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "book": return "#6366f1";
      case "content": return "#22c55e";
      case "annotation": return "#f59e0b";
      default: return "var(--text-tertiary)";
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] animate-fade-in"
      style={{ background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col max-h-[70vh] animate-scale-in"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            style={{ color: "var(--text-tertiary)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
            placeholder="搜索书籍、正文、笔记..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-1">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="px-2.5 py-1 text-xs rounded-full transition-all"
                style={{
                  background: scope === opt.value ? "var(--accent)" : "var(--bg-tertiary)",
                  color: scope === opt.value ? "white" : "var(--text-tertiary)",
                  fontWeight: scope === opt.value ? 500 : 400,
                }}
                onClick={() => setScope(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div
              className="flex items-center justify-center py-16"
              style={{ color: "var(--text-tertiary)" }}
            >
              <div className="flex flex-col items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
                />
                <div className="text-sm">搜索中...</div>
              </div>
            </div>
          ) : results.length > 0 ? (
            <div className="py-2">
              {results.map((result, i) => (
                <button
                  key={`${result.result_type}-${result.id}-${i}`}
                  className="w-full text-left px-5 py-3 hover-bg"
                  onClick={() => handleResultClick(result)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: `${typeColor(result.result_type)}15`,
                        color: typeColor(result.result_type),
                      }}
                    >
                      {TYPE_ICONS[result.result_type] || TYPE_ICONS.content}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {result.book_title}
                        </span>
                        {result.chapter_title && (
                          <span
                            className="text-xs flex-shrink-0"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {result.chapter_title}
                          </span>
                        )}
                      </div>
                      <div
                        className="text-xs line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                        dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                      />
                    </div>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: `${typeColor(result.result_type)}10`,
                        color: typeColor(result.result_type),
                      }}
                    >
                      {typeLabel(result.result_type)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : query && !loading ? (
            <div
              className="flex flex-col items-center justify-center py-16 gap-3"
              style={{ color: "var(--text-tertiary)" }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <div className="text-sm">没有找到匹配的结果</div>
            </div>
          ) : (
            searchHistory.length > 0 && (
              <div className="py-2">
                <div
                  className="px-5 py-2 text-xs font-medium"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  搜索历史
                </div>
                {searchHistory.map((term) => (
                  <button
                    key={term}
                    className="w-full text-left px-5 py-2.5 text-sm hover-bg flex items-center gap-3"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => handleHistoryClick(term)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-tertiary)" }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {term}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-between text-xs"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--text-tertiary)",
          }}
        >
          <span>
            {results.length > 0 && `找到 ${results.length} 条结果`}
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="kbd">Ctrl+Shift+F</kbd>
              搜索
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">Esc</kbd>
              关闭
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
