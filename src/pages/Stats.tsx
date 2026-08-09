import { useEffect, useState } from "react";
import {
  AlertCircle, Award, BookCheck, BookOpen, BookOpenText, Bookmark, Clock,
  Crown, Flame, Highlighter, Hourglass, Image, Landmark, Library, LibraryBig,
  Lock, Medal, Repeat, StickyNote, Zap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { PageHeader, Button } from "../components/ui";

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

interface Achievement {
  key: string;
  name: string;
  description: string;
  icon: string;
  unlocked_at: string | null;
}

const ACHIEVEMENT_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  BookCheck, Library, Highlighter, StickyNote, Bookmark, Clock, Hourglass,
  Medal, Flame, Crown, BookOpenText, Repeat, LibraryBig, Landmark, Image,
};

interface WeekSummary {
  duration_ms: number;
  chars_read: number;
  days: number;
  books_finished: number;
  annotations: number;
}

interface WeeklyReport {
  week_start: string;
  current: WeekSummary;
  previous: WeekSummary | null;
}

function fmtHours(ms: number): string {
  return (ms / 3600000).toFixed(1).replace(/\.0$/, "");
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

export function Stats() {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [bookStats, setBookStats] = useState<BookStats[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError("");
    try {
      const [s, d, b, a, w] = await Promise.all([
        invoke<ReadingStats>("get_reading_stats"),
        invoke<DailyStats[]>("get_daily_stats", { days: 90 }),
        invoke<BookStats[]>("get_book_stats"),
        invoke<Achievement[]>("get_achievements"),
        invoke<WeeklyReport>("get_weekly_report"),
      ]);
      setStats(s);
      setDailyStats(d);
      setBookStats(b);
      setAchievements(a);
      setWeekly(w);
    } catch (e) {
      console.error("Failed to load stats:", e);
      setError("加载统计数据失败，请重试");
    }
  };

  // Calendar cells covering the last ~90 days, padded back to Monday so the
  // grid aligns to whole weeks (one column per week, rows = Mon..Sun).
  const generateCalendarData = () => {
    const days: { date: string; duration: number; chars: number; level: number }[] = [];
    const today = new Date();
    const statsMap = new Map(dailyStats.map((d) => [d.date, d]));

    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    // Shift back to the Monday of that week (getDay: 0=Sun..6=Sat). Local-time
    // accessors are used throughout so each cell matches the user's calendar
    // day — getUTCDay/toISOString would shift UTC+8 early-morning reading
    // into the previous day's cell.
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const entry = statsMap.get(dateStr);
      const duration = entry?.duration_ms || 0;
      const chars = entry?.chars_read || 0;
      const level = duration === 0 ? 0 : duration < 600000 ? 1 : duration < 1800000 ? 2 : duration < 3600000 ? 3 : 4;
      days.push({ date: dateStr, duration, chars, level });
    }
    return days;
  };

  const calendarData = generateCalendarData();

  // Accent-tinted levels — adapts to light/dark/sepia via the accent token.
  const HEAT_COLORS = [
    "var(--bg-tertiary)",
    "color-mix(in srgb, var(--accent) 25%, transparent)",
    "color-mix(in srgb, var(--accent) 45%, transparent)",
    "color-mix(in srgb, var(--accent) 65%, transparent)",
    "var(--accent)",
  ];

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <PageHeader title="阅读统计" />

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {error ? (
          <div className="max-w-4xl mx-auto">
            <div
              className="rounded-xl p-10 flex flex-col items-center gap-4"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-light)",
              }}
            >
<AlertCircle size={ 24 } style={{ stroke: "var(--error)" }} />
              <div className="text-sm" style={{ color: "var(--error)" }}>{error}</div>
              <Button variant="secondary" size="sm" onClick={loadData}>
                重新加载
              </Button>
            </div>
          </div>
        ) : stats ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="总阅读时长"
                value={formatDuration(stats.total_duration_ms)}
                icon={
<Clock size={ 20 } strokeWidth={2} />
                }
                color="var(--accent)"
              />
              <StatCard
                label="总阅读字数"
                value={formatChars(stats.total_chars_read)}
                icon={
<BookOpen size={ 20 } strokeWidth={2} />
                }
                color="var(--success)"
              />
              <StatCard
                label="连续阅读"
                value={`${stats.current_streak}天`}
                icon={
<Zap size={ 20 } strokeWidth={2} />
                }
                color="var(--warning)"
              />
              <StatCard
                label="最长连续"
                value={`${stats.longest_streak}天`}
                icon={
<Award size={ 20 } strokeWidth={2} />
                }
                color="color-mix(in srgb, var(--accent) 50%, var(--success))"
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
              <div className="overflow-x-auto">
                <div
                  className="grid gap-[3px]"
                  style={{
                    gridTemplateRows: "repeat(7, 14px)",
                    gridAutoFlow: "column",
                    gridAutoColumns: "14px",
                    width: "max-content",
                  }}
                >
                  {calendarData.map((day) => (
                    <div
                      key={day.date}
                      className="w-3.5 h-3.5 rounded-[2px] cursor-default transition-transform hover:scale-125"
                      style={{
                        background: HEAT_COLORS[day.level],
                      }}
                      title={
                        day.duration > 0
                          ? `${day.date}: ${formatDuration(day.duration)} · ${formatChars(day.chars)}`
                          : `${day.date}: 无阅读记录`
                      }
                    />
                  ))}
                </div>
              </div>
              <div
                className="flex items-center gap-2 mt-4 text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                <span>少</span>
                {HEAT_COLORS.map((color, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-[2px]"
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
                          <div className="flex-1 progress-bar">
                            <div
                              className="progress-bar-fill"
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
                            {formatDuration(book.total_duration_ms)} · {formatChars(book.total_chars_read)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly report */}
            {weekly && (
              <div
                className="rounded-xl p-6"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <h2 className="text-sm font-semibold mb-4">本周阅读</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: "时长", now: `${fmtHours(weekly.current.duration_ms)}h`, prev: weekly.previous?.duration_ms ?? 0, unit: "h", fmt: (v: number) => fmtHours(v) },
                    { label: "字数", now: formatChars(weekly.current.chars_read), prev: weekly.previous?.chars_read ?? 0, unit: "字", fmt: (v: number) => formatChars(v) },
                    { label: "阅读天数", now: `${weekly.current.days}天`, prev: weekly.previous?.days ?? 0, unit: "天", fmt: (v: number) => `${v}天` },
                    { label: "读完", now: `${weekly.current.books_finished}本`, prev: weekly.previous?.books_finished ?? 0, unit: "本", fmt: (v: number) => `${v}本` },
                    { label: "新划线", now: `${weekly.current.annotations}条`, prev: weekly.previous?.annotations ?? 0, unit: "条", fmt: (v: number) => `${v}条` },
                  ].map((item) => {
                    const diff = weekly.previous
                      ? (item.label === "时长" ? weekly.current.duration_ms - (item.prev as number) : (item.label === "字数" ? weekly.current.chars_read - (item.prev as number) : (item.label === "阅读天数" ? weekly.current.days - (item.prev as number) : (item.label === "读完" ? weekly.current.books_finished - (item.prev as number) : weekly.current.annotations - (item.prev as number)))))
                      : 0;
                    const up = diff > 0;
                    const flat = diff === 0;
                    return (
                      <div
                        key={item.label}
                        className="rounded-lg p-3"
                        style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)" }}
                      >
                        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{item.label}</div>
                        <div className="text-lg font-semibold mt-1 tabular-nums">{item.now}</div>
                        <div className="text-xs mt-0.5 tabular-nums" style={{ color: flat ? "var(--text-tertiary)" : up ? "var(--success)" : "var(--error)" }}>
                          {weekly.previous
                            ? `${up ? "▲" : flat ? "—" : "▼"} ${item.fmt(Math.abs(diff))} vs 上周`
                            : "暂无上周数据"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Achievements */}
            <div
              className="rounded-xl p-6"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-light)",
              }}
            >
              <h2 className="text-sm font-semibold mb-1">成就</h2>
              <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
                累计解锁 {achievements.filter((a) => a.unlocked_at).length}/{achievements.length}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {achievements.map((a) => {
                  const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Lock;
                  const unlocked = !!a.unlocked_at;
                  return (
                    <div
                      key={a.key}
                      className="rounded-lg p-3 flex flex-col items-center gap-2 text-center transition-transform hover:scale-[1.03]"
                      title={unlocked ? `${a.name} · ${a.description}` : `未解锁 · ${a.description}`}
                      style={{
                        background: unlocked ? "var(--accent-soft)" : "var(--bg-primary)",
                        border: `1px solid ${unlocked ? "var(--accent)" : "var(--border-light)"}`,
                        opacity: unlocked ? 1 : 0.55,
                      }}
                    >
                      <Icon size={20} style={{ color: unlocked ? "var(--accent)" : "var(--text-tertiary)" }} />
                      <div className="text-xs font-medium">{a.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
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
        className="w-9 h-9 rounded flex items-center justify-center mb-3"
        style={{
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
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
