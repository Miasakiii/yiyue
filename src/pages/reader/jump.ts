/** Shared chapter-in-page jump for search hits and note annotations. */

export const PENDING_CHAPTER_JUMP_KEY = "yiyue.pendingChapterJump";
/** @deprecated read once for migration from older search jumps */
const LEGACY_PENDING_SEARCH_JUMP_KEY = "yiyue.pendingSearchJump";

export type ChapterJumpTarget = {
  chapterId: string;
  /** Prefer locating by exact/near text when available (search & highlights). */
  matchedText?: string | null;
  /** Fallback: character offset within chapter plain text. */
  charOffset?: number | null;
};

/** Resolve 0–1 scroll ratio from article plain text + jump target. */
export function resolveJumpRatio(
  text: string,
  opts: { matchedText?: string | null; charOffset?: number | null },
): number | null {
  if (!text) return null;
  const needle = (opts.matchedText || "").trim();
  if (needle) {
    const idx = text.indexOf(needle);
    if (idx >= 0) return Math.min(idx / text.length, 1);
  }
  if (opts.charOffset != null && opts.charOffset >= 0) {
    return Math.min(opts.charOffset / text.length, 1);
  }
  return null;
}

/** Apply jump to a scrollable reader content element (scroll or columns). */
export function scrollContentToJump(
  el: HTMLElement,
  opts: {
    matchedText?: string | null;
    charOffset?: number | null;
    columns: boolean;
  },
): boolean {
  const article = el.querySelector("article");
  const text = article?.textContent || "";
  const ratio = resolveJumpRatio(text, opts);
  if (ratio == null) return false;
  const max = opts.columns
    ? el.scrollWidth - el.clientWidth
    : el.scrollHeight - el.clientHeight;
  if (max <= 0) return false;
  if (opts.columns) el.scrollLeft = ratio * max;
  else el.scrollTop = ratio * max;
  return true;
}

export function stashPendingChapterJump(target: ChapterJumpTarget): void {
  sessionStorage.setItem(PENDING_CHAPTER_JUMP_KEY, JSON.stringify(target));
  sessionStorage.removeItem(LEGACY_PENDING_SEARCH_JUMP_KEY);
}

/**
 * Read pending jump for `expectedChapterId`.
 * - Wrong chapter: leave stash, return null (caller waits for chapter load).
 * - Match / no chapter filter: consume and return.
 */
export function takePendingChapterJump(
  expectedChapterId?: string | null,
): ChapterJumpTarget | null {
  let raw = sessionStorage.getItem(PENDING_CHAPTER_JUMP_KEY);
  if (!raw) {
    raw = sessionStorage.getItem(LEGACY_PENDING_SEARCH_JUMP_KEY);
    if (raw) {
      sessionStorage.removeItem(LEGACY_PENDING_SEARCH_JUMP_KEY);
      // Migrate shape: { chapterId, matchedText }
      try {
        const legacy = JSON.parse(raw) as ChapterJumpTarget;
        sessionStorage.setItem(PENDING_CHAPTER_JUMP_KEY, JSON.stringify(legacy));
        raw = sessionStorage.getItem(PENDING_CHAPTER_JUMP_KEY);
      } catch {
        return null;
      }
    }
  }
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as ChapterJumpTarget;
    if (
      pending.chapterId &&
      expectedChapterId &&
      pending.chapterId !== expectedChapterId
    ) {
      return null;
    }
    sessionStorage.removeItem(PENDING_CHAPTER_JUMP_KEY);
    return pending;
  } catch {
    sessionStorage.removeItem(PENDING_CHAPTER_JUMP_KEY);
    return null;
  }
}
