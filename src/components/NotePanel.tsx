import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HIGHLIGHT_COLORS } from "../constants";

interface Annotation {
  id: string;
  book_id: string;
  chapter_id: string | null;
  start_offset: number;
  end_offset: number;
  selected_text: string | null;
  color: string;
  annotation_type: string;
  content: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

interface NotePanelProps {
  bookId: string;
  chapterId?: string;
  visible: boolean;
  onClose: () => void;
  onJumpTo?: (chapterId: string, offset: number) => void;
}

export function NotePanel({
  bookId,
  chapterId,
  visible,
  onClose,
  onJumpTo,
}: NotePanelProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showExport, setShowExport] = useState(false);

  const handleExport = useCallback(async (format: string) => {
    try {
      const content = await invoke<string>("export_annotations", {
        bookId,
        format,
      });
      const filename = await invoke<string>("get_export_filename", {
        bookId,
        format,
      });

      // Create and download file
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowExport(false);
    } catch (e) {
      console.error("Export failed:", e);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadAnnotations();
  }, [visible, bookId, chapterId]);

  const loadAnnotations = async () => {
    try {
      const result = await invoke<Annotation[]>("get_annotations", {
        bookId,
        chapterId: chapterId || null,
      });
      setAnnotations(result);
    } catch (e) {
      console.error("Failed to load annotations:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_annotation", { id });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error("Failed to delete annotation:", e);
    }
  };

  const handleEdit = (annotation: Annotation) => {
    setEditingId(annotation.id);
    setEditText(annotation.content || "");
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await invoke("update_annotation", {
        id,
        update: { content: editText },
      });
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, content: editText, updated_at: new Date().toISOString() } : a
        )
      );
      setEditingId(null);
      setEditText("");
    } catch (e) {
      console.error("Failed to update annotation:", e);
    }
  };

  const filteredAnnotations =
    filter === "all"
      ? annotations
      : annotations.filter((a) => a.color === filter);

  if (!visible) return null;

  return (
    <div
      className="w-80 flex-shrink-0 border-l flex flex-col h-full"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="font-medium text-sm">笔记与划线</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              className="text-xs px-2 py-0.5 rounded"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setShowExport(!showExport)}
            >
              导出
            </button>
            {showExport && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-10 py-1"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  minWidth: "120px",
                }}
              >
                {["markdown", "html", "json"].map((fmt) => (
                  <button
                    key={fmt}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-opacity-50"
                    style={{ color: "var(--text-primary)" }}
                    onClick={() => handleExport(fmt)}
                  >
                    {fmt === "markdown" ? "Markdown (.md)" : fmt === "html" ? "HTML (.html)" : "JSON (.json)"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="text-sm px-2 py-0.5 rounded"
            style={{ color: "var(--text-secondary)" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Color filter */}
      <div
        className="flex items-center gap-1.5 px-4 py-2 border-b overflow-x-auto"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          className="px-2 py-0.5 text-xs rounded-full"
          style={{
            background: filter === "all" ? "var(--accent)" : "var(--bg-tertiary)",
            color: filter === "all" ? "white" : "var(--text-secondary)",
          }}
          onClick={() => setFilter("all")}
        >
          全部
        </button>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.color}
            className="w-5 h-5 rounded-full border-2 flex-shrink-0"
            style={{
              background: c.color,
              borderColor: filter === c.color ? "var(--text-primary)" : "transparent",
            }}
            onClick={() => setFilter(c.color)}
            title={c.name}
          />
        ))}
      </div>

      {/* Annotations list */}
      <div className="flex-1 overflow-y-auto">
        {filteredAnnotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div style={{ color: "var(--text-tertiary)", fontSize: "2rem" }}>
              📝
            </div>
            <div
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              暂无笔记
            </div>
            <div
              className="text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              选中文字后点击颜色即可添加划线
            </div>
          </div>
        ) : (
          <div className="py-2">
            {filteredAnnotations.map((annotation) => (
              <div
                key={annotation.id}
                className="px-4 py-3 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                {/* Highlight bar */}
                <div className="flex items-start gap-2">
                  <div
                    className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ background: annotation.color }}
                  />
                  <div className="flex-1 min-w-0">
                    {/* Selected text */}
                    {annotation.selected_text && (
                      <div
                        className="text-sm mb-1 line-clamp-3"
                        style={{
                          color: "var(--text-primary)",
                          background: `${annotation.color}20`,
                          padding: "2px 4px",
                          borderRadius: "2px",
                        }}
                      >
                        "{annotation.selected_text}"
                      </div>
                    )}

                    {/* Note content */}
                    {editingId === annotation.id ? (
                      <div className="mt-1">
                        <textarea
                          className="w-full p-2 text-sm rounded resize-none"
                          style={{
                            background: "var(--bg-primary)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                          }}
                          rows={3}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-1">
                          <button
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ color: "var(--text-secondary)" }}
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                          <button
                            className="text-xs px-2 py-0.5 rounded text-white"
                            style={{ background: "var(--accent)" }}
                            onClick={() => handleSaveEdit(annotation.id)}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : annotation.content ? (
                      <div
                        className="text-sm mt-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {annotation.content}
                      </div>
                    ) : null}

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {new Date(annotation.created_at).toLocaleDateString()}
                      </span>
                      <button
                        className="text-xs hover:underline"
                        style={{ color: "var(--text-tertiary)" }}
                        onClick={() => handleEdit(annotation)}
                      >
                        编辑
                      </button>
                      <button
                        className="text-xs hover:underline"
                        style={{ color: "var(--text-tertiary)" }}
                        onClick={() => handleDelete(annotation.id)}
                      >
                        删除
                      </button>
                      {annotation.chapter_id && onJumpTo && (
                        <button
                          className="text-xs hover:underline"
                          style={{ color: "var(--accent)" }}
                          onClick={() =>
                            onJumpTo(annotation.chapter_id!, annotation.start_offset)
                          }
                        >
                          跳转
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 border-t text-xs"
        style={{
          borderColor: "var(--border)",
          color: "var(--text-tertiary)",
        }}
      >
        共 {filteredAnnotations.length} 条
        {filter !== "all" && ` (已筛选)`}
      </div>
    </div>
  );
}
