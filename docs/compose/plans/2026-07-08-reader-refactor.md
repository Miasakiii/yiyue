# Reader.tsx 拆分实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/pages/Reader.tsx`（1138 行）拆分为 1 个编排层 + 5 个子组件 + 1 个 hook，每个文件职责单一。

**Architecture:** 按 UI 区域拆分：设置弹窗、工具栏、侧边栏、状态栏、内容渲染各提取为独立组件；键盘快捷键提取为 hook。Reader.tsx 保留状态管理和数据加载逻辑，变成 ~250 行的编排层。

**Tech Stack:** React 19 + TypeScript + Zustand + Tauri IPC

## Global Constraints

- TypeScript 类型检查 `npx tsc --noEmit` 必须通过
- 前端测试 `pnpm test` 必须 14/14 通过
- 保持现有功能完整：翻页、设置、TTS、书签、笔记、搜索、快捷键
- 使用现有 CSS 变量（`var(--accent)` 等），不引入新样式
- 所有新组件放在 `src/pages/reader/` 目录

---

## Task 1: 提取常量和类型

**Covers:** [S2, S5]

**Files:**
- Create: `src/pages/reader/constants.ts`

**Interfaces:**
- Produces: `Preset` interface, `PRESETS`, `FONT_FAMILIES`, `LINE_HEIGHT_PRESETS`, `CONTENT_WIDTH_PRESETS` constants

- [ ] **Step 1: 创建 constants.ts，从 Reader.tsx 提取常量**

```typescript
// src/pages/reader/constants.ts

export const FONT_FAMILIES = [
  { key: "default", label: "Sans", value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { key: "serif", label: "Serif", value: "Georgia, 'Noto Serif SC', 'Source Han Serif SC', serif" },
  { key: "mono", label: "Mono", value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
] as const;

export const LINE_HEIGHT_PRESETS = [1.4, 1.6, 1.8, 2.0, 2.4] as const;

export const CONTENT_WIDTH_PRESETS = [
  { key: "narrow", label: "窄", value: 480 },
  { key: "medium", label: "中", value: 640 },
  { key: "wide", label: "宽", value: 768 },
  { key: "full", label: "全", value: 960 },
] as const;

export interface Preset {
  key: string;
  label: string;
  font_size: number;
  line_height: number;
  font_family: string;
  content_width: string;
  paragraph_spacing: number;
  text_align: "left" | "justify";
  page_animation: string;
}

export const PRESETS: Preset[] = [
  { key: "comfort", label: "舒适", font_size: 20, line_height: 2.0, font_family: "serif", content_width: "wide", paragraph_spacing: 1.0, text_align: "left", page_animation: "fade" },
  { key: "compact", label: "紧凑", font_size: 14, line_height: 1.4, font_family: "default", content_width: "narrow", paragraph_spacing: 0.4, text_align: "left", page_animation: "none" },
  { key: "sepia-preset", label: "护眼", font_size: 22, line_height: 2.0, font_family: "serif", content_width: "medium", paragraph_spacing: 1.0, text_align: "left", page_animation: "fade" },
  { key: "default-preset", label: "默认", font_size: 18, line_height: 1.8, font_family: "default", content_width: "medium", paragraph_spacing: 0.8, text_align: "left", page_animation: "none" },
];
```

- [ ] **Step 2: 更新 Reader.tsx 导入，删除内联常量**

将 Reader.tsx 顶部的常量定义（第 13-47 行）替换为：
```typescript
import { FONT_FAMILIES, LINE_HEIGHT_PRESETS, CONTENT_WIDTH_PRESETS, PRESETS, type Preset } from "./reader/constants";
```

删除 Reader.tsx 中原来的 `FONT_FAMILIES`、`LINE_HEIGHT_PRESETS`、`CONTENT_WIDTH_PRESETS`、`Preset` interface、`PRESETS` 定义（第 13-47 行）。

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/reader/constants.ts src/pages/Reader.tsx
git commit -m "refactor: extract reader constants to reader/constants.ts"
```

---

## Task 2: 提取 useReaderKeyboard hook

**Covers:** [S3]

**Files:**
- Create: `src/hooks/useReaderKeyboard.ts`
- Modify: `src/pages/Reader.tsx:420-476`（删除内联键盘逻辑）

**Interfaces:**
- Consumes: `currentChapter`, `chapters`, `loadChapter`, `setFontSize`, `setShowSidebar`, `setShowNotes`, `setSettingsOpen`, `settingsOpen`, `showNotes`, `showSidebar`, `toggleFullscreen`, `handleAddBookmark`, `currentBook`
- Produces: `useReaderKeyboard(opts)` void hook

- [ ] **Step 1: 创建 useReaderKeyboard.ts**

```typescript
// src/hooks/useReaderKeyboard.ts
import { useEffect } from "react";
import { useAppStore } from "../stores/app";
import { showToast } from "../components/Toast";
import type { Chapter, Bookmark } from "../types";

interface UseReaderKeyboardOpts {
  currentChapter: Chapter | null;
  chapters: Chapter[];
  loadChapter: (id: string) => void;
  setFontSize: (fn: (n: number) => number) => void;
  setShowSidebar: (fn: (v: boolean) => boolean) => void;
  setShowNotes: (fn: (v: boolean) => boolean) => void;
  setSettingsOpen: (fn: (v: boolean) => boolean) => void;
  settingsOpen: boolean;
  showNotes: boolean;
  showSidebar: boolean;
  toggleFullscreen: () => void;
  handleAddBookmark: () => void;
  currentBook: { id: string } | null;
}

export function useReaderKeyboard({
  currentChapter, chapters, loadChapter, setFontSize,
  setShowSidebar, setShowNotes, setSettingsOpen,
  settingsOpen, showNotes, showSidebar,
  toggleFullscreen, handleAddBookmark, currentBook,
}: UseReaderKeyboardOpts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentChapter) return;
      const chapterIndex = chapters.findIndex((c) => c.id === currentChapter.id);
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (chapterIndex < chapters.length - 1) loadChapter(chapters[chapterIndex + 1].id);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (chapterIndex > 0) loadChapter(chapters[chapterIndex - 1].id);
      } else if (e.key === "=" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setFontSize((s) => Math.min(s + 2, 36));
      } else if (e.key === "-" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setFontSize((s) => Math.max(s - 2, 12));
      } else if ((e.key === "b" || e.key === "B") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          handleAddBookmark();
        } else {
          setShowSidebar((s) => !s);
        }
      } else if (e.key === "n" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowNotes((s) => !s);
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (currentBook) {
          useAppStore.getState().toggleFavorite(currentBook.id);
          showToast("已切换收藏状态", "success");
        }
      } else if (e.key === "g" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowSidebar(true);
      } else if (e.key === "f" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("open-search"));
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (settingsOpen) setSettingsOpen(false);
        else if (showNotes) setShowNotes(false);
        else if (showSidebar) setShowSidebar(false);
      } else if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentChapter, chapters, toggleFullscreen, settingsOpen, showNotes, showSidebar, currentBook, handleAddBookmark, loadChapter, setFontSize, setShowSidebar, setShowNotes, setSettingsOpen]);
}
```

- [ ] **Step 2: 更新 Reader.tsx，替换内联键盘逻辑为 hook 调用**

在 Reader.tsx 中删除第 420-476 行的 `useEffect(() => { const handleKeyDown = ...` 块，替换为：

```typescript
import { useReaderKeyboard } from "../hooks/useReaderKeyboard";

// 在组件内：
useReaderKeyboard({
  currentChapter, chapters, loadChapter, setFontSize,
  setShowSidebar, setShowNotes, setSettingsOpen,
  settingsOpen, showNotes, showSidebar,
  toggleFullscreen, handleAddBookmark, currentBook,
});
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useReaderKeyboard.ts src/pages/Reader.tsx
git commit -m "refactor: extract keyboard shortcuts to useReaderKeyboard hook"
```

---

## Task 3: 提取 ReaderSettings 组件

**Covers:** [S3]

**Files:**
- Create: `src/pages/reader/ReaderSettings.tsx`
- Modify: `src/pages/Reader.tsx:702-916`（替换内联设置弹窗 JSX）

**Interfaces:**
- Consumes: 所有阅读设置 state + setter、theme、activePreset、applyPreset、setActivePreset、TTS 相关 state/callbacks
- Produces: `<ReaderSettings>` 组件（绝对定位弹窗）

- [ ] **Step 1: 创建 ReaderSettings.tsx**

将 Reader.tsx 中第 702-916 行（settings popover 部分）提取为独立组件。包含：
- 预设按钮行
- 字号滑块
- 行高选择
- 宽度选择
- 段距滑块
- 对齐选择
- 字体选择
- 主题选择
- 翻页动画选择
- TTS 控制（速度滑块 + 播放/暂停/停止按钮）

需要将 `ToolbarBtn`、`Divider`、`SettingRow` 三个 helper 移入 `reader/` 目录（创建 `reader/helpers.tsx`）。

```typescript
// src/pages/reader/helpers.tsx
import React from "react";

export function ToolbarBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button className={`px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5 hover-bg`}
      style={{ color: active ? "var(--accent)" : "var(--text-secondary)", background: active ? "var(--accent-soft)" : "transparent" }}
      onClick={onClick}
      title={title}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
      {title}
    </button>
  );
}

export function Divider() {
  return <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />;
}

export function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
```

ReaderSettings.tsx 的 props 和实现见设计文档 [S3]。

- [ ] **Step 2: 更新 Reader.tsx，用 ReaderSettings 替换内联 JSX**

删除 Reader.tsx 中 settings popover 的 JSX（约 200 行），替换为：
```typescript
import { ReaderSettings } from "./reader/ReaderSettings";

// 在工具栏的 settings ref 位置：
<ReaderSettings
  fontSize={fontSize} setFontSize={setFontSize}
  lineHeight={lineHeight} setLineHeight={setLineHeight}
  fontFamilyKey={fontFamilyKey} setFontFamilyKey={setFontFamilyKey}
  contentWidthKey={contentWidthKey} setContentWidthKey={setContentWidthKey}
  paragraphSpacing={paragraphSpacing} setParagraphSpacing={setParagraphSpacing}
  textAlign={textAlign} setTextAlign={setTextAlign}
  pageAnimation={pageAnimation} setPageAnimation={setPageAnimation}
  theme={theme} setTheme={setTheme}
  activePreset={activePreset} applyPreset={applyPreset}
  setActivePreset={setActivePreset}
  isSpeaking={isSpeaking} isPaused={isPaused}
  startTts={startTts} pauseTts={pauseTts} resumeTts={resumeTts} stopTts={stopTts}
  ttsRate={ttsRate} setTtsRate={setTtsRate}
/>
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/reader/ReaderSettings.tsx src/pages/reader/helpers.tsx src/pages/Reader.tsx
git commit -m "refactor: extract ReaderSettings component and shared helpers"
```

---

## Task 4: 提取 ReaderSidebar 组件

**Covers:** [S3]

**Files:**
- Create: `src/pages/reader/ReaderSidebar.tsx`
- Modify: `src/pages/Reader.tsx:552-641`

**Interfaces:**
- Consumes: `chapters`, `currentChapter`, `goToChapter`, `bookmarks`, `addBookmark`, `deleteBookmark`, `jumpToBookmark`
- Produces: `<ReaderSidebar>` 组件

- [ ] **Step 1: 创建 ReaderSidebar.tsx**

```typescript
// src/pages/reader/ReaderSidebar.tsx
import React, { useRef } from "react";
import type { Chapter, Bookmark } from "../../types";

interface ReaderSidebarProps {
  chapters: Chapter[];
  currentChapter: Chapter;
  goToChapter: (id: string) => void;
  bookmarks: Bookmark[];
  addBookmark: () => void;
  deleteBookmark: (id: string) => void;
  jumpToBookmark: (bm: Bookmark) => void;
}

export function ReaderSidebar({
  chapters, currentChapter, goToChapter,
  bookmarks, addBookmark, deleteBookmark, jumpToBookmark,
}: ReaderSidebarProps) {
  const chapterIndex = chapters.findIndex((c) => c.id === currentChapter.id);
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col overflow-hidden animate-slide-right"
      style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-sm font-semibold">目录</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          {chapterIndex + 1} / {chapters.length}
        </span>
      </div>

      {/* Chapter list */}
      <div className="flex-1 overflow-y-auto py-2" ref={(el) => {
        if (el && currentChapter) {
          const current = el.querySelector(`[data-chapter-id="${currentChapter.id}"]`);
          if (current) current.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }}>
        {chapters.map((ch, i) => (
          <button key={ch.id} data-chapter-id={ch.id}
            className={`w-full text-left px-5 py-2.5 text-sm sidebar-item ${ch.id === currentChapter.id ? 'active' : ''}`}
            onClick={() => goToChapter(ch.id)}
          >
            <span className="mr-2 text-xs tabular-nums" style={{ color: "var(--text-tertiary)", minWidth: 24, display: "inline-block" }}>{i + 1}</span>
            {ch.title || `第 ${i + 1} 章`}
          </button>
        ))}
      </div>

      {/* Bookmarks */}
      <div className="flex-shrink-0 flex flex-col" style={{ borderTop: "1px solid var(--border)", maxHeight: 220 }}>
        <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-light)" }}>
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            书签 ({bookmarks.length})
          </span>
          <button
            className="p-1 rounded-lg flex items-center justify-center"
            style={{ color: "var(--text-tertiary)" }}
            onClick={addBookmark}
            title="添加书签 (Ctrl+Shift+B)"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-tertiary)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {bookmarks.length === 0 ? (
            <div className="px-5 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              暂无书签，按 Ctrl+Shift+B 添加
            </div>
          ) : (
            bookmarks.map((bm) => {
              const ch = chapters.find((c) => c.id === bm.chapter_id);
              const chIdx = ch ? chapters.indexOf(ch) + 1 : 0;
              return (
                <div key={bm.id} className="group flex items-center gap-1 px-2 hover:bg-[var(--bg-tertiary)]">
                  <button
                    className="flex-1 text-left px-3 py-2 text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => jumpToBookmark(bm)}
                    title={bm.title || undefined}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "inline-block", marginRight: 6, color: "var(--accent)", verticalAlign: -1 }}>
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {bm.title || `${chIdx}. ${ch?.title || "未知章节"}`}
                  </button>
                  <button
                    className="p-1 rounded opacity-0 group-hover:opacity-100 flex-shrink-0"
                    style={{ color: "var(--text-tertiary)" }}
                    onClick={() => deleteBookmark(bm.id)}
                    title="删除书签"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: 更新 Reader.tsx，用 ReaderSidebar 替换内联 JSX**

删除 Reader.tsx 中 sidebar 的 JSX（约 90 行），替换为：
```typescript
import { ReaderSidebar } from "./reader/ReaderSidebar";

<ReaderSidebar
  chapters={chapters}
  currentChapter={currentChapter}
  goToChapter={goToChapter}
  bookmarks={bookmarks}
  addBookmark={handleAddBookmark}
  deleteBookmark={deleteBookmark}
  jumpToBookmark={handleJumpToBookmark}
/>
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/reader/ReaderSidebar.tsx src/pages/Reader.tsx
git commit -m "refactor: extract ReaderSidebar component"
```

---

## Task 5: 提取 ReaderStatusBar 组件

**Covers:** [S3]

**Files:**
- Create: `src/pages/reader/ReaderStatusBar.tsx`
- Modify: `src/pages/Reader.tsx:1026-1103`

**Interfaces:**
- Consumes: `chapterIndex`, `chapters`, `currentChapter`, `currentBook`, `progress`, `charsPerMinute`, `dailyGoal`, `setDailyGoal`, `todayStats`, `progressPct`
- Produces: `<ReaderStatusBar>` 组件

- [ ] **Step 1: 创建 ReaderStatusBar.tsx**

将 Reader.tsx 中第 1026-1103 行（status bar footer 部分）提取为独立组件。包含：
- 章节信息（第 X/Y 章 + 标题）
- 剩余时间估算
- 每日阅读目标（含编辑模式）
- 总字数
- 进度条 + 百分比

需要 `formatChars` helper 函数（从 Reader.tsx 第 77-80 行提取）。

- [ ] **Step 2: 更新 Reader.tsx，用 ReaderStatusBar 替换内联 JSX**

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/reader/ReaderStatusBar.tsx src/pages/Reader.tsx
git commit -m "refactor: extract ReaderStatusBar component"
```

---

## Task 6: 提取 ReaderContent 组件

**Covers:** [S3]

**Files:**
- Create: `src/pages/reader/ReaderContent.tsx`
- Modify: `src/pages/Reader.tsx:947-980`

**Interfaces:**
- Consumes: `content`, `loading`, `isMarkdown`, `sanitizedHtml`, `currentChapter`, 排版设置, `animClass`, `contentRef`, `onScroll`, `bookId`, `chapterId`
- Produces: `<ReaderContent>` 组件

- [ ] **Step 1: 创建 ReaderContent.tsx**

将 Reader.tsx 中第 947-980 行（content area）提取为独立组件。包含：
- Loading spinner
- Article 渲染（Markdown HTML / 纯文本）
- HighlightPopover

- [ ] **Step 2: 更新 Reader.tsx，用 ReaderContent 替换内联 JSX**

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/reader/ReaderContent.tsx src/pages/Reader.tsx
git commit -m "refactor: extract ReaderContent component"
```

---

## Task 7: 清理 Reader.tsx + 最终验证

**Covers:** [S2, S6]

**Files:**
- Modify: `src/pages/Reader.tsx`（最终清理）

**Interfaces:**
- Consumes: 所有子组件
- Produces: 清理后的 Reader.tsx (~250 行)

- [ ] **Step 1: 清理 Reader.tsx 中不再需要的 import**

删除已移到子组件中的 import（如 DOMPurify 如果只在 ReaderContent 中使用）。
确保所有子组件的 import 正确。

- [ ] **Step 2: 删除 Reader.tsx 底部的 helper 函数**

删除 `ToolbarBtn`、`Divider`、`SettingRow`（已移到 `reader/helpers.tsx`）。

- [ ] **Step 3: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 运行前端测试**

Run: `pnpm test`
Expected: 14/14 通过

- [ ] **Step 5: 最终确认 Reader.tsx 行数**

确认 Reader.tsx 约 250 行左右。

- [ ] **Step 6: Commit**

```bash
git add src/pages/Reader.tsx
git commit -m "refactor: clean up Reader.tsx after component extraction"
```

---

## Self-Review

1. **Spec coverage:** [S1] 目标 → Task 7 最终验证；[S2] 文件结构 → Task 1 创建目录+constants；[S3] Props 设计 → Tasks 3-6 各组件；[S4] Reader 职责 → Task 7 清理；[S5] 不变项 → Task 1 helpers；[S6] 验证 → Tasks 3-7 每步验证
2. **Placeholder scan:** 无 TBD/TODO
3. **Type consistency:** 所有组件 Props 接口在 Task 3 设计，Tasks 4-6 与之一致
