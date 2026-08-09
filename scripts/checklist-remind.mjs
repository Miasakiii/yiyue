#!/usr/bin/env node
/**
 * 发布/打包前的 TEST_CHECKLIST.md 核对提醒（不阻断构建）。
 *
 * 解析清单中每项的 `｜ 最近执行：` 记录，输出执行状态摘要：
 *   - 🤖 已自动化项：随 pnpm test / cargo test 执行，无需手动核对
 *   - 已有人工执行记录的项：统计通过/失败与最近日期
 *   - 未执行项：提醒发布前核对
 *
 * 由 `pnpm build`（即 `pnpm tauri build` 的 beforeBuildCommand）自动调用，
 * 也可手动运行：pnpm checklist
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKLIST = path.join(ROOT, "TEST_CHECKLIST.md");

let text;
try {
  text = readFileSync(CHECKLIST, "utf8");
} catch {
  console.warn("[checklist] 未找到 TEST_CHECKLIST.md，跳过核对提醒。");
  process.exit(0);
}

const items = text
  .split("\n")
  .filter((line) => /^- \[[ xX]\] /.test(line.trim()))
  .map((line) => {
    const automated = line.includes("🤖");
    const m = line.match(/｜\s*最近执行：\s*(.+?)\s*$/);
    const record = m ? m[1] : null;
    const executed = record !== null && record !== "未执行";
    const failed = executed && record.includes("❌");
    return { automated, executed, failed, record };
  });

const total = items.length;
const automated = items.filter((i) => i.automated).length;
const manual = items.filter((i) => !i.automated);
const executed = manual.filter((i) => i.executed);
const failedCount = executed.filter((i) => i.failed).length;
const pending = manual.length - executed.length;
const missingRecord = items.filter((i) => i.record === null).length;

console.log("\n[checklist] ===== 发布前测试清单核对提醒（TEST_CHECKLIST.md） =====");
console.log(
  `[checklist] 共 ${total} 项：🤖 已自动化 ${automated} 项（随 pnpm test / cargo test 执行）` +
    ` | 人工已执行 ${executed.length} 项${failedCount > 0 ? `（含 ❌ 失败 ${failedCount} 项）` : ""}` +
    ` | 待人工核对 ${pending} 项`
);
if (missingRecord > 0) {
  console.warn(`[checklist] ⚠ 有 ${missingRecord} 项缺少「最近执行」标注，请按清单头部机制补记。`);
}
if (failedCount > 0) {
  console.warn(`[checklist] ⚠ 存在 ${failedCount} 项最近执行为失败（❌），发布前请优先复核。`);
}
if (pending > 0) {
  console.log(`[checklist] 提醒：发布/打包前请核对上述 ${pending} 项人工用例，并更新每项的「最近执行」记录。`);
} else {
  console.log("[checklist] 所有人工用例均有执行记录。");
}
console.log("[checklist] ================================================\n");
