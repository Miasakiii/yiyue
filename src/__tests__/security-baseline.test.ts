import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 安全基线守护：固化权限清单与 CSP 快照，任何扩权差异必须显式更新
// security-baseline.json，并在提交说明中记录理由。

const read = (rel: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8"));

const baseline = read("../../security-baseline.json");
const capability = read("../../src-tauri/capabilities/default.json");
const tauriConf = read("../../src-tauri/tauri.conf.json");

/** 将 CSP 字符串解析为 { 指令: 排序后的值列表 } */
function parseCsp(csp: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...values] = tokens;
    directives[name] = values.sort();
  }
  return directives;
}

const UPDATE_HINT =
  "如属有意变更，请更新 security-baseline.json 并在提交说明中记录理由。";

describe("安全基线守护（security-baseline.json）", () => {
  it("capability 权限清单与基线一致（无扩权/缺失）", () => {
    const current: string[] = [...capability.permissions].sort();
    const expected: string[] = [...baseline.capability.permissions].sort();

    const added = current.filter((p) => !expected.includes(p));
    const removed = expected.filter((p) => !current.includes(p));

    expect(added, `检测到新增权限（扩权）: ${added.join(", ")}。${UPDATE_HINT}`).toEqual([]);
    expect(removed, `检测到权限被移除: ${removed.join(", ")}。${UPDATE_HINT}`).toEqual([]);
  });

  it("capability 作用窗口与标识与基线一致", () => {
    expect(capability.identifier, UPDATE_HINT).toBe(baseline.capability.identifier);
    expect([...capability.windows].sort(), UPDATE_HINT).toEqual(
      [...baseline.capability.windows].sort()
    );
  });

  it("CSP 指令与基线一致（无放宽/新增来源）", () => {
    const current = parseCsp(tauriConf.app.security.csp);
    const expected: Record<string, string[]> = Object.fromEntries(
      Object.entries(baseline.csp as Record<string, string[]>).map(([k, v]) => [
        k,
        [...v].sort(),
      ])
    );

    const addedDirectives = Object.keys(current).filter((d) => !(d in expected));
    const removedDirectives = Object.keys(expected).filter((d) => !(d in current));
    expect(
      addedDirectives,
      `检测到新增 CSP 指令: ${addedDirectives.join(", ")}。${UPDATE_HINT}`
    ).toEqual([]);
    expect(
      removedDirectives,
      `检测到 CSP 指令被移除: ${removedDirectives.join(", ")}。${UPDATE_HINT}`
    ).toEqual([]);

    for (const [directive, values] of Object.entries(expected)) {
      expect(
        current[directive],
        `CSP 指令 ${directive} 的来源列表与基线不一致。${UPDATE_HINT}`
      ).toEqual(values);
    }
  });

  it("asset 协议范围与基线一致", () => {
    expect(tauriConf.app.security.assetProtocol, UPDATE_HINT).toEqual(
      baseline.assetProtocol
    );
  });
});
