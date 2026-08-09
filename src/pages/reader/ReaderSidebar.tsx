import { useEffect, useRef } from "react";
import { Bookmark as BookmarkIcon, Plus, X } from "lucide-react";
import type { Chapter, Bookmark } from "../../types";

interface ReaderSidebarProps {
  chapters: Chapter[];
  currentChapter: Chapter;
  goToChapter: (id: string) => void;
  bookmarks: Bookmark[];
  addBookmark: () => void;
  deleteBookmark: (id: string) => void;
  jumpToBookmark: (bm: Bookmark) => void;
}

export function ReaderSidebar({
  chapters, currentChapter, goToChapter,
  bookmarks, addBookmark, deleteBookmark, jumpToBookmark,
}: ReaderSidebarProps) {
  const chapterIndex = chapters.findIndex((c) => c.id === currentChapter.id);

  // Scroll the current chapter into view once on mount / chapter change —
  // an inline ref callback would re-run on every re-render (e.g. periodic
  // progress saves) and keep yanking the list back while the user browses.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const current = el.querySelector(`[data-chapter-id="${currentChapter.id}"]`);
    if (current) current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentChapter.id]);

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col overflow-hidden animate-slide-right"
      style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-sm font-semibold">目录</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          {chapterIndex + 1} / {chapters.length}
        </span>
      </div>

      {/* Chapter list */}
      <div className="flex-1 overflow-y-auto py-2" ref={listRef}>
        {chapters.map((ch, i) => (
          <button key={ch.id} data-chapter-id={ch.id}
            className={`w-full text-left px-5 py-2.5 text-sm sidebar-item ${ch.id === currentChapter.id ? 'active' : ''}`}
            onClick={() => goToChapter(ch.id)}
          >
            <span className="mr-2 text-xs tabular-nums" style={{ color: "var(--text-tertiary)", minWidth: 24, display: "inline-block" }}>{i + 1}</span>
            {ch.title || `第 ${i + 1} 章`}
          </button>
        ))}
      </div>

      {/* Bookmarks */}
      <div className="flex-shrink-0 flex flex-col" style={{ borderTop: "1px solid var(--border)", maxHeight: 220 }}>
        <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-light)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            书签 ({bookmarks.length})
          </span>
          <button
            className="p-1 rounded flex items-center justify-center hover-bg"
            style={{ color: "var(--text-tertiary)" }}
            onClick={addBookmark}
            title="添加书签 (Ctrl+Shift+B)"
          >
<Plus size={ 12 } strokeWidth={2.5} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {bookmarks.length === 0 ? (
            <div className="px-5 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              暂无书签，按 Ctrl+Shift+B 添加
            </div>
          ) : (
            bookmarks.map((bm) => {
              const ch = chapters.find((c) => c.id === bm.chapter_id);
              const chIdx = ch ? chapters.indexOf(ch) + 1 : 0;
              return (
                <div key={bm.id} className="group flex items-center gap-1 px-2 hover:bg-[var(--bg-tertiary)]">
                  <button
                    className="flex-1 text-left px-3 py-2 text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => jumpToBookmark(bm)}
                    title={bm.title || undefined}
                  >
<BookmarkIcon size={10} strokeWidth={2} />
                    {bm.title || `${chIdx}. ${ch?.title || "未知章节"}`}
                  </button>
                  <button
                    className="p-1 rounded opacity-0 group-hover:opacity-100 flex-shrink-0"
                    style={{ color: "var(--text-tertiary)" }}
                    onClick={() => deleteBookmark(bm.id)}
                    title="删除书签"
                  >
<X size={ 10 } strokeWidth={2} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
