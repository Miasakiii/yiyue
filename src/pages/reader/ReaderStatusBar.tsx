import type { Chapter, ReadingProgress } from "../../types";

interface ReaderStatusBarProps {
  chapterIndex: number;
  chapters: Chapter[];
  currentChapter: Chapter;
  currentBook: { total_chars?: number | null };
  progress: ReadingProgress | null;
  charsPerMinute: number;
  dailyGoal: number;
  setDailyGoal: (v: number) => void;
  todayStats: { chars_read: number; duration_ms: number } | null;
  progressPct: number;
  editingGoal: boolean;
  setEditingGoal: (v: boolean) => void;
  goalInput: string;
  setGoalInput: (v: string) => void;
}

function formatChars(chars: number): string {
  if (chars >= 10000) return `${(chars / 10000).toFixed(1)}万字`;
  return `${chars}字`;
}

export function ReaderStatusBar({
  chapterIndex, chapters, currentChapter, currentBook,
  progress, charsPerMinute, dailyGoal, setDailyGoal,
  todayStats, progressPct, editingGoal, setEditingGoal,
  goalInput, setGoalInput,
}: ReaderStatusBarProps) {
  const chapterChars = currentChapter.char_count ?? 0;
  const readRatio = progress?.chapter_id === currentChapter.id ? (progress.scroll_offset ?? 0) : 0;
  const remainingChars = Math.max(0, chapterChars * (1 - readRatio));
  const remainingMin = Math.round(remainingChars / charsPerMinute);
  const chapterDone = chapterChars > 0 && remainingMin < 1;

  return (
    <footer className="flex items-center justify-between px-5 py-2 flex-shrink-0"
      style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
      <div className="flex items-center gap-4">
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          第 {chapterIndex + 1}/{chapters.length} 章
        </span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {currentChapter.title}
        </span>
        {chapterChars > 0 && (
          chapterDone ? (
            <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
              已读完本章
            </span>
          ) : (
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              约剩 {remainingMin} 分钟
            </span>
          )
        )}
        {/* Daily reading goal */}
        {dailyGoal > 0 && todayStats && (
          <span className="text-xs cursor-pointer hover:underline"
            style={{ color: "var(--text-tertiary)" }}
            onClick={() => {
              setGoalInput(String(dailyGoal));
              setEditingGoal(true);
            }}
            title="点击修改目标">
            {formatChars(todayStats.chars_read)} / {formatChars(dailyGoal)}
          </span>
        )}
        {editingGoal ? (
          <div className="flex items-center gap-1">
            <input type="number" className="w-16 px-1.5 py-0.5 text-xs rounded"
              style={{ background: "var(--bg-primary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = parseInt(goalInput, 10);
                  if (val > 0) setDailyGoal(val);
                  setEditingGoal(false);
                } else if (e.key === "Escape") {
                  setEditingGoal(false);
                }
              }}
              autoFocus />
            <button className="text-xs px-1.5 py-0.5 rounded"
              style={{ color: "var(--accent)" }}
              onClick={() => {
                const val = parseInt(goalInput, 10);
                if (val > 0) setDailyGoal(val);
                setEditingGoal(false);
              }}>确定</button>
          </div>
        ) : dailyGoal === 0 && (
          <button className="text-xs px-2 py-0.5 rounded hover-bg"
            style={{ color: "var(--text-tertiary)" }}
            onClick={() => {
              setGoalInput(String(Math.round((currentBook.total_chars ?? 0) / 10)));
              setEditingGoal(true);
            }}>
            设定目标
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          {currentBook.total_chars?.toLocaleString() || "?"} 字
        </span>
        <div className="w-32 progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="text-xs font-semibold tabular-nums w-8 text-right" style={{ color: "var(--text-secondary)" }}>{progressPct}%</span>
      </div>
    </footer>
  );
}
