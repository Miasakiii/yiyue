import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const HIGHLIGHT_COLORS = [
  { color: "#EF4444", name: "重点", key: "1" },
  { color: "#F97316", name: "存疑", key: "2" },
  { color: "#EAB308", name: "标记", key: "3" },
  { color: "#22C55E", name: "灵感", key: "4" },
  { color: "#3B82F6", name: "引用", key: "5" },
  { color: "#A855F7", name: "感悟", key: "6" },
  { color: "#6B7280", name: "待确认", key: "7" },
];

interface HighlightPopoverProps {
  bookId: string;
  chapterId: string;
  onCreated?: () => void;
}

export function HighlightPopover({
  bookId,
  chapterId,
  onCreated,
}: HighlightPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [startOffset, setStartOffset] = useState(0);
  const [endOffset, setEndOffset] = useState(0);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [pendingColor, setPendingColor] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        // Delay hiding to allow clicking the popover
        setTimeout(() => {
          if (!popoverRef.current?.contains(document.activeElement)) {
            setVisible(false);
          }
        }, 200);
        return;
      }

      const text = selection.toString().trim();
      if (text.length === 0) return;

      // Get selection position
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectedText(text);
      setStartOffset(range.startOffset);
      setEndOffset(range.endOffset);
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
      setVisible(true);
      setShowNoteInput(false);
      setNoteText("");
    };

    // Keyboard shortcut: 1-7 for quick highlight
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;
      if (showNoteInput) return;

      const colorEntry = HIGHLIGHT_COLORS.find((c) => c.key === e.key);
      if (colorEntry) {
        e.preventDefault();
        createHighlight(colorEntry.color);
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, showNoteInput, selectedText, startOffset, endOffset]);

  const createHighlight = async (color: string, note?: string) => {
    try {
      await invoke("create_annotation", {
        annotation: {
          book_id: bookId,
          chapter_id: chapterId,
          start_offset: startOffset,
          end_offset: endOffset,
          selected_text: selectedText,
          color,
          annotation_type: note ? "note" : "highlight",
          content: note || null,
          tags: null,
        },
      });

      setVisible(false);
      setShowNoteInput(false);
      setNoteText("");
      window.getSelection()?.removeAllRanges();
      onCreated?.();
    } catch (e) {
      console.error("Failed to create highlight:", e);
    }
  };

  const handleColorClick = (color: string) => {
    setPendingColor(color);
    setShowNoteInput(true);
  };

  const handleQuickHighlight = (color: string) => {
    createHighlight(color);
  };

  const handleSaveNote = () => {
    createHighlight(pendingColor, noteText || undefined);
  };

  if (!visible) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      {showNoteInput ? (
        /* Note input panel */
        <div
          className="rounded-lg shadow-xl p-3 w-72"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="text-xs mb-2 font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            添加笔记（可选）
          </div>
          <textarea
            className="w-full p-2 rounded text-sm resize-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            rows={3}
            placeholder="输入笔记内容..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-3 py-1 text-xs rounded"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => {
                setShowNoteInput(false);
                createHighlight(pendingColor);
              }}
            >
              跳过
            </button>
            <button
              className="px-3 py-1 text-xs rounded text-white"
              style={{ background: "var(--accent)" }}
              onClick={handleSaveNote}
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        /* Color picker */
        <div
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-xl"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.color}
              className="w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform relative group"
              style={{
                background: c.color,
                borderColor: "transparent",
              }}
              onClick={() => handleQuickHighlight(c.color)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleColorClick(c.color);
              }}
              title={`${c.name} (${c.key}) - 右键添加笔记`}
            >
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                }}
              >
                {c.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
