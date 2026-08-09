import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
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
<ChevronLeft size={ 14 } strokeWidth={2} />
          返回
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
