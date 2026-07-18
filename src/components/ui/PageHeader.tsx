import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
}

/** Unified header for secondary pages: back button + title on the left, optional actions on the right. */
export function PageHeader({ title, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header
      className="flex items-center justify-between px-8 py-5 flex-shrink-0"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          className="px-2.5 py-1.5 rounded-lg text-sm flex items-center gap-1.5 hover-bg"
          style={{ color: "var(--text-secondary)" }}
          onClick={() => navigate("/")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
