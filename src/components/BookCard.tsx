import { useAppStore } from "../stores/app";
import type { BookListItem } from "../types";

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
  const { openBook, toggleFavorite } = useAppStore();

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

  if (viewMode === "list") {
    return (
      <div
        className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer group"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-light)",
          transition: "all var(--transition-normal)",
        }}
        onClick={() => openBook(book.id)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-tertiary)";
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-secondary)";
          e.currentTarget.style.borderColor = "var(--border-light)";
          e.currentTarget.style.boxShadow = "none";
        }}
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
          <div
            className="text-xs truncate"
            style={{ color: "var(--text-tertiary)" }}
          >
            {book.author || "未知作者"} · {formatSize(book.file_size)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress indicator */}
          <div className="flex items-center gap-2">
            <div
              className="w-16 h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: progress >= 100 ? "#22c55e" : formatColor,
                }}
              />
            </div>
            <span
              className="text-xs w-10 text-right"
              style={{ color: "var(--text-tertiary)" }}
            >
              {formatProgress(progress)}
            </span>
          </div>

          {/* Favorite button */}
          <button
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: book.starred ? "#f59e0b" : "var(--text-tertiary)" }}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(book.id);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={book.starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden cursor-pointer group"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-light)",
        transition: "all var(--transition-normal)",
      }}
      onClick={() => openBook(book.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "var(--shadow-lg)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = "var(--border-light)";
      }}
    >
      {/* Cover */}
      <div
        className="aspect-[3/4] flex items-center justify-center relative overflow-hidden"
        style={{
          background: `linear-gradient(145deg, ${formatColor}15, ${formatColor}08)`,
        }}
      >
        {book.cover_path ? (
          <img
            src={book.cover_path}
            alt={book.title}
            className="w-full h-full object-cover"
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={formatColor} strokeWidth="1.5">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-md"
              style={{
                background: formatColor,
                color: "white",
                boxShadow: `0 2px 6px ${formatColor}40`,
              }}
            >
              {FORMAT_LABELS[book.format] || book.format.toUpperCase()}
            </span>
          </div>
        )}

        {/* Progress overlay on cover */}
        {progress > 0 && progress < 100 && (
          <div
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{ background: `${formatColor}30` }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background: formatColor,
              }}
            />
          </div>
        )}

        {/* Completed badge */}
        {progress >= 100 && (
          <div
            className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-xs font-medium"
            style={{
              background: "rgba(34, 197, 94, 0.9)",
              color: "white",
              backdropFilter: "blur(4px)",
            }}
          >
            已读完
          </div>
        )}

        {/* Favorite star */}
        {book.starred && (
          <div className="absolute top-2 left-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="font-medium text-sm truncate mb-1 leading-snug">{book.title}</div>
        <div
          className="text-xs truncate mb-2.5"
          style={{ color: "var(--text-tertiary)" }}
        >
          {book.author || "未知作者"}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: progress >= 100 ? "#22c55e" : formatColor,
              }}
            />
          </div>
          <span
            className="text-xs flex-shrink-0"
            style={{ color: "var(--text-tertiary)" }}
          >
            {formatProgress(progress)}
          </span>
        </div>
      </div>
    </div>
  );
}
