import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ReadingStats {
  total_duration_ms: number;
  total_chars_read: number;
  total_sessions: number;
  reading_days: number;
  current_streak: number;
  longest_streak: number;
}

interface DailyStats {
  date: string;
  duration_ms: number;
  chars_read: number;
  sessions: number;
}

interface BookStats {
  book_id: string;
  book_title: string;
  total_duration_ms: number;
  total_chars_read: number;
  sessions: number;
  last_read: string;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}小时${minutes > 0 ? minutes + "分钟" : ""}`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${Math.floor(ms / 1000)}秒`;
}

function formatChars(chars: number): string {
  if (chars >= 10000) return `${(chars / 10000).toFixed(1)}万字`;
  return `${chars}字`;
}

export function Stats({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [bookStats, setBookStats] = useState<BookStats[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [s, d, b] = await Promise.all([
        invoke<ReadingStats>("get_reading_stats"),
        invoke<DailyStats[]>("get_daily_stats", { days: 90 }),
        invoke<BookStats[]>("get_book_stats"),
      ]);
      setStats(s);
      setDailyStats(d);
      setBookStats(b);
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  };

  const generateCalendarData = () => {
    const days: { date: string; duration: number; level: number }[] = [];
    const today = new Date();
    const statsMap = new Map(dailyStats.map((d) => [d.date, d.duration_ms]));

    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const duration = statsMap.get(dateStr) || 0;
      const level = duration === 0 ? 0 : duration < 600000 ? 1 : duration < 1800000 ? 2 : duration < 3600000 ? 3 : 4;
      days.push({ date: dateStr, duration, level });
    }
    return days;
  };

  const calendarData = generateCalendarData();

  const HEAT_COLORS = [
    "var(--bg-tertiary)",
    "#c6dbef",
    "#6baed6",
    "#2171b5",
    "#08306b",
  ];

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-8 py-5 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div className="flex items-center gap-3">
          <button
            className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
            style={{ color: "var(--text-secondary)" }}
            onClick={onClose}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <h1 className="text-lg font-semibold">阅读统计</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {stats ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="总阅读时长"
                value={formatDuration(stats.total_duration_ms)}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                }
                color="#6366f1"
              />
              <StatCard
                label="总阅读字数"
                value={formatChars(stats.total_chars_read)}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                }
                color="#8b5cf6"
              />
              <StatCard
                label="连续阅读"
                value={`${stats.current_streak}天`}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                }
                color="#f59e0b"
              />
              <StatCard
                label="最长连续"
                value={`${stats.longest_streak}天`}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="7" />
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                  </svg>
                }
                color="#22c55e"
              />
            </div>

            {/* Calendar heatmap */}
            <div
              className="rounded-xl p-6"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-light)",
              }}
            >
              <h2 className="text-sm font-semibold mb-4">阅读日历</h2>
              <div className="flex flex-wrap gap-1.5">
                {calendarData.map((day) => (
                  <div
                    key={day.date}
                    className="w-3.5 h-3.5 rounded-sm cursor-default transition-transform hover:scale-125"
                    style={{
                      background: HEAT_COLORS[day.level],
                    }}
                    title={`${day.date}: ${formatDuration(day.duration)}`}
                  />
                ))}
              </div>
              <div
                className="flex items-center gap-2 mt-4 text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                <span>少</span>
                {HEAT_COLORS.map((color, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-sm"
                    style={{ background: color }}
                  />
                ))}
                <span>多</span>
              </div>
            </div>

            {/* Book stats */}
            {bookStats.length > 0 && (
              <div
                className="rounded-xl p-6"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <h2 className="text-sm font-semibold mb-4">书籍阅读排行</h2>
                <div className="space-y-3">
                  {bookStats.slice(0, 10).map((book, i) => (
                    <div key={book.book_id} className="flex items-center gap-4">
                      <span
                        className="text-sm font-medium w-6 text-center tabular-nums"
                        style={{
                          color: i < 3 ? "var(--accent)" : "var(--text-tertiary)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate mb-1.5">{book.book_title}</div>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex-1 h-1.5 rounded-full overflow-hidden"
                            style={{ background: "var(--bg-tertiary)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${(book.total_duration_ms / (bookStats[0]?.total_duration_ms || 1)) * 100}%`,
                                background: i < 3
                                  ? "linear-gradient(90deg, var(--accent), var(--accent-hover))"
                                  : "var(--text-tertiary)",
                              }}
                            />
                          </div>
                          <span
                            className="text-xs flex-shrink-0 tabular-nums"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {formatDuration(book.total_duration_ms)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
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
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-5 transition-all hover:shadow-md"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-light)",
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{
          background: `${color}15`,
          color: color,
        }}
      >
        {icon}
      </div>
      <div className="text-xl font-semibold mb-0.5 tabular-nums">{value}</div>
      <div
        className="text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </div>
    </div>
  );
}
