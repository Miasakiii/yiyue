# 一页

> 本地优先的桌面阅读器 — 翻开一页，沉浸阅读

一款基于 **Tauri 2.0** 的轻量桌面阅读器，支持 TXT、EPUB、PDF、Markdown、CBZ 等格式，提供干净的阅读体验、笔记系统、全文搜索和 WebDAV 同步。

---

## 功能特性

### 多格式阅读
- **TXT** — 自动编码检测 (GBK/UTF-8)、章节智能切分、干扰词过滤
- **EPUB** — 元数据提取、HTML 渲染
- **PDF** — 页码章节、纯 Rust 解析
- **Markdown** — pulldown-cmark 渲染、语法高亮
- **CBZ / 文件夹漫画** — 单页模式 + 条漫/滚动模式

### 笔记系统
- 7 色划线标注（重点、存疑、标记、灵感、引用、感悟、待确认）
- 划线后添加 Markdown 笔记
- 笔记导出：Markdown / HTML / JSON

### 全局搜索
- jieba 中文分词 + SQLite FTS5 全文索引
- 搜索范围：书库 / 正文 / 笔记
- 搜索结果高亮，Ctrl+Shift+F 全局唤起

### 阅读统计
- 阅读时长、字数、连续天数追踪
- 90 天日历热力图
- 书籍阅读排行榜

### WebDAV 同步
- 支持坚果云、Nextcloud、Synology 等标准 WebDAV 服务
- 增量同步：阅读进度、笔记、标签、规则
- Push / Pull / Full Sync 三种模式

### 个性化
- 3 种主题：浅色 / 深色 / 护眼
- 字号调节 (12-36px)，Ctrl+=/- 快捷
- 网格/列表视图切换，多种排序方式

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2.0 |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 状态管理 | Zustand |
| 后端 | Rust (tokio) |
| 数据库 | SQLite (rusqlite) + FTS5 |
| 中文分词 | jieba-rs |
| 依赖 | epub, pdf, pulldown-cmark, reqwest, zip, blake3, chardetng |

---

## 快速开始

### 环境要求

```
Node.js >= 18
Rust >= 1.75
pnpm >= 8
```

### 安装依赖

```bash
pnpm install
```

### 开发运行

```bash
pnpm tauri dev
```

### 构建打包

```bash
pnpm tauri build
```

---

## 项目结构

```
一页/
├── src/                          # React 前端
│   ├── App.tsx                   # 根组件 / 路由
│   ├── stores/app.ts             # Zustand 状态管理
│   ├── components/               # 通用组件
│   │   ├── BookCard.tsx          # 书籍卡片
│   │   ├── HighlightPopover.tsx  # 划线浮窗
│   │   ├── NotePanel.tsx         # 笔记面板
│   │   └── SearchPanel.tsx       # 搜索面板
│   ├── pages/                    # 页面
│   │   ├── Library.tsx           # 书库
│   │   ├── Reader.tsx            # 小说阅读器
│   │   ├── ComicReader.tsx       # 漫画阅读器
│   │   ├── Stats.tsx             # 阅读统计
│   │   └── SyncSettings.tsx      # 同步设置
│   └── types/index.ts            # TypeScript 类型
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── lib.rs                # 入口 (42 个 IPC 命令)
│   │   ├── commands/             # Tauri 命令层
│   │   ├── db/                   # SQLite 数据库
│   │   ├── parser/               # 格式解析器
│   │   ├── rules/                # 规则引擎
│   │   ├── search/               # 搜索引擎
│   │   ├── sync/                 # WebDAV 同步
│   │   ├── models/               # 数据模型
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── PRD.md                        # 产品需求文档
├── STATUS.md                     # 项目状态分析
└── README.md
```

---

## 支持格式

| 格式 | 导入 | 阅读 | 说明 |
|---|---|---|---|
| TXT | ✅ | ✅ | 编码检测 + 章节切分 + 干扰词过滤 |
| EPUB | ✅ | ✅ | 元数据 + HTML 渲染 |
| PDF | ✅ | ✅ | 纯 Rust 解析 |
| Markdown | ✅ | ✅ | pulldown-cmark 渲染 |
| CBZ | ✅ | ✅ | 漫画压缩包 |
| 文件夹漫画 | ✅ | ✅ | 图片目录 |
| CBR | — | — | 计划中 (需 unrar) |
| MOBI/AZW3 | — | — | 计划中 |

---

## 快捷键

| 操作 | 快捷键 |
|---|---|
| 下一章 | `→` / `PageDown` / `Space` |
| 上一章 | `←` / `PageUp` |
| 增大字号 | `Ctrl + =` |
| 缩小字号 | `Ctrl + -` |
| 切换目录 | `Ctrl + B` |
| 切换笔记 | `Ctrl + N` |
| 全局搜索 | `Ctrl + Shift + F` |

---

---

## 许可证

© 2026 asakii
