import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../stores/app";
import type { BookListItem, Tag, Group } from "../types";

interface BookCardProps {
  book: BookListItem;
  viewMode: "grid" | "list";
}

const FORMAT_COLORS: Record<string, string> = {
  txt: "#6366f1",
  epub: "#8b5cf6",
  pdf: "#ef4444",
  md: "#22c55e",
  markdown: "#22c55e",
  cbz: "#f59e0b",
};

const FORMAT_LABELS: Record<string, string> = {
  txt: "TXT",
  epub: "EPUB",
  pdf: "PDF",
  md: "MD",
  markdown: "MD",
  cbz: "CBZ",
};

export function BookCard({ book, viewMode }: BookCardProps) {
  const {
    openBook, toggleFavorite, deleteBook,
    tags, groups, loadTags, loadGroups,
    getBookTags, getBookGroups,
    addBookTag, removeBookTag, addBookGroup, removeBookGroup,
  } = useAppStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [bookTags, setBookTags] = useState<Tag[]>([]);
  const [bookGroups, setBookGroups] = useState<Group[]>([]);
  const [ctxTab, setCtxTab] = useState<"tags" | "groups">("tags");
  const ctxRef = useRef<HTMLDivElement>(null);

  const loadBookAssociations = useCallback(async () => {
    const [bt, bg] = await Promise.all([
      getBookTags(book.id),
      getBookGroups(book.id),
    ]);
    setBookTags(bt);
    setBookGroups(bg);
  }, [book.id, getBookTags, getBookGroups]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    loadBookAssociations();
    loadTags();
    loadGroups();
    setCtxMenu({ x: e.clientX, y: e.clientY });
    setCtxTab("tags");
  }, [loadBookAssociations, loadTags, loadGroups]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  const toggleBookTag = async (tagId: string) => {
    const has = bookTags.some((t) => t.id === tagId);
    if (has) {
      await removeBookTag(book.id, tagId);
    } else {
      await addBookTag(book.id, tagId);
    }
    await loadBookAssociations();
  };

  const toggleBookGroup = async (groupId: string) => {
    const has = bookGroups.some((g) => g.id === groupId);
    if (has) {
      await removeBookGroup(book.id, groupId);
    } else {
      await addBookGroup(book.id, groupId);
    }
    await loadBookAssociations();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatProgress = (pct: number) => {
    if (pct <= 0) return "未读";
    if (pct >= 100) return "已读完";
    return `${Math.round(pct)}%`;
  };

  const formatColor = FORMAT_COLORS[book.format] || "#6366f1";
  const progress = Math.min(book.reading_percentage || 0, 100);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      deleteBook(book.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  // Tag dots rendered inline
  const tagDots = bookTags.length > 0 && (
    <div className="flex gap-0.5 flex-wrap" style={{ minHeight: 6 }}>
      {bookTags.slice(0, 5).map((t) => (
        <div
          key={t.id}
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: t.color }}
          title={t.name}
        />
      ))}
      {bookTags.length > 5 && (
        <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>+{bookTags.length - 5}</span>
      )}
    </div>
  );

  if (viewMode === "list") {
    return (
      <>
        <div
          className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer group hover-bg"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
            transition: "all var(--transition-normal)",
          }}
          onClick={() => openBook(book.id)}
          onContextMenu={handleContextMenu}
          onMouseLeave={() => setShowDeleteConfirm(false)}
        >
          {/* Format badge */}
          <div
            className="w-10 h-14 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
            style={{
              background: `linear-gradient(135deg, ${formatColor}, ${formatColor}dd)`,
              boxShadow: `0 2px 8px ${formatColor}33`,
            }}
          >
            {FORMAT_LABELS[book.format] || book.format.toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate mb-0.5">{book.title}</div>
            <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
              {book.author || "未知作者"} · {formatSize(book.file_size)}
            </div>
            {tagDots}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-16 progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%`, background: progress >= 100 ? "#22c55e" : formatColor }} />
              </div>
              <span className="text-xs w-10 text-right" style={{ color: "var(--text-tertiary)" }}>
                {formatProgress(progress)}
              </span>
            </div>
            <button
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: book.starred ? "#f59e0b" : "var(--text-tertiary)" }}
              onClick={(e) => { e.stopPropagation(); toggleFavorite(book.id); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={book.starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                color: showDeleteConfirm ? "#ef4444" : "var(--text-tertiary)",
                background: showDeleteConfirm ? "rgba(239, 68, 68, 0.1)" : "transparent",
              }}
              onClick={handleDelete}
              title={showDeleteConfirm ? "确认删除" : "删除"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
        {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} ctxRef={ctxRef} tags={tags} groups={groups} bookTags={bookTags} bookGroups={bookGroups} ctxTab={ctxTab} setCtxTab={setCtxTab} toggleBookTag={toggleBookTag} toggleBookGroup={toggleBookGroup} />}
      </>
    );
  }

  return (
    <>
      <div
        className="flex flex-col rounded-xl overflow-hidden cursor-pointer group"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-light)",
          transition: "all var(--transition-normal)",
        }}
        onClick={() => openBook(book.id)}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-3px)";
          e.currentTarget.style.boxShadow = "var(--shadow-lg)";
          e.currentTarget.style.borderColor = "var(--border)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.borderColor = "var(--border-light)";
          setShowDeleteConfirm(false);
        }}
      >
        {/* Cover */}
        <div
          className="aspect-[3/4] flex items-center justify-center relative overflow-hidden"
          style={{ background: `linear-gradient(145deg, ${formatColor}15, ${formatColor}08)` }}
        >
          {book.cover_path ? (
            <img src={book.cover_path} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${formatColor}20, ${formatColor}10)`,
                  border: `1px solid ${formatColor}20`,
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={formatColor} strokeWidth="1.5">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-md"
                style={{ background: formatColor, color: "white", boxShadow: `0 2px 6px ${formatColor}40` }}
              >
                {FORMAT_LABELS[book.format] || book.format.toUpperCase()}
              </span>
            </div>
          )}

          {progress > 0 && progress < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: `${formatColor}30` }}>
              <div className="h-full transition-all" style={{ width: `${progress}%`, background: formatColor }} />
            </div>
          )}
          {progress >= 100 && (
            <div
              className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-xs font-medium"
              style={{ background: "rgba(34, 197, 94, 0.9)", color: "white", backdropFilter: "blur(4px)" }}
            >
              已读完
            </div>
          )}
          {book.starred && (
            <div className="absolute top-2 left-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
          )}
          <button
            className="absolute bottom-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: showDeleteConfirm ? "rgba(239, 68, 68, 0.9)" : "rgba(0,0,0,0.5)",
              color: "white",
              backdropFilter: "blur(4px)",
            }}
            onClick={handleDelete}
            title={showDeleteConfirm ? "确认删除" : "删除"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="font-medium text-sm truncate mb-1 leading-snug">{book.title}</div>
          <div className="text-xs truncate mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            {book.author || "未知作者"}
          </div>
          {tagDots}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%`, background: progress >= 100 ? "#22c55e" : formatColor }} />
            </div>
            <span className="text-xs flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
              {formatProgress(progress)}
            </span>
          </div>
        </div>
      </div>
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} ctxRef={ctxRef} tags={tags} groups={groups} bookTags={bookTags} bookGroups={bookGroups} ctxTab={ctxTab} setCtxTab={setCtxTab} toggleBookTag={toggleBookTag} toggleBookGroup={toggleBookGroup} />}
    </>
  );
}

/* ---- Context Menu ---- */
function ContextMenu({
  x, y, ctxRef,
  tags, groups, bookTags, bookGroups,
  ctxTab, setCtxTab, toggleBookTag, toggleBookGroup,
}: {
  x: number;
  y: number;
  ctxRef: React.RefObject<HTMLDivElement | null>;
  tags: Tag[];
  groups: Group[];
  bookTags: Tag[];
  bookGroups: Group[];
  ctxTab: "tags" | "groups";
  setCtxTab: (t: "tags" | "groups") => void;
  toggleBookTag: (tagId: string) => void;
  toggleBookGroup: (groupId: string) => void;
}) {
  // Clamp position so menu stays on-screen
  const menuW = 220;
  const menuH = 280;
  const clampedX = Math.min(x, window.innerWidth - menuW - 8);
  const clampedY = Math.min(y, window.innerHeight - menuH - 8);

  const hasTags = ctxTab === "tags";
  const items = hasTags ? tags : groups;
  const selectedIds = hasTags
    ? bookTags.map((t) => t.id)
    : bookGroups.map((g) => g.id);

  return (
    <div
      ref={ctxRef}
      className="fixed z-[250] animate-scale-in"
      style={{
        left: clampedX,
        top: clampedY,
        width: menuW,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
      }}
    >
      {/* Tabs */}
      <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          className="flex-1 text-xs py-2 font-medium transition-colors"
          style={{
            color: ctxTab === "tags" ? "var(--accent)" : "var(--text-tertiary)",
            borderBottom: ctxTab === "tags" ? "2px solid var(--accent)" : "2px solid transparent",
          }}
          onClick={() => setCtxTab("tags")}
        >
          标签
        </button>
        <button
          className="flex-1 text-xs py-2 font-medium transition-colors"
          style={{
            color: ctxTab === "groups" ? "var(--accent)" : "var(--text-tertiary)",
            borderBottom: ctxTab === "groups" ? "2px solid var(--accent)" : "2px solid transparent",
          }}
          onClick={() => setCtxTab("groups")}
        >
          分组
        </button>
      </div>

      {/* Items */}
      <div className="overflow-y-auto" style={{ maxHeight: 220, padding: "4px 0" }}>
        {items.length === 0 ? (
          <div className="px-4 py-4 text-xs text-center" style={{ color: "var(--text-tertiary)" }}>
            {hasTags ? "暂无标签，可在侧边栏创建" : "暂无分组，可在侧边栏创建"}
          </div>
        ) : (
          items.map((item) => {
            const selected = selectedIds.includes(item.id);
            const isTag = ctxTab === "tags";
            return (
              <button
                key={item.id}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left"
                style={{
                  color: "var(--text-primary)",
                  background: selected ? "var(--accent-soft)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = selected ? "var(--accent-soft)" : "transparent";
                }}
                onClick={() => {
                  if (isTag) toggleBookTag(item.id);
                  else toggleBookGroup(item.id);
                }}
              >
                {isTag ? (
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: (item as Tag).color }} />
                ) : (
                  <span className="text-sm flex-shrink-0 w-4 text-center">{(item as Group).icon || "📁"}</span>
                )}
                <span className="flex-1 truncate">{item.name}</span>
                {selected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" className="flex-shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
