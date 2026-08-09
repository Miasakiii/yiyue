import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Clock, FileText, Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { useAppStore } from "../stores/app";

/** Sanitize FTS5 snippet: strip all HTML except <mark> tags */
function sanitizeSnippet(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["mark"] });
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
<BookOpen size={ 14 } strokeWidth={2} />
  ),
  content: (
<FileText size={ 14 } strokeWidth={2} />
  ),
  annotation: (
<FileText size={ 14 } strokeWidth={2} />
  ),
};

export function SearchPanel({
  visible,
  onClose,
  query: externalQuery,
}: {
  visible: boolean;
  onClose: () => void;
  query?: string;
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

  // Contract with useReaderKeyboard / HighlightPopover: while the search
  // panel is open it owns the keyboard, so underlying shortcuts stay quiet.
  useEffect(() => {
    if (!visible) return;
    document.body.dataset.modalOpen = "true";
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, [visible]);

  // Sync external query prop to internal state and trigger search
  useEffect(() => {
    if (!externalQuery) return;
    setQuery(externalQuery);
  }, [externalQuery]);

  const performSearch = useCallback(async (q: string, s: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const result = await invoke<SearchResult[]>("search_all", {
        query: q.trim(),
        scope: s,
      });
      setResults(result);
      setSearchHistory((prev) => {
        const updated = [q.trim(), ...prev.filter((x) => x !== q.trim())].slice(0, 10);
        return updated;
      });
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    await performSearch(query, scope);
  }, [query, scope, performSearch]);

  // Trigger search when an external query arrives and the panel is visible.
  // (Scope changes re-search with the current input value — see below.)
  useEffect(() => {
    if (externalQuery && visible) {
      performSearch(externalQuery, scope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery, visible, performSearch]);

  // Re-run the search with the current input value when the scope changes
  const prevScopeRef = useRef(scope);
  useEffect(() => {
    if (prevScopeRef.current === scope) return;
    prevScopeRef.current = scope;
    if (visible && query.trim()) {
      performSearch(query, scope);
    }
  }, [scope, visible, query, performSearch]);

  // Esc closes the panel regardless of focus; capture phase keeps the event
  // from reaching window-level reader shortcuts that would close panels below.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [visible, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
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
      case "book": return "var(--type-book)";
      case "content": return "var(--type-content)";
      case "annotation": return "var(--type-annotation)";
      default: return "var(--text-tertiary)";
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 flex items-start justify-center pt-[12vh] animate-fade-in"
      style={{ background: "var(--overlay-bg)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", zIndex: "var(--z-modal)" }}
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
<Search className="w-5 h-5 flex-shrink-0" style={{ color: "var(--text-tertiary)" }} />
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
                        background: `color-mix(in srgb, ${typeColor(result.result_type)} 10%, transparent)`,
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
                        background: `color-mix(in srgb, ${typeColor(result.result_type)} 8%, transparent)`,
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
<Search size={ 40 } strokeWidth={1.5} />
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
<Clock size={ 14 } strokeWidth={2} />
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
