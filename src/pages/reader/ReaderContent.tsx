import React, { useMemo } from "react";
import { HighlightPopover } from "../../components/HighlightPopover";
import type { Chapter } from "../../types";

interface ReaderContentProps {
  content: string;
  loading: boolean;
  isMarkdown: boolean;
  sanitizedHtml: string;
  currentChapter: Chapter;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  contentWidth: number;
  textAlign: "left" | "justify";
  paragraphSpacing: number;
  readingMode: "scroll" | "columns";
  animClass: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  bookId: string;
  chapterId: string;
}

export function ReaderContent({
  content, loading, isMarkdown, sanitizedHtml, currentChapter,
  fontSize, lineHeight, fontFamily, contentWidth, textAlign,
  paragraphSpacing, readingMode, animClass, contentRef, onScroll,
  bookId, chapterId,
}: ReaderContentProps) {
  // Plain-text formats (txt/epub): split into paragraphs on blank lines so the
  // --reader-paragraph-spacing rule (article p) applies; single line breaks
  // inside a paragraph stay intact via whitespace-pre-wrap on each <p>.
  const paragraphs = useMemo(
    () => (isMarkdown || !content ? [] : content.split(/\r?\n\s*\r?\n/).filter((p) => p.trim().length > 0)),
    [content, isMarkdown]
  );

  const columnsStyle = readingMode === "columns"
    ? ({
        overflowX: "auto",
        overflowY: "hidden",
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      ref={contentRef}
      className="flex-1 overflow-y-auto relative"
      style={columnsStyle}
      onScroll={onScroll}
    >
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
            <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>加载中…</div>
          </div>
        </div>
      ) : (
        <article
          className={`${readingMode === "columns" ? "px-8 py-12 min-w-max " : "mx-auto px-8 py-12 "}${animClass}`}
          style={{
            fontSize: `${fontSize}px`, lineHeight, fontFamily,
            maxWidth: readingMode === "columns" ? "none" : `${contentWidth}px`,
            textAlign,
            '--reader-paragraph-spacing': `${paragraphSpacing}em`,
            ...(readingMode === "columns"
              ? { columnWidth: `${Math.max(320, Math.min(420, contentWidth))}px`, columnGap: "56px", columnRule: "1px solid var(--border-light)" }
              : {}),
          } as React.CSSProperties}>
          <h2 key={currentChapter.id} className="text-2xl font-semibold mb-8 pb-4 animate-slide-down"
            style={{ borderBottom: "1px solid var(--border-light)", color: "var(--text-primary)" }}>
            {currentChapter.title}
          </h2>
          {isMarkdown ? (
            <div className="markdown-body select-text"
              style={{ color: "var(--text-primary)", letterSpacing: "0.02em" }}
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
          ) : (
            <div className="select-text" style={{ color: "var(--text-primary)", letterSpacing: "0.02em" }}>
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-wrap">{p}</p>
              ))}
            </div>
          )}
        </article>
      )}
      <HighlightPopover bookId={bookId} chapterId={chapterId} />
    </div>
  );
}
