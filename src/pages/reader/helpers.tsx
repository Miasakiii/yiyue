import React from "react";

export function ToolbarBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button className={`px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5 hover-bg`}
      style={{ color: active ? "var(--accent)" : "var(--text-secondary)", background: active ? "var(--accent-soft)" : "transparent" }}
      onClick={onClick}
      title={title}>
      {children}
      {title}
    </button>
  );
}

export function Divider() {
  return <div className="w-px h-5 mx-1" style={{ background: "var(--border)" }} />;
}

export function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

/** Selected/unselected option chip shared by reader settings rows. */
export function ChoiceBtn({ active, onClick, title, style, children }: {
  active?: boolean; onClick: () => void; title?: string;
  style?: React.CSSProperties; children: React.ReactNode;
}) {
  return (
    <button className="px-1.5 py-1 rounded-md text-xs"
      style={{
        background: active ? "var(--accent-soft)" : "var(--bg-tertiary)",
        color: active ? "var(--accent)" : "var(--text-tertiary)",
        fontWeight: active ? 600 : 400,
        ...style,
      }}
      onClick={onClick}
      title={title}>
      {children}
    </button>
  );
}
