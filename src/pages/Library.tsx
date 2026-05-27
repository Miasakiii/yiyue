import { useState } from "react";
import { useAppStore } from "../stores/app";
import { BookCard } from "../components/BookCard";

type SortKey = "recent" | "added" | "title" | "progress";

export function Library({ onShowStats, onShowSync }: { onShowStats?: () => void; onShowSync?: () => void }) {
  const { books, loading, viewMode, setViewMode, importBook } = useAppStore();
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const handleImport = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string[]>("plugin:dialog|open", {
        multiple: true,
        filters: [
          {
            name: "Books",
            extensions: ["txt", "epub", "pdf", "md", "markdown", "cbz"],
          },
        ],
      });

      if (selected && selected.length > 0) {
        for (const filePath of selected) {
          try {
            await importBook(filePath);
          } catch (e) {
            console.error("Import failed:", e);
          }
        }
      }
    } catch (e) {
      console.error("Import dialog failed:", e);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      console.log("Dropped:", file.name);
    }
  };

  const sortedBooks = [...books].sort((a, b) => {
    switch (sortBy) {
      case "recent":
        return (b.last_read_at || "").localeCompare(a.last_read_at || "");
      case "added":
        return (b.added_at || "").localeCompare(a.added_at || "");
      case "title":
        return a.title.localeCompare(b.title, "zh");
      case "progress":
        return (b.reading_percentage || 0) - (a.reading_percentage || 0);
      default:
        return 0;
    }
  });

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "recent", label: "最近阅读" },
    { key: "added", label: "最近添加" },
    { key: "title", label: "书名" },
    { key: "progress", label: "阅读进度" },
  ];

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-8 py-5 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
          >
            页
          </div>
          <h1 className="text-lg font-semibold tracking-tight">一页</h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {books.length} 本
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <select
            className="text-xs px-3 py-1.5 rounded-lg outline-none cursor-pointer"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* View mode toggle */}
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
          >
            <button
              className="px-2.5 py-1.5 text-xs transition-all"
              style={{
                background: viewMode === "grid" ? "var(--accent)" : "var(--bg-secondary)",
                color: viewMode === "grid" ? "white" : "var(--text-tertiary)",
              }}
              onClick={() => setViewMode("grid")}
              title="网格视图"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              className="px-2.5 py-1.5 text-xs transition-all"
              style={{
                background: viewMode === "list" ? "var(--accent)" : "var(--bg-secondary)",
                color: viewMode === "list" ? "white" : "var(--text-tertiary)",
              }}
              onClick={() => setViewMode("list")}
              title="列表视图"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>

          {/* Stats button */}
          {onShowStats && (
            <button
              className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
              onClick={onShowStats}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
              统计
            </button>
          )}

          {/* Sync button */}
          {onShowSync && (
            <button
              className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
              onClick={onShowSync}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
              </svg>
              同步
            </button>
          )}

          {/* Import button */}
          <button
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5 transition-all"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
              boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
            }}
            onClick={handleImport}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            导入
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
              />
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                加载中...
              </div>
            </div>
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 animate-fade-in">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                background: "var(--accent-soft)",
                border: "2px dashed var(--border)",
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-base font-medium mb-1">书库为空</div>
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                拖拽文件到窗口，或点击右上角「导入」按钮
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              {["TXT", "EPUB", "PDF", "MD", "CBZ"].map((fmt) => (
                <span
                  key={fmt}
                  className="text-xs px-2.5 py-1 rounded-md"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-tertiary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5"
                : "flex flex-col gap-2 max-w-3xl mx-auto"
            }
          >
            {sortedBooks.map((book, i) => (
              <div
                key={book.id}
                className="animate-slide-up"
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "both" }}
              >
                <BookCard book={book} viewMode={viewMode} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
