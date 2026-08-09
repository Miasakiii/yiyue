import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveJumpRatio,
  stashPendingChapterJump,
  takePendingChapterJump,
  PENDING_CHAPTER_JUMP_KEY,
} from "../jump";

describe("resolveJumpRatio", () => {
  it("prefers matchedText over charOffset", () => {
    const text = "一二三四五六七八九十";
    expect(
      resolveJumpRatio(text, { matchedText: "六七", charOffset: 0 }),
    ).toBeCloseTo(5 / 10, 5);
  });

  it("falls back to charOffset when text not found", () => {
    const text = "abcdefghij";
    expect(
      resolveJumpRatio(text, { matchedText: "zzz", charOffset: 5 }),
    ).toBeCloseTo(0.5, 5);
  });

  it("returns null when neither target applies", () => {
    expect(resolveJumpRatio("abc", {})).toBeNull();
    expect(resolveJumpRatio("", { matchedText: "a" })).toBeNull();
  });
});

describe("pending chapter jump storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stashes and consumes for matching chapter", () => {
    stashPendingChapterJump({
      chapterId: "ch1",
      matchedText: "hello",
      charOffset: 3,
    });
    expect(sessionStorage.getItem(PENDING_CHAPTER_JUMP_KEY)).toBeTruthy();
    const taken = takePendingChapterJump("ch1");
    expect(taken).toEqual({
      chapterId: "ch1",
      matchedText: "hello",
      charOffset: 3,
    });
    expect(sessionStorage.getItem(PENDING_CHAPTER_JUMP_KEY)).toBeNull();
  });

  it("keeps stash when chapter does not match yet", () => {
    stashPendingChapterJump({ chapterId: "ch2", matchedText: "x" });
    expect(takePendingChapterJump("ch1")).toBeNull();
    expect(sessionStorage.getItem(PENDING_CHAPTER_JUMP_KEY)).toBeTruthy();
    expect(takePendingChapterJump("ch2")?.matchedText).toBe("x");
  });
});
