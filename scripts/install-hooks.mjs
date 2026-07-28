#!/usr/bin/env node
/** 将 .githooks/ 下的钩子安装到 .git/hooks/（复制方式，不修改 git config）。 */
import { copyFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(ROOT, ".githooks", "pre-push");
const hooksDir = path.join(ROOT, ".git", "hooks");
const dest = path.join(hooksDir, "pre-push");

if (!existsSync(path.join(ROOT, ".git"))) {
  console.error("[hooks] 未找到 .git 目录，跳过安装。");
  process.exit(0);
}
mkdirSync(hooksDir, { recursive: true });
copyFileSync(src, dest);
try {
  chmodSync(dest, 0o755);
} catch {}
console.log("[hooks] pre-push 门禁钩子已安装到 .git/hooks/pre-push");
