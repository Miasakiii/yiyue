import { useState, useEffect, useRef } from "react";
import { BarChart3, Book, BookOpen, ChevronDown, ChevronLeft, FileText, Folder, Globe, LayoutGrid, List, Moon, Plus, Radio, Search, Star, Sun, Upload, X } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/app";
import { BookCard } from "../components/BookCard";
import { Button, Dialog, Input } from "../components/ui";
import { SUPPORTED_EXTENSIONS, THEMES } from "../constants";

type SortKey = "recent" | "added" | "title" | "progress";

/* eslint-disable no-restricted-syntax -- 标签色是存入 DB 的数据调色板，非主题样式，不随主题切换 */
const TAG_COLORS = [
  "#6366f1", "#8b5cf6", "#ef4444", "#f59e0b",
  "#22c55e", "#06b6d4", "#ec4899", "#6b7280",
];
/* eslint-enable no-restricted-syntax */

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "最近阅读" },
  { key: "added", label: "最近添加" },
  { key: "title", label: "书名" },
  { key: "progress", label: "阅读进度" },
];

const MORE_MENU: { label: string; path: string; icon: ReactNode }[] = [
  {
    label: "统计",
    path: "/stats",
    icon: (
<BarChart3 size={ 13 } strokeWidth={2} />
    ),
  },
  {
    label: "同步",
    path: "/sync",
    icon: (
<Globe size={ 13 } strokeWidth={2} />
    ),
  },
  {
    label: "规则",
    path: "/rules",
    icon: (
<Book size={ 13 } strokeWidth={2} />
    ),
  },
  {
    label: "OPDS",
    path: "/opds",
    icon: (
<Radio size={ 13 } strokeWidth={2} />
    ),
  },
  {
    label: "传输",
    path: "/transfer",
    icon: (
<Upload size={ 13 } strokeWidth={2} />
    ),
  },
];

/** Uniform linear icon for groups (replaces per-group emoji). */
function GroupIcon({ size = 15 }: { size?: number }) {
  return (
<Folder size={size} strokeWidth={2} />
  );
}

export function Library() {
  const navigate = useNavigate();
  const {
    books, loading, viewMode, setViewMode, importBook,
    tags, groups, activeTag, activeGroup,
    loadTags, loadGroups, createTag, deleteTag, createGroup, deleteGroup,
    setActiveTag, setActiveGroup, loadBooks, setFilter, theme, setTheme,
  } = useAppStore();

  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  // Starred-only filter is not tracked in the store, keep it local
  const [starredOnly, setStarredOnly] = useState(false);

  // Header "more" dropdown
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // New tag/group dialog state
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Sidebar delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: "tag" | "group"; id: string; name: string } | null
  >(null);

  // Load tags and groups on mount
  useEffect(() => {
    loadTags();
    loadGroups();
  }, []);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Close "more" menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [showMoreMenu]);

  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Tauri drag-drop events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const fn = await getCurrentWebview().onDragDropEvent(async (event) => {
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setIsDragging(true);
          } else if (payload.type === "leave") {
            setIsDragging(false);
          } else if (payload.type === "drop") {
            setIsDragging(false);
            const paths = (payload.paths || []).filter((p) => {
              const ext = p.split(".").pop()?.toLowerCase() || "";
              return SUPPORTED_EXTENSIONS.includes(ext);
            });
            if (paths.length === 0) {
              setImportError("没有支持的文件格式（TXT/EPUB/PDF/MD/CBZ/DOCX）");
              return;
            }
            await importPaths(paths);
          }
        });
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      } catch (e) {
        console.error("Failed to register drag-drop listener:", e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const importPaths = async (paths: string[]) => {
    setImportError(null);
    setImporting(true);
    setImportProgress({ current: 0, total: paths.length });
    let successCount = 0;
    let lastError = "";
    for (let i = 0; i < paths.length; i++) {
      setImportProgress({ current: i + 1, total: paths.length });
      try {
        await importBook(paths[i]);
        successCount++;
      } catch (e: any) {
        lastError = e?.toString() || String(e);
        console.error("Import failed:", paths[i], e);
      }
    }
    setImporting(false);
    setImportProgress(null);
    if (successCount > 0) {
      loadBooks();
    }
    if (lastError) {
      setImportError(
        successCount > 0
          ? `${successCount}/${paths.length} 导入成功，最后错误: ${lastError}`
          : `导入失败: ${lastError}`
      );
    }
  };

  const handleImport = async () => {
    setImportError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Books",
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        await importPaths(paths);
      }
    } catch (e: any) {
      const msg = e?.toString() || String(e);
      console.error("Import dialog failed:", e);
      setImportError(`导入对话框失败: ${msg}`);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTag(newTagName.trim(), newTagColor);
      setNewTagName("");
      setNewTagColor(TAG_COLORS[0]);
      setShowTagDialog(false);
    } catch {
      // Store already showed an error toast; keep the dialog open.
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroup(newGroupName.trim());
      setNewGroupName("");
      setShowGroupDialog(false);
    } catch {
      // Store already showed an error toast; keep the dialog open.
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "tag") {
      await deleteTag(confirmDelete.id);
    } else {
      await deleteGroup(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  const showStarred = () => {
    setStarredOnly(true);
    // Clear active tag/group without triggering their loadBooks side-effects;
    // setFilter below is the single reload, and it also records the starred
    // filter in the store so later no-arg loadBooks() calls keep this view.
    useAppStore.setState({ activeTag: null, activeGroup: null });
    setFilter({ starred: true });
  };

  const selectTag = (name: string | null) => {
    setStarredOnly(false);
    setActiveTag(name);
  };

  const selectGroup = (id: string | null) => {
    setStarredOnly(false);
    setActiveGroup(id);
  };

  const clearFilter = () => {
    setStarredOnly(false);
    useAppStore.setState({ activeTag: null, activeGroup: null });
    setFilter({});
  };

  const sortedBooks = [...books].sort((a, b) => {
    switch (sortBy) {
      case "recent":
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      case "added":
        return (b.added_at || "").localeCompare(a.added_at || "");
      case "title":
        return a.title.localeCompare(b.title, "zh");
      case "progress":
        // Descending: most-read first
        return (b.reading_percentage || 0) - (a.reading_percentage || 0);
      default:
        return 0;
    }
  });

  const hasActiveFilter = activeTag !== null || activeGroup !== null || starredOnly;

  return (
    <div className="flex h-full relative" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Drag overlay */}
      {isDragging && (
        <div
          className="fixed inset-0 flex items-center justify-center pointer-events-none animate-fade-in"
          style={{
            background: "var(--accent-soft)",
            backdropFilter: "blur(2px)",
            zIndex: "var(--z-toast)",
          }}
        >
          <div
            className="flex flex-col items-center gap-4 px-12 py-10 rounded-2xl"
            style={{
              background: "var(--bg-elevated)",
              border: "2px dashed var(--accent)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
<Upload size={ 48 } strokeWidth={1.5} />
            <div className="text-base font-medium">释放鼠标以导入</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              支持 TXT / EPUB / PDF / MD / CBZ / DOCX
            </div>
          </div>
        </div>
      )}

      {/* Importing progress */}
      {importing && importProgress && (
        <div
          className="fixed bottom-6 right-6 px-4 py-3 rounded-xl animate-slide-up"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
            zIndex: "var(--z-toast)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            />
            <div className="text-xs">
              正在导入 {importProgress.current}/{importProgress.total}
            </div>
          </div>
          <div className="progress-bar mt-2.5" style={{ width: 180 }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        className="flex-shrink-0 flex flex-col overflow-hidden transition-all"
        style={{
          width: sidebarCollapsed ? 48 : 200,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0">
          {!sidebarCollapsed && (
            <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
              导航
            </span>
          )}
          <button
            className="p-1 rounded hover-bg"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
<ChevronLeft size={ 14 } strokeWidth={2} />
          </button>
        </div>

        {sidebarCollapsed ? (
          <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1">
            {/* Collapsed icon shortcuts */}
            <SidebarIcon
icon={<Book size={16} strokeWidth={2} />}
              label="全部书籍"
              active={!hasActiveFilter}
              onClick={clearFilter}
            />
            <SidebarIcon
icon={<Star size={16} strokeWidth={2} />}
              label="收藏"
              active={starredOnly}
              onClick={showStarred}
            />
            <div className="w-6 h-px my-1" style={{ background: "var(--border)" }} />
            {/* Tag icons — full list, scrollable */}
            {tags.map((tag) => (
              <SidebarIcon
                key={tag.id}
                icon={<div className="w-3 h-3 rounded-full" style={{ background: tag.color }} />}
                label={tag.name}
                active={activeTag === tag.name}
                onClick={() => selectTag(activeTag === tag.name ? null : tag.name)}
              />
            ))}
            <div className="w-6 h-px my-1" style={{ background: "var(--border)" }} />
            {/* Group icons — full list, scrollable */}
            {groups.map((group) => (
              <SidebarIcon
                key={group.id}
                icon={<GroupIcon size={15} />}
                label={group.name}
                active={activeGroup === group.id}
                onClick={() => selectGroup(activeGroup === group.id ? null : group.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {/* Fixed nav items */}
            <div className="mb-4">
              <SidebarItem
                icon={
<Book size={ 15 } strokeWidth={2} />
                }
                label="全部书籍"
                active={!hasActiveFilter}
                onClick={clearFilter}
              />
              <SidebarItem
                icon={
<Star size={ 15 } strokeWidth={2} />
                }
                label="收藏"
                active={starredOnly}
                onClick={showStarred}
              />
            </div>

            {/* Tags section */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                  标签
                </span>
                <button
                  className="p-0.5 rounded hover-bg"
                  style={{ color: "var(--text-tertiary)" }}
                  onClick={() => setShowTagDialog(true)}
                  title="新建标签"
                >
<Plus size={ 12 } strokeWidth={2.5} />
                </button>
              </div>
              {tags.length === 0 ? (
                <div className="px-2 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  暂无标签
                </div>
              ) : (
                tags.map((tag) => (
                  <SidebarItem
                    key={tag.id}
                    icon={
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: tag.color }}
                      />
                    }
                    label={tag.name}
                    active={activeTag === tag.name}
                    onClick={() => selectTag(activeTag === tag.name ? null : tag.name)}
                    onDelete={() => setConfirmDelete({ kind: "tag", id: tag.id, name: tag.name })}
                  />
                ))
              )}
            </div>

            {/* Groups section */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                  分组
                </span>
                <button
                  className="p-0.5 rounded hover-bg"
                  style={{ color: "var(--text-tertiary)" }}
                  onClick={() => setShowGroupDialog(true)}
                  title="新建分组"
                >
<Plus size={ 12 } strokeWidth={2.5} />
                </button>
              </div>
              {groups.length === 0 ? (
                <div className="px-2 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  暂无分组
                </div>
              ) : (
                groups.map((group) => (
                  <SidebarItem
                    key={group.id}
                    icon={
                      <span className="flex-shrink-0 flex items-center" style={{ color: "var(--text-tertiary)" }}>
                        <GroupIcon />
                      </span>
                    }
                    label={group.name}
                    active={activeGroup === group.id}
                    onClick={() => selectGroup(activeGroup === group.id ? null : group.id)}
                    onDelete={() => setConfirmDelete({ kind: "group", id: group.id, name: group.name })}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
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

            {/* Active filter badge */}
            {hasActiveFilter && (
              <button
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-all hover:opacity-80"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent)",
                }}
                onClick={clearFilter}
              >
                {starredOnly && "收藏"}
                {activeTag && `标签: ${activeTag}`}
                {activeGroup && `分组: ${groups.find((g) => g.id === activeGroup)?.name || activeGroup}`}
<X size={ 12 } strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <select
              className="text-xs px-3 py-1.5 rounded-sm outline-none cursor-pointer"
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
              className="flex rounded-sm overflow-hidden"
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
<LayoutGrid size={ 14 } strokeWidth={2} />
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
<List size={ 14 } strokeWidth={2} />
              </button>
            </div>

            {/* Theme switcher */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-sm"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  title={`主题：${t.label}`}
                  className="p-1.5 rounded transition-all"
                  style={
                    theme === t.key
                      ? { background: "var(--bg-elevated)", color: "var(--accent)", boxShadow: "var(--shadow-sm)" }
                      : { color: "var(--text-tertiary)" }
                  }
                  onClick={() => setTheme(t.key)}
                >
                  {t.key === "light" ? (
<Sun size={ 14 } strokeWidth={2} />
                  ) : t.key === "dark" ? (
<Moon size={ 14 } strokeWidth={2} />
                  ) : (
<FileText size={ 14 } strokeWidth={2} />
                  )}
                </button>
              ))}
            </div>

            {/* More menu */}
            <div className="relative" ref={moreRef}>
              <Button variant="secondary" size="sm" onClick={() => setShowMoreMenu((v) => !v)}>
                更多
<ChevronDown size={12} strokeWidth={2} style={{ transform: showMoreMenu ? "rotate(180deg)" : "none", transition: "transform var(--transition-fast)" }} />
              </Button>
              {showMoreMenu && (
                <div
                  className="absolute right-0 top-full mt-1.5 rounded-lg overflow-hidden animate-scale-in py-1"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-lg)",
                    zIndex: "var(--z-popover)",
                    minWidth: 132,
                  }}
                >
                  {MORE_MENU.map((item) => (
                    <button
                      key={item.path}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover-bg"
                      style={{ color: "var(--text-secondary)" }}
                      onClick={() => {
                        setShowMoreMenu(false);
                        navigate(item.path);
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Import button */}
            <Button size="sm" onClick={handleImport}>
<Plus size={ 13 } strokeWidth={2.5} />
              导入
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {/* Error toast */}
          {importError && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-xs animate-slide-down toast-error"
              style={{
                boxShadow: "var(--shadow-lg)",
                maxWidth: 400,
                zIndex: "var(--z-toast)",
              }}
            >
              <div className="flex items-center gap-2">
<Search size={ 14 } strokeWidth={2} />
                <span>{importError}</span>
                <button
                  className="ml-2 p-0.5 rounded hover:opacity-70"
                  onClick={() => setImportError(null)}
                >
<X size={ 12 } strokeWidth={2} />
                </button>
              </div>
            </div>
          )}

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
<BookOpen size={ 36 } strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <div className="text-base font-medium mb-1">
                  {hasActiveFilter ? "该筛选条件下无书籍" : "书库为空"}
                </div>
                <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {hasActiveFilter
                    ? "尝试清除筛选条件，或导入新书籍"
                    : "拖拽文件到窗口，或点击右上角「导入」按钮"}
                </div>
              </div>
              {!hasActiveFilter && (
                <div className="flex gap-2 mt-1">
                  {["TXT", "EPUB", "PDF", "MD", "CBZ", "DOCX"].map((fmt) => (
                    <span
                      key={fmt}
                      className="text-xs px-2.5 py-1 rounded"
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
              )}
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5"
                  : "flex flex-col gap-2"
              }
            >
              {sortedBooks.map((book, i) => (
                <div
                  key={book.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: "backwards" }}
                >
                  <BookCard book={book} viewMode={viewMode} />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Create Tag Dialog */}
      <Dialog
        open={showTagDialog}
        onClose={() => setShowTagDialog(false)}
        title="新建标签"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowTagDialog(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleCreateTag} disabled={!newTagName.trim()}>
              创建
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              标签名称
            </label>
            <Input
              placeholder="输入标签名称"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
              颜色
            </label>
            <div className="flex gap-2">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  className="w-7 h-7 rounded-full transition-all"
                  style={{
                    background: color,
                    outline: newTagColor === color ? `2px solid ${color}` : "none",
                    outlineOffset: "2px",
                  }}
                  onClick={() => setNewTagColor(color)}
                />
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog
        open={showGroupDialog}
        onClose={() => setShowGroupDialog(false)}
        title="新建分组"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowGroupDialog(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
              创建
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
            分组名称
          </label>
          <Input
            placeholder="输入分组名称"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            autoFocus
          />
        </div>
      </Dialog>

      {/* Delete tag/group confirmation */}
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete?.kind === "tag" ? "删除标签" : "删除分组"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              size="sm"
              style={{ background: "var(--error)", boxShadow: "none" }}
              onClick={handleConfirmDelete}
            >
              删除
            </Button>
          </>
        }
      >
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          确定删除{confirmDelete?.kind === "tag" ? "标签" : "分组"}「{confirmDelete?.name}」吗？
          {confirmDelete?.kind === "tag"
            ? "相关书籍上的该标签会一并移除。"
            : "分组内的书籍不会被删除。"}
        </div>
      </Dialog>
    </div>
  );
}

// Sidebar item component
function SidebarItem({
  icon,
  label,
  active,
  onClick,
  onDelete,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer group transition-all hover-bg"
      style={{
        background: active ? "var(--accent-soft)" : undefined,
        color: active ? "var(--accent)" : "var(--text-secondary)",
      }}
      onClick={onClick}
    >
      {icon}
      <span className="text-xs truncate flex-1">{label}</span>
      {onDelete && (
        <button
          className="p-0.5 rounded hover-bg opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="删除"
        >
<X size={ 12 } strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// Collapsed sidebar icon component
function SidebarIcon({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  // Note: active background is inline so it wins over .hover-bg on hover
  return (
    <button
      className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover-bg"
      style={{
        background: active ? "var(--accent-soft)" : undefined,
        color: active ? "var(--accent)" : "var(--text-tertiary)",
      }}
      onClick={onClick}
      title={label}
    >
      {icon}
    </button>
  );
}
