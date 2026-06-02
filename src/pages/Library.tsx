import { useState, useEffect } from "react";
import { useAppStore } from "../stores/app";
import { BookCard } from "../components/BookCard";
import { SUPPORTED_EXTENSIONS } from "../constants";

type SortKey = "recent" | "added" | "title" | "progress";

const TAG_COLORS = [
  "#6366f1", "#8b5cf6", "#ef4444", "#f59e0b",
  "#22c55e", "#06b6d4", "#ec4899", "#6b7280",
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "最近阅读" },
  { key: "added", label: "最近添加" },
  { key: "title", label: "书名" },
  { key: "progress", label: "阅读进度" },
];

export function Library({ onShowStats, onShowSync }: { onShowStats?: () => void; onShowSync?: () => void }) {
  const {
    books, loading, viewMode, setViewMode, importBook,
    tags, groups, activeTag, activeGroup,
    loadTags, loadGroups, createTag, deleteTag, createGroup, deleteGroup,
    setActiveTag, setActiveGroup, loadBooks,
  } = useAppStore();

  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  // New tag/group dialog state
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("📁");

  // Load tags and groups on mount
  useEffect(() => {
    loadTags();
    loadGroups();
  }, []);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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
    await createTag(newTagName.trim(), newTagColor);
    setNewTagName("");
    setNewTagColor(TAG_COLORS[0]);
    setShowTagDialog(false);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    await createGroup(newGroupName.trim(), newGroupIcon);
    setNewGroupName("");
    setNewGroupIcon("📁");
    setShowGroupDialog(false);
  };

  const clearFilter = () => {
    setActiveTag(null);
    setActiveGroup(null);
    loadBooks({});
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
        return (b.reading_percentage || 0) - (a.reading_percentage || 0);
      default:
        return 0;
    }
  });

  const hasActiveFilter = activeTag !== null || activeGroup !== null;

  return (
    <div className="flex h-screen relative" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Drag overlay */}
      {isDragging && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none animate-fade-in"
          style={{
            background: "rgba(99, 102, 241, 0.08)",
            backdropFilter: "blur(2px)",
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
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-base font-medium">释放鼠标以导入</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              支持 TXT / EPUB / PDF / MD / CBZ
            </div>
          </div>
        </div>
      )}

      {/* Importing progress */}
      {importing && importProgress && (
        <div
          className="fixed bottom-6 right-6 z-[150] flex items-center gap-3 px-4 py-3 rounded-xl animate-slide-up"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <div className="text-xs">
            正在导入 {importProgress.current}/{importProgress.total}
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
            className="p-1 rounded-md hover:bg-[var(--bg-tertiary)]"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed ? (
                <path d="M9 18l6-6-6-6" />
              ) : (
                <path d="M15 18l-6-6 6-6" />
              )}
            </svg>
          </button>
        </div>

        {sidebarCollapsed ? (
          <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1">
            {/* Collapsed icon shortcuts */}
            <SidebarIcon
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>}
              label="全部书籍"
              active={!hasActiveFilter}
              onClick={clearFilter}
            />
            <SidebarIcon
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>}
              label="收藏"
              active={false}
              onClick={() => {
                setActiveTag(null);
                setActiveGroup(null);
                loadBooks({ starred: true });
              }}
            />
            <div className="w-6 h-px my-1" style={{ background: "var(--border)" }} />
            {/* Tag icons */}
            {tags.slice(0, 8).map((tag) => (
              <SidebarIcon
                key={tag.id}
                icon={<div className="w-3 h-3 rounded-full" style={{ background: tag.color }} />}
                label={tag.name}
                active={activeTag === tag.name}
                onClick={() => setActiveTag(activeTag === tag.name ? null : tag.name)}
              />
            ))}
            {tags.length > 8 && (
              <span className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>+{tags.length - 8}</span>
            )}
            <div className="w-6 h-px my-1" style={{ background: "var(--border)" }} />
            {/* Group icons */}
            {groups.slice(0, 6).map((group) => (
              <SidebarIcon
                key={group.id}
                icon={<span className="text-sm">{group.icon || "📁"}</span>}
                label={group.name}
                active={activeGroup === group.id}
                onClick={() => setActiveGroup(activeGroup === group.id ? null : group.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {/* Fixed nav items */}
            <div className="mb-4">
              <SidebarItem
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                }
                label="全部书籍"
                active={!hasActiveFilter}
                onClick={clearFilter}
              />
              <SidebarItem
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                }
                label="收藏"
                active={false}
                onClick={() => {
                  setActiveTag(null);
                  setActiveGroup(null);
                  loadBooks({ starred: true });
                }}
              />
            </div>

            {/* Tags section */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                  标签
                </span>
                <button
                  className="p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
                  style={{ color: "var(--text-tertiary)" }}
                  onClick={() => setShowTagDialog(true)}
                  title="新建标签"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
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
                    onClick={() => setActiveTag(activeTag === tag.name ? null : tag.name)}
                    onDelete={() => deleteTag(tag.id)}
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
                  className="p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
                  style={{ color: "var(--text-tertiary)" }}
                  onClick={() => setShowGroupDialog(true)}
                  title="新建分组"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
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
                      <span className="text-sm flex-shrink-0">{group.icon || "📁"}</span>
                    }
                    label={group.name}
                    active={activeGroup === group.id}
                    onClick={() => setActiveGroup(activeGroup === group.id ? null : group.id)}
                    onDelete={() => deleteGroup(group.id)}
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
                {activeTag && `标签: ${activeTag}`}
                {activeGroup && `分组: ${groups.find((g) => g.id === activeGroup)?.name || activeGroup}`}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
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
        <main className="flex-1 overflow-y-auto p-6 relative">
          {/* Error toast */}
          {importError && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg text-xs animate-slide-down"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid #ef4444",
                color: "#ef4444",
                boxShadow: "var(--shadow-lg)",
                maxWidth: 400,
              }}
            >
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{importError}</span>
                <button
                  className="ml-2 p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
                  onClick={() => setImportError(null)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
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
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
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
              )}
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

      {/* Create Tag Dialog */}
      {showTagDialog && (
        <Dialog title="新建标签" onClose={() => setShowTagDialog(false)}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                标签名称
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
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
            <div className="flex justify-end gap-2 mt-2">
              <button
                className="px-4 py-1.5 text-xs rounded-lg"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
                onClick={() => setShowTagDialog(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-lg text-white font-medium"
                style={{
                  background: "var(--accent)",
                  opacity: newTagName.trim() ? 1 : 0.5,
                }}
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Create Group Dialog */}
      {showGroupDialog && (
        <Dialog title="新建分组" onClose={() => setShowGroupDialog(false)}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                分组名称
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                placeholder="输入分组名称"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
                图标
              </label>
              <div className="flex gap-2 flex-wrap">
                {["📁", "📚", "📖", "📕", "📗", "📘", "📙", "📓", "📔", "📒", "🔖", "⭐", "❤️", "🎯", "💡", "🔥"].map((emoji) => (
                  <button
                    key={emoji}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all"
                    style={{
                      background: newGroupIcon === emoji ? "var(--accent-soft)" : "var(--bg-tertiary)",
                      border: newGroupIcon === emoji ? "1px solid var(--accent)" : "1px solid var(--border)",
                    }}
                    onClick={() => setNewGroupIcon(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button
                className="px-4 py-1.5 text-xs rounded-lg"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
                onClick={() => setShowGroupDialog(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-lg text-white font-medium"
                style={{
                  background: "var(--accent)",
                  opacity: newGroupName.trim() ? 1 : 0.5,
                }}
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </Dialog>
      )}
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
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group transition-all"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
      }}
      onClick={onClick}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {icon}
      <span className="text-xs truncate flex-1">{label}</span>
      {onDelete && showDelete && (
        <button
          className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] opacity-60 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="删除"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
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
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-tertiary)",
      }}
      onClick={onClick}
      title={label}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-tertiary)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {icon}
    </button>
  );
}

// Dialog component
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-5 animate-scale-in"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-xl)",
          minWidth: 320,
          maxWidth: "90vw",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold mb-4">{title}</div>
        {children}
      </div>
    </div>
  );
}
