# BookOrbit 调研笔记

> 调研日期：2026-08-09
> 仓库：https://github.com/bookorbit/bookorbit（AGPL-3.0，默认分支 main）
> 用途：竞品参考 — 为一页 (yiyue) 的功能规划与工程实践提供输入

---

## 1. 项目概况

**BookOrbit** 是自托管图书馆 + 阅读平台（Web 应用），可视为现代化 Calibre-Web / Calibre 替代品。

- 创建于 2026-05-09，调研时约 3 个月，**2,055 stars / 154 forks / 238 issues**，日更活跃
- 定位：把书组织起来，在任何地方读回给你（Web 阅读器 / Kobo / KOReader），进度、划线、阅读状态三端互通
- 官网 https://bookorbit.app，有在线 demo 与 Docker 一键部署
- 组织级运营：9 个 GitHub Actions workflow、Crowdin 社区翻译、Scorecard 供应链审计、CODEOWNERS

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 形态 | pnpm monorepo：`server/` + `client/` + `packages/types/`（共享类型单一事实源） |
| 后端 | NestJS 11 + Fastify 5 + PostgreSQL + Drizzle ORM，Socket.IO、JWT + OIDC SSO、Swagger |
| 前端 | Vue 3.5 + Vite 8 + Tailwind 4 + Pinia + Vue Router 5，reka-ui（shadcn 系）、vue-i18n、PWA |
| 阅读内核 | foliate-js（GNOME Books 引擎，直接 vendored）+ embedPDF（PDF 插件化渲染） |
| 部署 | Docker Compose（app + Postgres + migration job），多阶段构建 |

## 3. 功能面（约 50+ 后端模块 / 38 前端 feature）

- **格式**：EPUB / KEPUB / MOBI / AZW3 / AZW / FB2 / PDF / CBZ / CBR / CB7 + 有声书（M4B/MP3/FLAC/OPUS/OGG），Web 端免插件
- **生态同步（核心卖点）**：Kobo 设备 + KOReader 插件 + Web 阅读器三方进度/划线双向同步；另推 Hardcover / Readwise / StoryGraph 状态同步
- **元数据**：14 个提供商（Google Books、Open Library、Amazon、Goodreads、Kobo、Audible、RanobeDB 轻小说、Aladin、Lubimyczytać 等）+ 独立封面源（iTunes、DuckDuckGo、AudiobookCovers）
- **多用户**：细粒度权限 + OIDC（Authentik / Keycloak / Authelia），每用户数据隔离
- **统计成就**：阅读时长、热力图、streaks、年度目标、月度挑战、50+ 成就（5 类）、Reading DNA 画像
- **其他**：多库/扫描规则/格式优先级、Book Dock 自动导入、重复检测、收藏 + 动态筛选（smart scopes）、OPDS、Send-to-Kindle（邮件）、浏览器拖拽上传、KOReader 插件下载、多语言（Crowdin）

## 4. 工程规范亮点（AGENTS.md / CLAUDE.md 极详尽）

1. **规模化硬要求**：按"数万本书/用户"设计；禁止无界查询、整库载入、N+1、前端全量处理；强制分页/批处理/定向字段/索引/有界并发/虚拟滚动；批量任务要可恢复、幂等、有进度
2. **日志契约**：统一 `[event] [phase] key=value` 格式（`[start]`/`[end]`/`[fail]`），固定字段顺序，单行；动态值一律 `sanitizeLogValue()`（防日志注入，对应 CodeQL `js/incomplete-sanitization` 规则）
3. **多用户安全基线**：所有查询强制 userId 过滤；所有权检查抛 `ForbiddenException`；敏感/破坏性操作后端 `@RequirePermission` 门禁，绝不信前端隐藏；Admin UI 按具体权限展示
4. **迁移纪律**：Drizzle schema 分文件；迁移只用 `drizzle-kit generate`，**禁止手写迁移 SQL**
5. **API 契约闭环**：功能完成清单要求前端每个 `api()` 调用都有对应后端路由、DTO 严格 whitelist（多余字段 400）
6. **风格硬规则**：Vue 事件处理器必须裸方法引用（ESLint 拦截）；禁 em dash；禁止 Co-authored-by；pre-commit/pre-push 双 husky 钩子

## 5. 与一页的对比

| 维度 | 一页 (yiyue) | BookOrbit |
|---|---|---|
| 形态 | Tauri 2.0 桌面单机应用 | 自托管 Web 平台（多用户 / SSO） |
| 规模 | ~1.5 万行，个人项目 | ~65MB 仓库，组织级运营 |
| 数据 | SQLite（本地单机） | PostgreSQL（多用户） |
| 阅读 | 自家 Rust 解析器，**中文网文优化**（规则清洗、jieba 分词搜索） | foliate-js + embedPDF，格式广度胜 |
| 同步 | WebDAV 协议 | Kobo / KOReader / Readwise 生态闭环 |
| 亮点 | 网文清洗规则引擎、拼音搜索、漫画双页/RTL/条漫、本地优先 | 三方进度同步、14 元数据源、成就系统、多语言 |
| 许可证 | 私有（© 2026 asakii） | AGPL-3.0 |

**各自优势**：一页在中文网文体验（清洗、分词搜索、排版）与本地隐私上远超 BookOrbit；BookOrbit 在设备生态、元数据自动补全、多用户与社区运营上领先。

## 6. 可借鉴行动项（按优先级）

| # | 行动项 | 说明 | 预估 |
|---|---|---|---|
| 1 | **KOReader / Kobo 进度+划线双向同步** | 一页已有 OPDS 基础，可扩展为同步协议；这是 BookOrbit 核心卖点，一页的 WebDAV 同步可作补充 | 中 |
| 2 | **元数据自动抓取** | 一页导入目前靠文件名；接入 Google Books / 豆瓣等提供商自动补封面、作者、简介 | 中 |
| 3 | **成就/阅读 DNA 系统** | 一页已有统计闭环（时长/热力图/排行榜），加成就徽章成本低、感知度高 | 低 |
| 4 | **日志格式契约** | 把 `[event] [phase] key=value` + sanitize 约定吸收进 Rust 后端的日志输出 | 低 |
| 5 | **迁移纪律升级** | 一页目前靠 `CREATE TABLE IF NOT EXISTS` + 手写 `migrate_*` 函数；可评估引入 SQLite 迁移工具（如 refinery） | 低 |
| 6 | **规模化约束** | 把"禁无界查询/整库载入"写进 AGENTS.md，防书库增长后性能劣化 | 低 |
| 7 | **多语言** | BookOrbit 走 Crowdin 社区翻译；一页如面向中文用户可暂缓 | 暂缓 |

## 7. 附注

- 阅读器内核 foliate-js 为 GPL 系许可（GNOME Books 引擎），若一页要借鉴 Web 端渲染思路需注意许可兼容性；BookOrbit 本体 AGPL-3.0，代码参考时不可直接复制进闭源项目
- BookOrbit 的 Kobo 同步涉及 Kobo 私有格式（`.kobo/KoboReader.sqlite` 等），实现细节在 `server/src/modules/kobo/` 与 `koreader/`，需要时可定向深读
- 调研数据为 2026-08-09 快照，star/issue 数可能随后续变化
