import { useState, useEffect, useRef, useCallback } from "react";
import { Book, BookOpen, Check, Folder, Star } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/app";
import type { BookListItem, Tag, Group } from "../types";

interface BookCardProps {
  book: BookListItem;
  viewMode: "grid" | "list";
}

/* eslint-disable no-restricted-syntax -- 格式徽章色是固定品牌色数据映射，非主题样式，不随主题切换 */
const FORMAT_COLORS: Record<string, string> = {
  txt: "#6366f1",
  epub: "#8b5cf6",
  pdf: "#ef4444",
  md: "#22c55e",
  markdown: "#22c55e",
  cbz: "#f59e0b",
};
/* eslint-enable no-restricted-syntax */

const FORMAT_LABELS: Record<string, string> = {
  txt: "TXT",
  epub: "EPUB",
  pdf: "PDF",
  md: "MD",
  markdown: "MD",
  cbz: "CBZ",
};

/** Uniform linear icon for groups (replaces per-group emoji). */
function GroupIcon({ size = 13 }: { size?: number }) {
  return (
<Folder size={size} strokeWidth={2} />
  );
}

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
  const cardRef = useRef<HTMLDivElement>(null);
  // Cover falls back to the format badge if the file can't be loaded
  const [coverError, setCoverError] = useState(false);
  // Dedupe tag/group association fetches (visible + first right-click race)
  const assocLoadedRef = useRef(false);

  const loadBookAssociations = useCallback(async (force = false) => {
    if (!force && assocLoadedRef.current) return;
    assocLoadedRef.current = true;
    const [bt, bg] = await Promise.all([
      getBookTags(book.id),
      getBookGroups(book.id),
    ]);
    setBookTags(bt);
    setBookGroups(bg);
  }, [book.id, getBookTags, getBookGroups]);

  // Lazy-load associations when the card scrolls into view (avoids N+1 burst on library open)
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadBookAssociations();
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadBookAssociations]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    loadBookAssociations();
    // Only fetch tags/groups when the store doesn't have them yet
    const state = useAppStore.getState();
    if (state.tags.length === 0) loadTags();
    if (state.groups.length === 0) loadGroups();
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
    await loadBookAssociations(true);
  };

  const toggleBookGroup = async (groupId: string) => {
    const has = bookGroups.some((g) => g.id === groupId);
    if (has) {
      await removeBookGroup(book.id, groupId);
    } else {
      await addBookGroup(book.id, groupId);
    }
    await loadBookAssociations(true);
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

  // eslint-disable-next-line no-restricted-syntax -- 回退色与 FORMAT_COLORS 同属徽章数据调色板
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

  // Tag dots rendered inline — always occupies its row so cards stay equal height
  const tagDots = (
    <div className="flex gap-0.5 flex-wrap items-center" style={{ minHeight: 6 }}>
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
          ref={cardRef}
          className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer group card-hover"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-light)",
          }}
          onClick={() => openBook(book.id)}
          onContextMenu={handleContextMenu}
          // eslint-disable-next-line no-restricted-syntax -- 非 hover 样式：离开卡片时复位删除二次确认状态
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
                <div className="progress-bar-fill" style={{ width: `${progress}%`, background: progress >= 100 ? "var(--success)" : formatColor }} />
              </div>
              <span className="text-xs w-10 text-right" style={{ color: "var(--text-tertiary)" }}>
                {formatProgress(progress)}
              </span>
            </div>
            <button
              className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: book.starred ? "var(--warning)" : "var(--text-tertiary)" }}
              onClick={(e) => { e.stopPropagation(); toggleFavorite(book.id); }}
            >
<Star size={ 14 } fill={book.starred ? "currentColor" : "none"} />
            </button>
            <button
              className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                color: showDeleteConfirm ? "var(--error)" : "var(--text-tertiary)",
                background: showDeleteConfirm ? "var(--error-soft)" : "transparent",
              }}
              onClick={handleDelete}
              title={showDeleteConfirm ? "确认删除" : "删除"}
            >
<Book size={ 14 } strokeWidth={2} />
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
        ref={cardRef}
        className="flex flex-col rounded-xl overflow-hidden cursor-pointer group card-hover"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-light)",
        }}
        onClick={() => openBook(book.id)}
        onContextMenu={handleContextMenu}
        // eslint-disable-next-line no-restricted-syntax -- 非 hover 样式：离开卡片时复位删除二次确认状态
        onMouseLeave={() => setShowDeleteConfirm(false)}
      >
        {/* Cover */}
        <div
          className="aspect-[3/4] flex items-center justify-center relative overflow-hidden"
          style={{ background: `linear-gradient(145deg, ${formatColor}15, ${formatColor}08)` }}
        >
          {book.cover_path && !coverError ? (
            <img
              src={convertFileSrc(book.cover_path)}
              alt={book.title}
              loading="lazy"
              onError={() => setCoverError(true)}
              className="w-full h-full object-cover"
              style={{ background: "var(--bg-tertiary)" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${formatColor}20, ${formatColor}10)`,
                  border: `1px solid ${formatColor}20`,
                }}
              >
<BookOpen size={ 24 } strokeWidth={1.5} />
              </div>
              <span
                className="text-xs font-bold px-2.5 py-1 rounded"
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
              className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ background: "var(--success)", color: "white" }}
            >
              已读完
            </div>
          )}
          {book.starred && (
            <div className="absolute top-2 left-2">
<Star size={ 16 } style={{ fill: "var(--warning)", stroke: "none" }} />
            </div>
          )}
          <button
            className="absolute bottom-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: showDeleteConfirm ? "var(--error)" : "var(--overlay-bg)",
              color: "white",
              backdropFilter: "blur(4px)",
            }}
            onClick={handleDelete}
            title={showDeleteConfirm ? "确认删除" : "删除"}
          >
<Book size={ 13 } strokeWidth={2} />
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
              <div className="progress-bar-fill" style={{ width: `${progress}%`, background: progress >= 100 ? "var(--success)" : formatColor }} />
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
      className="fixed animate-scale-in"
      style={{
        left: clampedX,
        top: clampedY,
        width: menuW,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
        zIndex: "var(--z-popover)",
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
            // Note: selected background is inline so it wins over .hover-bg on hover
            return (
              <button
                key={item.id}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left hover-bg"
                style={{
                  color: "var(--text-primary)",
                  background: selected ? "var(--accent-soft)" : undefined,
                }}
                onClick={() => {
                  if (isTag) toggleBookTag(item.id);
                  else toggleBookGroup(item.id);
                }}
              >
                {isTag ? (
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: (item as Tag).color }} />
                ) : (
                  <span className="flex-shrink-0 w-4 flex justify-center" style={{ color: "var(--text-tertiary)" }}>
                    <GroupIcon />
                  </span>
                )}
                <span className="flex-1 truncate">{item.name}</span>
                {selected && (
<Check size={ 14 } style={{ stroke: "var(--accent)" }} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
