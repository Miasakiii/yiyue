import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HIGHLIGHT_COLORS } from "../constants";
import { showToast } from "./Toast";

interface DictMeaning {
  part_of_speech: string;
  definitions: string[];
}

interface DictResult {
  word: string;
  phonetic: string | null;
  meanings: DictMeaning[];
}

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
  // Anchor: selection midpoint + top/bottom edges (viewport coords)
  const [anchor, setAnchor] = useState({ x: 0, top: 0, bottom: 0 });
  // Placement after measuring the popover (clamped to viewport, maybe flipped below)
  const [placement, setPlacement] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [startOffset, setStartOffset] = useState(0);
  const [endOffset, setEndOffset] = useState(0);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [pendingColor, setPendingColor] = useState("");
  const [showDict, setShowDict] = useState(false);
  const [dictResult, setDictResult] = useState<DictResult | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        // Delay hiding to allow clicking the popover
        setTimeout(() => {
          if (!popoverRef.current?.contains(document.activeElement)) {
            setVisible(false);
            setPlacement(null);
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
      setAnchor({
        x: rect.left + rect.width / 2,
        top: rect.top - 10,
        bottom: rect.bottom + 10,
      });
      setPlacement(null);
      setVisible(true);
      setShowNoteInput(false);
      setNoteText("");
      setShowDict(false);
      setDictResult(null);
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

  // Measure the popover and clamp it into the viewport: 8px side margins,
  // flip below the selection when there isn't enough room above.
  useLayoutEffect(() => {
    if (!visible) return;
    const el = popoverRef.current;
    if (!el) return;
    const margin = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.min(Math.max(anchor.x, margin + w / 2), vw - margin - w / 2);
    const fitsAbove = anchor.top - h >= margin;
    const fitsBelow = anchor.bottom + h <= vh - margin;
    const above = fitsAbove || !fitsBelow;
    setPlacement({ x, y: above ? anchor.top : anchor.bottom, above });
  }, [visible, anchor, showNoteInput, showDict, dictLoading, dictResult]);

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
      setPlacement(null);
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

  const handleSaveNote = () => {
    createHighlight(pendingColor, noteText || undefined);
  };

  const handleDictLookup = async () => {
    if (showDict) {
      setShowDict(false);
      return;
    }
    setShowDict(true);
    setDictLoading(true);
    setDictResult(null);
    try {
      const result = await invoke<DictResult>("lookup_word", { word: selectedText });
      setDictResult(result);
    } catch (e) {
      console.error("Dictionary lookup failed:", e);
      setDictResult({
        word: selectedText,
        phonetic: null,
        meanings: [{ part_of_speech: "", definitions: ["查询失败"] }],
      });
    } finally {
      setDictLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed"
      style={{
        zIndex: "var(--z-popover)",
        left: `${placement ? placement.x : anchor.x}px`,
        top: `${placement ? placement.y : anchor.top}px`,
        transform: placement && !placement.above ? "translate(-50%, 0)" : "translate(-50%, -100%)",
        visibility: placement ? "visible" : "hidden",
      }}
    >
      <div className={placement ? "animate-scale-in" : undefined}>
      {showNoteInput ? (
        /* Note input panel */
        <div
          className="rounded-lg p-3 w-72"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-xl)",
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
        <div>
          <div
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
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
                onClick={() => createHighlight(c.color)}
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

            {/* Dictionary button — only show for short selections */}
            {selectedText.length <= 50 && (
              <>
                <div className="w-px h-5 mx-0.5" style={{ background: "var(--border)" }} />
                <button
                  className="w-6 h-6 rounded flex items-center justify-center hover:scale-110 transition-transform"
                  style={{
                    background: showDict ? "var(--accent-soft)" : "var(--bg-tertiary)",
                    color: showDict ? "var(--accent)" : "var(--text-tertiary)",
                  }}
                  onClick={handleDictLookup}
                  title="词典查询"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </button>
              </>
            )}

            {/* Copy button */}
            <div className="w-px h-5 mx-0.5" style={{ background: "var(--border)" }} />
            <button
              className="w-6 h-6 rounded flex items-center justify-center hover:scale-110 transition-transform"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
              onClick={() => {
                navigator.clipboard.writeText(selectedText);
                showToast("已复制到剪贴板", "success");
              }}
              title="复制"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>

            {/* Search button */}
            <button
              className="w-6 h-6 rounded flex items-center justify-center hover:scale-110 transition-transform"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("search-with-text", { detail: { text: selectedText } }));
              }}
              title="在书中搜索"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>

          {/* Dictionary result panel */}
          {showDict && (
            <div
              className="mt-1 rounded-lg px-3 py-2 w-72"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              {dictLoading ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>查询中...</span>
                </div>
              ) : dictResult ? (
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{dictResult.word}</span>
                    {dictResult.phonetic && (
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{dictResult.phonetic}</span>
                    )}
                  </div>
                  {dictResult.meanings.map((m, i) => (
                    <div key={i} className="mb-1">
                      {m.part_of_speech && (
                        <span className="text-xs italic mr-1" style={{ color: "var(--accent)" }}>{m.part_of_speech}</span>
                      )}
                      {m.definitions.map((d, j) => (
                        <div key={j} className="text-xs ml-2" style={{ color: "var(--text-secondary)" }}>
                          {j + 1}. {d}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
