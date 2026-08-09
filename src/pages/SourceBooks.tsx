import { useState } from "react";
import { BookOpen, Download, Library, Search as SearchIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app";
import { PageHeader, Button, Input } from "../components/ui";
import { showToast } from "../components/Toast";

interface GutenbergBook {
  id: number;
  title: string;
  authors: string[];
  language: string;
  txt_url: string | null;
  epub_url: string | null;
}

interface SearchResult {
  total: number;
  books: GutenbergBook[];
}

export function SourceBooks() {
  const importBook = useAppStore((s) => s.importBook);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null); // "id:fmt"

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const r = await invoke<SearchResult>("search_gutenberg", { query: query.trim() });
      setResult(r);
      setSearched(true);
    } catch (e) {
      showToast(`搜索失败: ${String(e)}`, "error");
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = async (book: GutenbergBook, fmt: "txt" | "epub") => {
    const url = fmt === "txt" ? book.txt_url : book.epub_url;
    if (!url) return;
    const key = `${book.id}:${fmt}`;
    setDownloading(key);
    try {
      const path = await invoke<string>("download_gutenberg_book", {
        url,
        filename: `gutenberg-${book.id}.${fmt}`,
      });
      await importBook(path);
      showToast(`已导入《${book.title}》`, "success");
    } catch (e) {
      showToast(`下载/导入失败: ${String(e)}`, "error");
    } finally {
      setDownloading(null);
    }
  };

  const langLabel = (code: string) =>
    code === "en" ? "英语" : code === "zh" ? "中文" : code || "未知";

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <PageHeader title="免费书源" />

      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
            }}
          >
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Library size={16} strokeWidth={2} />
              古腾堡计划（Project Gutenberg）
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="搜索公版书，如：tale of two cities"
                />
              </div>
              <Button size="sm" onClick={handleSearch} disabled={searching}>
                <SearchIcon size={14} strokeWidth={2} />
                {searching ? "搜索中…" : "搜索"}
              </Button>
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              超过 7 万册公版书，以英文为主；下载后自动导入书库（中文搜索结果较少）。
            </p>
          </div>

          {searched && result && (
            <div
              className="rounded-xl p-5"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-light)",
              }}
            >
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <BookOpen size={16} strokeWidth={2} />
                搜索结果（{result.total} 条）
              </h2>
              {result.books.length === 0 ? (
                <div className="text-sm py-6 text-center" style={{ color: "var(--text-tertiary)" }}>
                  未找到相关书籍，换个关键词试试
                </div>
              ) : (
                <div className="space-y-3">
                  {result.books.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-4 rounded-lg p-3"
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{b.title}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
                          {b.authors.join(", ") || "佚名"} · {langLabel(b.language)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {b.txt_url && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={downloading === `${b.id}:txt`}
                            onClick={() => handleDownload(b, "txt")}
                          >
                            <Download size={13} strokeWidth={2} />
                            {downloading === `${b.id}:txt` ? "下载中…" : "TXT"}
                          </Button>
                        )}
                        {b.epub_url && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={downloading === `${b.id}:epub`}
                            onClick={() => handleDownload(b, "epub")}
                          >
                            <Download size={13} strokeWidth={2} />
                            {downloading === `${b.id}:epub` ? "下载中…" : "EPUB"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
