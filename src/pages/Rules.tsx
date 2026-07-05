import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/app";
import type { Rule, CreateRule } from "../types";

const SCOPES = [
  { value: "global", label: "全文" },
  { value: "chapter", label: "章节" },
];

export function Rules() {
  const navigate = useNavigate();
  const {
    rules, ruleGroups, rulesLoading,
    loadRules, loadRuleGroups,
    createRule, updateRule, deleteRule,
    createRuleGroup, deleteRuleGroup,
    applyRulesToBook,
  } = useAppStore();

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<CreateRule>({
    name: "",
    pattern: "",
    replacement: "",
    scope: "global",
    is_regex: true,
    priority: 50,
    group_id: null,
    description: null,
  });
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [applyBookId, setApplyBookId] = useState("");
  const [applyMsg, setApplyMsg] = useState("");

  useEffect(() => {
    loadRules();
    loadRuleGroups();
  }, [loadRules, loadRuleGroups]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.pattern) return;
    try {
      if (editingRule) {
        await updateRule(editingRule.id, form);
        setEditingRule(null);
      } else {
        await createRule(form);
      }
      setForm({
        name: "",
        pattern: "",
        replacement: "",
        scope: "global",
        is_regex: true,
        priority: 50,
        group_id: null,
        description: null,
      });
      setShowForm(false);
    } catch {
      // toast handled in store
    }
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      pattern: rule.pattern,
      replacement: rule.replacement,
      scope: rule.scope,
      is_regex: rule.is_regex,
      priority: rule.priority,
      group_id: rule.group_id,
      description: rule.description,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此规则？")) return;
    await deleteRule(id);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    await createRuleGroup(newGroupName.trim());
    setNewGroupName("");
    setShowGroupForm(false);
  };

  const handleApplyToBook = async () => {
    if (!applyBookId.trim()) return;
    setApplyMsg("应用规则中...");
    const count = await applyRulesToBook(applyBookId.trim());
    setApplyMsg(`应用完成，共替换 ${count} 处`);
    setTimeout(() => setApplyMsg(""), 3000);
  };

  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  return (
    <div className="flex h-screen relative" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Sidebar */}
      <aside
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          width: 220,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold">规则分组</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-2">
            <button
              className="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-all"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              全部规则 ({rules.length})
            </button>
          </div>
          {ruleGroups.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-1 group"
              style={{ color: "var(--text-secondary)" }}
            >
              <span className="flex-1 truncate">{group.name}</span>
              {!group.is_preset && (
                <button
                  className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] opacity-0 group-hover:opacity-100"
                  style={{ color: "var(--text-tertiary)" }}
                  onClick={() => {
                    if (confirm(`删除分组「${group.name}」？`)) {
                      deleteRuleGroup(group.id);
                    }
                  }}
                  title="删除分组"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-xs mt-2 flex items-center gap-1.5"
            style={{ color: "var(--text-tertiary)" }}
            onClick={() => setShowGroupForm(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新建分组
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
      <header
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div className="flex items-center gap-3">
          <button
            className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => navigate("/")}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <h1 className="text-lg font-semibold">规则引擎</h1>
        </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
              onClick={() => setShowForm(true)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              新建规则
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Apply to book */}
          <div
            className="rounded-xl p-5 mb-6"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-light)",
            }}
          >
            <h2 className="text-sm font-semibold mb-3">应用到书籍</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="px-3 py-1.5 text-xs rounded-lg outline-none flex-1"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                placeholder="输入书籍 ID"
                value={applyBookId}
                onChange={(e) => setApplyBookId(e.target.value)}
              />
              <button
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: "var(--accent)" }}
                onClick={handleApplyToBook}
              >
                应用规则
              </button>
              {applyMsg && (
                <span className="text-xs" style={{ color: "#22c55e" }}>{applyMsg}</span>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
              对所有启用的规则（含内置预设）应用到指定书籍的全部章节内容。
            </p>
          </div>

          {/* Rules list */}
          {rulesLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
                <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>加载中...</div>
              </div>
            </div>
          ) : sortedRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>暂无规则</div>
              <button
                className="px-4 py-1.5 rounded-lg text-xs text-white"
                style={{ background: "var(--accent)" }}
                onClick={() => setShowForm(true)}
              >
                创建第一条规则
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedRules.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-xl p-4 flex items-center gap-4"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  <button
                    className="w-10 h-5 rounded-full relative transition-all flex-shrink-0"
                    style={{
                      background: rule.enabled ? "var(--accent)" : "var(--bg-tertiary)",
                    }}
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full absolute top-0.5 transition-all"
                      style={{
                        background: "white",
                        left: rule.enabled ? 18 : 2,
                      }}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{rule.name}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                      <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)" }}>
                        {rule.pattern}
                      </code>
                      {" → "}
                      <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)" }}>
                        {rule.replacement || "(删除)"}
                      </code>
                      <span className="ml-2">{rule.scope === "global" ? "全文" : "章节"}</span>
                      <span className="ml-2">优先级 {rule.priority}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)]"
                      style={{ color: "var(--text-tertiary)" }}
                      onClick={() => handleEdit(rule)}
                      title="编辑"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)]"
                      style={{ color: "var(--text-tertiary)" }}
                      onClick={() => handleDelete(rule.id)}
                      title="删除"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Rule form dialog */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={() => { setShowForm(false); setEditingRule(null); }}
        >
          <div
            className="rounded-xl p-5 w-full max-w-md animate-scale-in"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-xl)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-4">
              {editingRule ? "编辑规则" : "新建规则"}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  名称
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="规则名称"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  匹配模式
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  value={form.pattern}
                  onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                  placeholder={form.is_regex ? "正则表达式" : "普通文本"}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  替换为
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  value={form.replacement}
                  onChange={(e) => setForm({ ...form, replacement: e.target.value })}
                  placeholder="留空表示删除匹配内容"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: "var(--text-secondary)" }}>作用域</label>
                  <select
                    className="px-2 py-1 rounded-lg text-xs outline-none"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  >
                    {SCOPES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: "var(--text-secondary)" }}>正则</label>
                  <button
                    className="w-10 h-5 rounded-full relative transition-all"
                    style={{ background: form.is_regex ? "var(--accent)" : "var(--bg-tertiary)" }}
                    onClick={() => setForm({ ...form, is_regex: !form.is_regex })}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full absolute top-0.5 bg-white transition-all"
                      style={{ left: form.is_regex ? 18 : 2 }}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: "var(--text-secondary)" }}>优先级</label>
                  <input
                    type="number"
                    className="w-16 px-2 py-1 rounded-lg text-xs outline-none"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                className="px-4 py-1.5 text-xs rounded-lg"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
                onClick={() => { setShowForm(false); setEditingRule(null); }}
              >
                取消
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-lg text-white font-medium"
                style={{
                  background: "var(--accent)",
                  opacity: form.name.trim() && form.pattern ? 1 : 0.5,
                }}
                onClick={handleSubmit}
                disabled={!form.name.trim() || !form.pattern}
              >
                {editingRule ? "保存" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group form dialog */}
      {showGroupForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowGroupForm(false)}
        >
          <div
            className="rounded-xl p-5 w-full max-w-sm animate-scale-in"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-xl)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-4">新建分组</div>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm rounded-lg outline-none mb-4"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              placeholder="分组名称"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-1.5 text-xs rounded-lg"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
                onClick={() => setShowGroupForm(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-lg text-white font-medium"
                style={{
                  background: "var(--accent)",
                  opacity: newGroupName.trim() ? 1 : 0.5,
                }}
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
