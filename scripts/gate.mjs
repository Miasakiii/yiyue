#!/usr/bin/env node
/**
 * 最小验收门禁：按变更区域运行检查，任一失败即以非零退出码阻断。
 *
 * 变更区域 → 检查项：
 *   前端（src/、index.html、package.json、tsconfig*、vite/vitest 配置）
 *     → npx tsc --noEmit && pnpm test
 *   后端（src-tauri/，图标与生成物除外）
 *     → cargo check && cargo test（在 src-tauri/ 执行）
 *
 * 用法：
 *   node scripts/gate.mjs             # 本地：检测未提交改动 + 领先上游的提交
 *   node scripts/gate.mjs --all       # 强制运行全部检查
 *   node scripts/gate.mjs --pre-push  # pre-push hook：从 stdin 读取推送范围
 *   node scripts/gate.mjs --ci        # CI：从 GATE_BASE_REF / GATE_BEFORE 推断范围
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZERO_SHA = /^0+$/;

const FRONTEND_RE =
  /^(src\/|index\.html$|package\.json$|pnpm-lock\.yaml$|tsconfig[^/]*\.json$|vite\.config\.ts$|vitest\.config\.ts$)/;
const BACKEND_RE = /^src-tauri\/(?!icons\/|gen\/)/;

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function changedFiles() {
  const mode = process.argv[2] ?? "";
  if (mode === "--all") return null; // null = 运行全部

  const files = new Set();
  const addDiff = (range) => {
    const out = git("diff", "--name-only", ...range);
    if (out === null) return false;
    out.split("\n").filter(Boolean).forEach((f) => files.add(f));
    return true;
  };

  if (mode === "--pre-push") {
    // stdin 每行：<local_ref> <local_sha> <remote_ref> <remote_sha>
    let stdin = "";
    try {
      stdin = readFileSync(0, "utf8");
    } catch {}
    const lines = stdin.split("\n").filter(Boolean);
    if (lines.length === 0) return []; // 无待推送内容
    for (const line of lines) {
      const [, localSha, , remoteSha] = line.split(/\s+/);
      if (!localSha || ZERO_SHA.test(localSha)) continue; // 删除远程分支
      if (!remoteSha || ZERO_SHA.test(remoteSha)) return null; // 新分支：全量
      if (!addDiff([`${remoteSha}..${localSha}`])) return null;
    }
    return [...files];
  }

  if (mode === "--ci") {
    const baseRef = process.env.GATE_BASE_REF;
    const before = process.env.GATE_BEFORE;
    if (baseRef) {
      git("fetch", "origin", baseRef, "--depth=1");
      if (addDiff([`origin/${baseRef}...HEAD`])) return [...files];
    }
    if (before && !ZERO_SHA.test(before)) {
      if (addDiff([`${before}..HEAD`])) return [...files];
    }
    return null; // 范围不可解析：全量兜底
  }

  // 默认（本地）：未提交改动 + 未跟踪文件 + 领先上游的提交
  addDiff(["HEAD"]);
  const untracked = git("ls-files", "--others", "--exclude-standard");
  if (untracked) untracked.split("\n").filter(Boolean).forEach((f) => files.add(f));
  const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
  if (upstream) addDiff([`${upstream}..HEAD`]);
  return [...files];
}

function run(label, cmd, args, cwd) {
  console.log(`\n[gate] ${label}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`\n[gate] 失败：${label}（退出码 ${r.status ?? "spawn error"}），推送/合并被阻断。`);
    process.exit(r.status || 1);
  }
}

const files = changedFiles();
const runFrontend = files === null || files.some((f) => FRONTEND_RE.test(f));
const runBackend = files === null || files.some((f) => BACKEND_RE.test(f));

console.log(
  `[gate] 变更区域：${files === null ? "全量" : `${files.length} 个文件`}` +
    ` | 前端检查：${runFrontend ? "运行" : "跳过"} | 后端检查：${runBackend ? "运行" : "跳过"}`
);

if (!runFrontend && !runBackend) {
  console.log("[gate] 无前端/后端代码变更，门禁通过。");
  process.exit(0);
}

if (runFrontend) {
  run("前端类型检查", "npx", ["tsc", "--noEmit"], ROOT);
  run("前端测试", "pnpm", ["test"], ROOT);
}

if (runBackend) {
  const tauriDir = path.join(ROOT, "src-tauri");
  run("后端编译检查", "cargo", ["check"], tauriDir);
  run("后端测试", "cargo", ["test"], tauriDir);
}

console.log("\n[gate] 全部检查通过。");
