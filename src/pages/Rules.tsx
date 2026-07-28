import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import type { Rule, CreateRule } from "../types";
import { PageHeader, Button, Input, Switch, Dialog } from "../components/ui";

const SCOPES = [
  { value: "global", label: "全文" },
  { value: "chapter", label: "章节" },
];

const EMPTY_FORM: CreateRule = {
  name: "",
  pattern: "",
  replacement: "",
  scope: "global",
  is_regex: true,
  priority: 50,
  group_id: null,
  description: null,
};

export function Rules() {
  const {
    rules, ruleGroups, rulesLoading,
    books,
    loadRules, loadRuleGroups, loadBooks,
    createRule, updateRule, deleteRule,
    createRuleGroup, deleteRuleGroup,
    applyRulesToBook,
  } = useAppStore();

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<CreateRule>(EMPTY_FORM);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [applyBookId, setApplyBookId] = useState("");
  const [applyMsg, setApplyMsg] = useState("");

  useEffect(() => {
    loadRules();
    loadRuleGroups();
    loadBooks();
  }, [loadRules, loadRuleGroups, loadBooks]);

  const openCreateForm = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRule(null);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.pattern) return;
    try {
      if (editingRule) {
        await updateRule(editingRule.id, form);
      } else {
        await createRule(form);
      }
      setForm(EMPTY_FORM);
      closeForm();
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

  const handleDeleteGroup = async (group: { id: string; name: string }) => {
    if (!confirm(`删除分组「${group.name}」？`)) return;
    if (selectedGroup === group.id) setSelectedGroup(null);
    await deleteRuleGroup(group.id);
  };

  const handleApplyToBook = async () => {
    if (!applyBookId.trim()) return;
    setApplyMsg("应用规则中...");
    const count = await applyRulesToBook(applyBookId.trim());
    setApplyMsg(`应用完成，共替换 ${count} 处`);
    setTimeout(() => setApplyMsg(""), 3000);
  };

  const groupCount = (groupId: string) => rules.filter((r) => r.group_id === groupId).length;

  const filteredRules = selectedGroup
    ? rules.filter((r) => r.group_id === selectedGroup)
    : rules;
  const sortedRules = [...filteredRules].sort((a, b) => b.priority - a.priority);

  const selectStyle: React.CSSProperties = {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <div className="flex h-full" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
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
              className={`sidebar-item w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${selectedGroup === null ? "active" : ""}`}
              style={selectedGroup === null ? undefined : { color: "var(--text-secondary)" }}
              onClick={() => setSelectedGroup(null)}
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
              className={`sidebar-item flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-1 group cursor-pointer ${selectedGroup === group.id ? "active" : ""}`}
              style={selectedGroup === group.id ? undefined : { color: "var(--text-secondary)" }}
              onClick={() => setSelectedGroup(group.id)}
            >
              <span className="flex-1 truncate">{group.name} ({groupCount(group.id)})</span>
              {!group.is_preset && (
                <button
                  className="p-0.5 rounded hover-bg opacity-0 group-hover:opacity-100"
                  style={{ color: "var(--text-tertiary)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteGroup(group);
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
            className="w-full text-left px-3 py-2 rounded-lg text-xs mt-2 flex items-center gap-1.5 hover-bg"
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
        <PageHeader
          title="规则引擎"
          actions={
            <Button variant="secondary" size="sm" onClick={openCreateForm}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              新建规则
            </Button>
          }
        />

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto animate-fade-in">
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
                <select
                  className="px-3 py-1.5 text-xs rounded-lg outline-none flex-1"
                  style={selectStyle}
                  value={applyBookId}
                  onChange={(e) => setApplyBookId(e.target.value)}
                >
                  <option value="">选择书籍...</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}{book.author ? ` — ${book.author}` : ""}（{book.format.toUpperCase()}）
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={handleApplyToBook} disabled={!applyBookId}>
                  应用规则
                </Button>
                {applyMsg && (
                  <span
                    className="text-xs"
                    style={{ color: applyMsg.includes("完成") ? "var(--success)" : "var(--text-tertiary)" }}
                  >
                    {applyMsg}
                  </span>
                )}
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                对所有启用的规则（含内置预设）应用到指定书籍的全部章节内容，并自动重建全文索引。
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
                <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {selectedGroup ? "该分组暂无规则" : "暂无规则"}
                </div>
                <Button size="sm" onClick={openCreateForm}>
                  创建第一条规则
                </Button>
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
                    <Switch
                      checked={rule.enabled}
                      onChange={(v) => updateRule(rule.id, { enabled: v })}
                      title={rule.enabled ? "禁用规则" : "启用规则"}
                    />
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
                        className="p-1.5 rounded hover-bg"
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
                        className="p-1.5 rounded hover-bg"
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
          </div>
        </main>
      </div>

      {/* Rule form dialog */}
      <Dialog
        open={showForm}
        onClose={closeForm}
        title={editingRule ? "编辑规则" : "新建规则"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeForm}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!form.name.trim() || !form.pattern}
            >
              {editingRule ? "保存" : "创建"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              名称
            </label>
            <Input
              type="text"
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
            <Input
              type="text"
              value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              placeholder={form.is_regex ? "正则表达式" : "普通文本"}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              替换为
            </label>
            <Input
              type="text"
              value={form.replacement}
              onChange={(e) => setForm({ ...form, replacement: e.target.value })}
              placeholder="留空表示删除匹配内容"
            />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-secondary)" }}>作用域</label>
              <select
                className="px-2 py-1 rounded text-xs outline-none"
                style={selectStyle}
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
              >
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-secondary)" }}>分组</label>
              <select
                className="px-2 py-1 rounded text-xs outline-none"
                style={selectStyle}
                value={form.group_id ?? ""}
                onChange={(e) => setForm({ ...form, group_id: e.target.value || null })}
              >
                <option value="">无分组</option>
                {ruleGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-secondary)" }}>正则</label>
              <Switch
                size="sm"
                checked={form.is_regex}
                onChange={(v) => setForm({ ...form, is_regex: v })}
                title="正则"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: "var(--text-secondary)" }}>优先级</label>
              <div className="w-20">
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Group form dialog */}
      <Dialog
        open={showGroupForm}
        onClose={() => setShowGroupForm(false)}
        title="新建分组"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowGroupForm(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
              创建
            </Button>
          </>
        }
      >
        <Input
          type="text"
          placeholder="分组名称"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
        />
      </Dialog>
    </div>
  );
}
