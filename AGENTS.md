# AGENTS.md — 一页 (yiyue)

## 项目类型

Tauri 2.0 桌面阅读器。前端 React 19 + TypeScript + Vite 7，后端 Rust + SQLite + FTS5。不是纯前端项目，改动后端 Rust 时需要分别构建和测试两个栈。

## 快速命令

| 操作 | 命令 | 说明 |
|---|---|---|
| 前端开发服务器 | `pnpm dev` | 仅启动 Vite（端口 1420），**不启动 Tauri** |
| 完整开发环境 | `pnpm tauri dev` | Tauri 会先自动执行 `pnpm dev`，再打开桌面窗口 |
| 前端类型检查 | `npx tsc --noEmit` | 在仓库根目录执行（与 `scripts/gate.mjs` 一致），比 `pnpm build` 快 |
| 前端构建 | `pnpm build` | 执行 `tsc && vite build`，输出到 `dist/` |
| Tauri 桌面打包 | `pnpm tauri build` | 需要先完成 `pnpm build`，生成 Windows 安装包 |
| 测试 | `pnpm test` | vitest run，在仓库根目录执行；通过数以实际运行为准（历史快照见 `STATUS.md`） |
| Rust 编译检查 | `cargo check` | 在 `src-tauri/` 执行 |
| Rust 测试 | `cargo test` | 在 `src-tauri/` 目录执行；通过数以实际运行为准（历史快照见 `STATUS.md`） |
| 一键门禁 | `pnpm gate` | 按变更区域自动运行上述检查（`node scripts/gate.mjs --all` 强制全量） |
| 安装门禁钩子 | `pnpm hooks:install` | 将 `.githooks/pre-push` 复制到 `.git/hooks/`，推送前自动跑门禁（`git push --no-verify` 可紧急跳过） |

CI 门禁：`.github/workflows/ci.yml` 在 push/PR 时按变更区域运行前端（tsc + vitest）与后端（cargo check + test）检查，任一失败即 `gate` 汇总作业阻断。

### 数据与状态路径（Windows）

应用数据目录：`%APPDATA%\com.asakii.yiyue\`（Tauri `app_data_dir()`，由 `tauri.conf.json` 的 `identifier` 决定，解析逻辑见 `src-tauri/src/db/mod.rs` 的 `get_db_path`）。

| 路径 | 内容 | 可否删除 |
|---|---|---|
| `data.db` | SQLite 主数据库（16 表 + 3 FTS5 虚拟表：书库/章节/进度/笔记/规则/设置） | 可删=重置全部数据，**必须与 `-wal`/`-shm` 一起删** |
| `data.db-wal` / `data.db-shm` | WAL 日志/共享内存（`PRAGMA journal_mode=WAL`），未合并的写入在 WAL 里 | ⚠️ **不可单独删除**（会丢最近写入），只能与 `data.db` 三件套同进同出 |
| `library\<xx>\<hash>.<ext>` | 导入书籍的源文件副本（按哈希前两位分桶，`commands/import.rs`） | ⚠️ 删除后已导入书籍无法打开正文，需重新导入 |
| `library\comic_cache\` | 漫画解压页面缓存 | ⚠️ 删除后漫画页面无法显示，需重新导入 |
| `%TEMP%\yiyue-uploads\` | 局域网传输的临时上传文件 | 可删 |
| OS 凭据管理器条目 `yiyue-webdav` | WebDAV 密码（`keyring` crate） | 不在数据目录内，删文件不会清除；需在应用同步页清空密码或在 Windows 凭据管理器中删除 |

**安全重置步骤**（重置数据库、修复损坏的库）：

1. 完全关闭应用，确认 `yiyue.exe` 进程已退出（否则文件被占用且 WAL 未合并）
2. 将 `data.db`、`data.db-wal`、`data.db-shm` **三个文件一起**移动到备份目录（缺一不可，单独保留 WAL 会导致数据不一致）；若需保留已导入书籍的源文件，另行备份 `library\`
3. 重新启动应用（`pnpm tauri dev` 或安装版），启动时 `db::init_db` 自动重建空库并重新播种预置规则

**Schema 变更后的重建方式**：`db/schema.rs` 全部使用 `CREATE TABLE IF NOT EXISTS`，每次启动都会执行 `schema::initialize` + `migrate_add_pinyin_columns`（`lib.rs` setup）。因此**新增**表/索引/虚拟表启动即自动补建；但**修改既有表结构**（改列/改约束）不会自动生效——开发环境按上面重置步骤删库重建，需保留用户数据时应在 `schema.rs` 中仿照 `migrate_add_pinyin_columns` 新增幂等的 `migrate_*` 函数并在 `init_db` 中调用。从零建库的正确性可用 `cd src-tauri && cargo test schema` 验证（schema 测试在全新连接上完整初始化）。

## 关键约束

- **规模化约束**：书库设计目标为数千本规模。查询必须：按书/用户维度过滤、分页或限定行数、只 select 所需列；禁止无界全表扫描（如不带 LIMIT 的整表遍历）、N+1 查询模式、把整个表载入内存。批量操作（导入/应用规则/重建索引）须有进度反馈、幂等、可中断恢复。
- **IPC 命令必须成对注册**：新增 Rust 命令后，需同时在 `src-tauri/src/lib.rs` 的 `generate_handler![...]` 中注册，并在 `src-tauri/src/commands/mod.rs` 声明 `pub mod`。漏注册会导致前端 `invoke` 静默失败。
- **CSP 已收紧**：`tauri.conf.json` 中 `style-src` 仅允许 `'self' 'unsafe-inline'`，新增外部 CSS 资源会破坏 CSP。
- **安全基线守护**：`security-baseline.json` 固化了权限清单（`capabilities/default.json`）与 CSP/asset 协议快照，`src/__tests__/security-baseline.test.ts` 在 `pnpm test` 中比对。任何扩权需显式更新基线并在提交说明中记录理由。
- **HTML sanitize**：`Reader.tsx` 对 Markdown 内容使用 `DOMPurify.sanitize()`。`SearchPanel.tsx` 已改用 `DOMPurify.sanitize(html, { ALLOWED_TAGS: ['mark'] })` 清洗搜索摘要。
- **WebDAV 密码已迁入系统凭据**：`settings` 表中不再明文存储密码，改用 `keyring` crate 存入 OS 凭据管理器。修改同步模块时不得在日志或前端代码中暴露密码。
- **`get_book_groups` 已被前端调用**：`BookCard.tsx` 通过 `stores/app.ts` 的 `getBookGroups` action 展示/设置书籍分组。
- **thiserror 迁移中（棘轮守护）**：`error.rs` 已定义 `AppError` 枚举，OPDS 模块率先迁移。新增 Rust 模块时优先使用 `AppResult<T>`，避免继续扩散 `Result<T, String>`。`src-tauri/tests/error_ratchet.rs` 会统计 `src/` 中旧式 `Result<T, String>` 数量并与 `tests/error_ratchet_baseline.json` 基线比对：数量上升即 `cargo test` 失败；完成一批迁移后运行 `UPDATE_ERROR_RATCHET=1 cargo test --test error_ratchet` 下调基线。
- **Reader.tsx 已拆分**：原 1138 行拆分为 `reader/` 子组件（ReaderSettings、ReaderSidebar、ReaderStatusBar、ReaderContent、helpers、constants）+ `hooks/useReaderKeyboard.ts`。Reader.tsx 现为 ~670 行编排层。修改阅读器功能时需注意组件边界。

## 架构要点

### 后端模块（`src-tauri/src/`）
- `commands/`：12 个文件（含 `dict.rs`、`bookmarks.rs`、`opds.rs`），67 个 IPC 命令
- `db/`：SQLite 连接管理 + Schema 初始化（16 表 + 3 个 FTS5 虚拟表）
- `parser/`：格式解析器，TXT 导入时自动调用规则清洗
- `rules/`：规则引擎核心 + 预设规则，启动时自动播种到 DB
- `search/`：jieba-rs 中文分词 + FTS5 索引 + pinyin 转换
- `sync/`：WebDAV 客户端，`reqwest` blocking 模式，密码走 OS keyring
- `opds.rs`：OPDS 1.2 feed 生成 + `tiny_http` HTTP 服务器（`/opds.xml`、`/books/:id`、`/upload`）

### 前端状态（`src/stores/app.ts`）
- 单一 Zustand store，管理书库、阅读、标签、分组、规则、书签等全部状态
- 所有后端调用通过 `invoke("command_name", args)` 发起，类型在 `src/types/index.ts` 定义
- `importBook` action 支持从任意路径导入（含局域网传输上传的临时文件）

### 前端约定
- 颜色一律 `var(--*)` 令牌（含 `--error` / `--success` / `--warning` / `--overlay-bg` / `--type-*` / `--z-*`），禁止硬编码色值
- hover 一律用 CSS 类（`hover-bg` 等），禁止 JS `onMouseEnter` / `onMouseLeave`
- 共享组件优先用 `src/components/ui/`（Button / Input / Switch / PageHeader / Dialog）
- 浮层阴影用 `var(--shadow-*)`，不用 Tailwind 固定阴影类（dark 主题下不可见）
- Tailwind `rounded-*` 已映射 `--radius-*`，直接使用即可

### 路由（`src/App.tsx`）
- `react-router-dom v7`，`BrowserRouter` 在 `main.tsx` 包裹
- `/` 书库、`/reader` 阅读器（自动根据 `currentBook.kind` 切换 Reader/ComicReader）、`/stats` 统计、`/sync` 同步、`/rules` 规则引擎、`/opds` OPDS 服务、`/transfer` 局域网传输
- 全局搜索浮窗 `SearchPanel` 通过 `showSearch` state 控制，不占用路由

## 已完成功能

### Phase 4.1 — 体验补齐
| 功能 | 状态 | 位置 |
|---|---|---|
| 划线词典查询 | ✅ | `HighlightPopover.tsx` + `commands/dict.rs`（Free Dictionary API） |
| "还剩 X 分钟" | ✅ | `Reader.tsx` 状态栏 |
| 翻页动画模式 | ✅ | `Reader.tsx`（none / fade / slide） |
| CBR 漫画支持 | ✅ | `parser/comic.rs` + `unrar` crate |
| 漫画双页模式 | ✅ | `ComicReader.tsx`（D 键切换） |
| 状态栏增强 | ✅ | `Reader.tsx`（章节/字数/剩余时间/进度） |
| 全屏 F11 | ✅ | Reader + ComicReader |
| 阅读设置面板 | ✅ | `reader/ReaderSettings.tsx`（从 Reader.tsx 拆分） |
| 书签功能 | ✅ | Reader 侧边栏 + Ctrl+Shift+B |

### Phase 4.2+ — 后续完成
| 功能 | 状态 | 位置 |
|---|---|---|
| 划线复制 | ✅ | `HighlightPopover.tsx` |
| 划词搜索 | ✅ | `HighlightPopover.tsx` → `SearchPanel.tsx` |
| 笔记颜色统计 | ✅ | `NotePanel.tsx` 顶部显示各颜色数量 |
| 每日阅读目标 | ✅ | `reader/ReaderStatusBar.tsx`，localStorage 持久化 |
| 阅读模式预设 | ✅ | `reader/ReaderSettings.tsx`（舒适/紧凑/护眼/默认） |
| 批量导入进度反馈 | ✅ | `Library.tsx` 导入时显示 current/total |
| 拼音搜索 | ✅ | 后端 `pinyin` crate，`search/mod.rs` 拼音转换，`search.rs` 拼音 LIKE 匹配 |
| TTS 朗读 | ✅ | `reader/ReaderSettings.tsx` + `Reader.tsx`，Web Speech API |
| 漫画 RTL 翻页 | ✅ | `ComicReader.tsx`（R 键切换，双页模式镜像） |
| 漫画缩放/平移 | ✅ | `ComicReader.tsx`（Ctrl+滚轮缩放，鼠标拖拽平移，W/H 快捷键适应宽度/高度） |
| OPDS 服务 | ✅ | `opds.rs` + `commands/opds.rs`，OPDS 1.2 feed + tiny_http 服务器 |
| 局域网传输 | ✅ | `LanTransfer.tsx`，手机扫码上传，复用 OPDS 服务器 /upload 端点 |

## 当前待办（按优先级）

### P0 — 安全加固
- ~~`SearchPanel.tsx` 接入 `DOMPurify`~~ ✅

### P1 — 体验补全
- ~~HighlightPopover 复制/搜索按钮~~ ✅
- ~~Ctrl+G 快速跳转章节~~ ✅（打开侧边栏目录）
- ~~清理 Rust 编译警告~~ ✅（代码审查确认已清理）
- ~~笔记颜色统计~~ ✅
- ~~每日阅读目标~~ ✅
- ~~阅读模式预设~~ ✅
- ~~批量导入进度反馈~~ ✅

### P2 — 功能扩展
- [x] TTS 朗读（Phase 5.1）— `reader/ReaderSettings.tsx` + `Reader.tsx`，Web Speech API
- [x] 漫画 RTL 翻页（Phase 5.2）— `ComicReader.tsx` R 键切换，双页模式镜像
- [x] 漫画缩放/平移（Phase 5.2）— `ComicReader.tsx`（Ctrl+滚轮缩放，鼠标拖拽平移，W/H 快捷键适应宽度/高度）
- [x] OPDS 服务（Phase 5.3）— 后端 `opds.rs` 模块，OPDS 1.2 feed 生成 + 配置管理 + HTTP 服务器（tiny_http）
- [x] 局域网传输（Phase 5.3）— 手机扫码上传文件到书库

### P3 — 质量工程
- [x] 建立最小回归测试集（`src/__tests__/regression.test.ts`）
- [x] 修复 vitest 环境（rollup 原生依赖问题已根治，普通 `pnpm install` 即可），验证方式：仓库根目录运行 `pnpm test`
- [x] Reader.tsx 拆分（1138 行 → 673 行，7 个子组件 + 1 个 hook）
- [ ] 统一错误处理为 `thiserror` 结构化类型（OPDS 已完成示范，继续推进其他模块；已有棘轮 `tests/error_ratchet.rs` 防止旧模式回升）
- [ ] Linux 平台打包测试

## 测试注意事项

- 前端测试使用 `vitest` + `@testing-library/react` + `jsdom`
- `vitest.config.ts` 无 setupFiles，若新增测试需要 jest-dom matcher，需在测试文件顶部手动导入
- rollup 原生模块缺失问题已根治：运行时已钉住（`package.json` 的 `packageManager`/`engines` + `src-tauri/rust-toolchain.toml`），全新 `pnpm install` 无需 `CI=true` 等环境变量变通即可完成，vitest 正常运行
- 前端测试位于各 `__tests__/` 目录：`src/__tests__/regression.test.ts`（搜索 sanitize、阅读预设、导入进度）、`src/__tests__/security-baseline.test.ts`（安全基线比对）、`src/types/__tests__/index.test.ts`、`src/stores/__tests__/app.test.ts`（含 applyRulesToBook 的 contentVersion 断言）、`src/hooks/__tests__/useReaderKeyboard.test.tsx`（输入框守卫）；文件清单与用例数以 `pnpm test`（仓库根目录）输出为准
- Rust 测试覆盖 schema / search / parser / rules 模块，在 `src-tauri/` 目录运行 `cargo test` 验证；用例数以实际运行为准（历史快照见 `STATUS.md`）
- `src-tauri/tests/error_ratchet.rs` 为错误处理迁移棘轮：旧式 `Result<T, String>` 数量上升即失败，下降时提示用 `UPDATE_ERROR_RATCHET=1 cargo test --test error_ratchet` 下调基线（`tests/error_ratchet_baseline.json` 随代码提交）

## 文档参考

- `STATUS.md`：详细的项目状态报告，包含已知问题、IPC 命令清单、数据库 Schema
- `FUTURE.md`：完整路线图，Phase 4.1-6.2 规划
- `TEST_CHECKLIST.md`：端到端测试清单（每项带「最近执行」记录；`pnpm build` 前置运行 `scripts/checklist-remind.mjs` 输出核对提醒；连续多次通过且可自动化的项迁移为回归测试并标 🤖，键盘快捷键组已迁入 `useReaderKeyboard.test.tsx`）
- `README.md`：功能特性、快捷键、路由表
