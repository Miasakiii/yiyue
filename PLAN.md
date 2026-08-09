# 一页 (yiyue) — 推进规划

> 更新日期：2026-08-09
> 定位：**当前时点的可执行改进清单**，与 `FUTURE.md`（宏观路线图，多为已完成）互补。
> 每项标注来源：📋 STATUS 遗留 / 🔧 代码库现状 / 📚 BookOrbit 借鉴（详见 `docs/bookorbit-research.md`）/ 🗺 FUTURE 路线图未完成项。

---

## 0. 当前状态快照（2026-08-09）

- 代码量：前端 ~6,700 行（40 文件）+ 后端 ~6,600 行（31 文件），67 个 IPC 命令
- 最近提交（7-28 前后）：一批高质量 fix（热力图本地时区、store 状态单一来源、模态键盘契约、划线偏移、无边框标题栏）
- 测试：前端 5 文件 + 后端 29 用例 + 2 质量棘轮（error_ratchet / ipc_registration）
- **工作区不干净**：`AGENTS.md`、`package.json`、`useReaderKeyboard.test.tsx` 已修改未提交；`scripts/checklist-remind.mjs`、`.qoder/` 未跟踪；根目录有 `gate-full-output.log`、`node_modules.bak` 疑似杂项

---

## 1. P0 — 收尾与清理（✅ 已完成 2026-08-09）

| # | 事项 | 来源 | 说明 | 验收 |
|---|---|---|---|---|
| 1.1 | ~~提交工作区未提交改动~~ | 🔧 | 分 4 个提交完成：忽略规则、checklist 构建前置+快捷键回归、AGENTS 数据路径、PLAN/调研文档（66aebbe） | ✅ `git status` 干净 |
| 1.2 | ~~处理杂项文件~~ | 🔧 | `gate-full-output.log` 已被 `*.log` 忽略；`node_modules.bak` 已删除；`.qoder/` 已加入 `.gitignore` | ✅ 仓库根目录整洁 |
| 1.3 | ~~合并 dependabot 分支~~ | 🔧 | vite-7.3.5 早已合入（无需处理）；serde_with-3.21.0 已 cherry-pick（dd5aa04），cargo check/test 全过 | ✅ 无残留 dependabot 分支 |
| 1.4 | ~~更新 STATUS.md 快照~~ | 📋 | 更新至 2026-08-09：测试 42/42（6 文件）+ 32/32（Rust）；热力图时区标已修复；72 处 Result 待迁移；测试文件数修正 | ✅ STATUS 与当前代码一致 |

---

## 2. P1 — 质量工程（✅ 除 2.1 外已完成 2026-08-09）

| # | 事项 | 来源 | 说明 | 预估 | 验收 |
|---|---|---|---|---|---|
| 2.1 | **TEST_CHECKLIST 端到端回归** | 📋 | 116 项 UI 人工回归，**需人工真机执行**（agent 无法代跑）；键盘快捷键组已迁移自动化（7-28）；词典/WebDAV 相关由 2.3/2.4 自动化覆盖 | 2-3 天（人工） | 清单全勾选 |
| 2.2 | ~~thiserror 迁移收尾~~ | 📋 | ✅ ee891ef：72 处全部清零，基线更新为 `{}`；AppError 新增 Sqlite/Parser/Json 变体、Io 改 `#[from]`；cargo test 32/32 通过 | — | 棘轮基线 `{}` |
| 2.3 | ~~中文词典源替换~~ | 📋 | ✅ e424372：中文走萌典 API（moedict.tw，开源无 key，拼音+释义），英文保持 Free Dictionary；实测可达 | 1-2 天 | 中文词可返回释义 |
| 2.4 | ~~WebDAV 实测~~ | 📋 | ✅ 8898a78：本地 wsgidav 联调 4/4 通过（往返/幂等/缺失文件/HTTP 守卫），`tests/webdav_live.rs` 默认 ignore 保留为回归资产 | 1 天 | 三模式跑通（mkdir/put/get） |
| 2.5 | ~~日志格式契约~~ | 📋 | ✅ 4e60fdf：新增 `logging.rs`（start/end/fail + sanitize），import_book 示范接入；契约写入 AGENTS.md | 1 天 | 关键操作路径日志统一 |
| 2.6 | ~~规模化约束写入 AGENTS.md~~ | 📋 | ✅ 已加入「关键约束」首条（禁无界查询/整库载入、批量操作幂等可恢复） | 半天 | AGENTS.md 新增段落 |

---

## 3. P2 — 功能增强（按价值排序）

### 3.1 元数据自动抓取（✅ 已完成 2026-08-09）

| 来源 | 📚 BookOrbit（14 个元数据提供商）· 🗺 5.3 数据互通 |
|---|---|
| 交付 | 7e45e97 + 1c99cf3：`commands/metadata.rs`（Open Library search/works API + covers CDN 封面存 `library/covers/{id}.jpg`）；导入后异步自动触发（默认开启，开关可关，失败静默降级）；SyncSettings「元数据自动抓取」卡片（开关 + 一键补全书库，带进度）；IPC +3（共 70） |
| 备注 | Google Books 匿名配额耗尽（429）改用 Open Library（免费无 key 已验证） |

### 3.2 成就 / 阅读里程碑系统（✅ 已完成 2026-08-09）

| 来源 | 📚 BookOrbit（50+ 成就、Reading DNA）· 🗺 6.1.5 阅读习惯分析 |
|---|---|
| 交付 | 8f5f709：`commands/achievements.rs` 15 个成就（读完/划线/书签/时长/连续天数/字数/藏书/漫画）；`achievements` 表持久化；阅读 session 后自动检查 + Toast 解锁提示；统计页成就网格（解锁/锁定 + 计数）；4 个单元测试；IPC +2（共 72） |
| 备注 | 夜间/晨间时段类成就因 start_time 存 UTC 无法准确判断本地时段，改为字数/session 类成就 |

### 3.3 KOReader / Kobo 双向同步（远期，约 1-2 周）

| 来源 | 📚 BookOrbit 核心卖点 |
|---|---|
| 思路 | ① 一页已有 OPDS + tiny_http 服务器基础，可扩展 KOReader 插件同步端点（进度/划线 JSON）；② Kobo 需解析 `.kobo/KoboReader.sqlite`，复杂度高，排后；③ 与现有 WebDAV 同步并存 |
| 前置 | 先完成 2.1 回归（OPDS 服务器稳定性），再评估是否立项 |

### 3.4 其他可做项（FUTURE 未完成清单）

| # | 事项 | 来源 | 说明 | 预估 |
|---|---|---|---|---|
| 3.4.1 | ~~数据导入/导出（全量）~~ | 🗺 5.3.5 | ✅ eb4158d：14 表 → data.json → ZIP；导入幂等（主键跳过）+ FTS 重建 + 确认 Dialog；Koodo/Calibre 笔记导入因无公开格式规范暂缓；IPC +2（共 80） | — |
| 3.4.2 | ~~ComicInfo.xml 元数据~~ | 🗺 5.2.5 | ✅ b90978d：CBZ 内 ComicRack 标准提取（Writer/Series/Volume/Year/Summary），Writer 优先、Summary 入简介、并入 metadata_json；2 单测 | — |
| 3.4.3 | ~~免费书源接入~~ | 🗺 5.3.6 | ✅ 本轮：古腾堡计划（Gutendex 搜索 + 官方下载 + importBook 导入），/source 页面（更多菜单入口）；书格无 API 放弃；IPC +2（共 78） | — |
| 3.4.4 | **Calibre 桥接** | 🗺 5.3.3 | 检测本地 Calibre，调 `calibredb` CLI 做格式转换/元数据同步 | 2 天 |
| 3.4.5 | **WebDAV 同步范围扩展** | 🗺 5.3.4 | 同步书签、阅读目标；last-write-wins + 本地优先 | 2 天 |
| 3.4.6 | ~~规则包导出/导入~~ | 🗺 4.2.5 | ✅ b90978d：版本化 JSON 导出/导入（预设组跳过、同名组复用）+ Rules 页按钮（save/open 对话框 + Toast）；IPC +4（共 76） | — |

---

## 4. P3 — 架构演进（长期，按需触发）

| # | 事项 | 来源 | 触发条件 | 说明 |
|---|---|---|---|---|
| 4.1 | **SQLite 迁移工具** | 📚 | 下次 schema 结构变更前 | 当前靠 `CREATE TABLE IF NOT EXISTS` + 手写 `migrate_*`；引入 refinery 类工具使迁移可版本化、可回滚 |
| 4.2 | **前端 store 拆分** | 🗺 3.2 | app.ts 超 600 行时 | 单一 Zustand store → library / reader / settings / sync 分片 |
| 4.3 | **虚拟滚动/性能** | 🗺 3.1 | 书库 > 500 本或大章节卡顿时 | 长列表虚拟滚动、漫画 LRU 缓存、冷启动 <1s |
| 4.4 | **数据库连接池** | 🗺 3.2 | 并发读卡顿时 | 单连接 + Mutex → r2d2 连接池，读写分离 |
| 4.5 | **Linux 打包验证** | 📋 | 有 Linux 环境时 | AppImage/deb，GTK/WebKit 兼容性 |
| 4.6 | **i18n** | 🗺 3.3 | 用户群扩大后 | 现为纯中文硬编码；引入 i18n 框架成本高，暂缓 |
| 4.7 | **AI 辅助阅读** | 🗺 6.1 | 本地模型成熟后 | Ollama 摘要、人物关系图谱、翻译辅助 |

---

## 5. 推进策略

1. **顺序**：P0（半天）→ P1（已完成除 2.1）→ P2 按需挑选，每轮只做 1-2 项做透（沿用"渐进增强"原则）
2. **每项完成标准**：代码 + 测试 + STATUS.md/FUTURE.md 勾选更新 + 提交信息标注对应条目号
3. **验证**：每轮结束跑 `pnpm gate`；UI 变更补充 TEST_CHECKLIST 对应项
4. **复盘**：建议每 2-4 周更新一次本文档（勾选完成项、调整优先级），避免像 STATUS.md 一样过期
