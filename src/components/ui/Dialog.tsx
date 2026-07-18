import { useEffect } from "react";
import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Close when clicking the overlay. Defaults to true. */
  closeOnOverlay?: boolean;
}

/** Generic modal: overlay + centered card, Esc to close, optional overlay-click to close. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnOverlay = true,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-fade-in"
      style={{
        background: "var(--overlay-bg)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: "var(--z-modal)",
      }}
      onClick={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl animate-scale-in"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        {title && (
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-light)" }}>
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div
            className="px-5 py-4 flex items-center justify-end gap-2"
            style={{ borderTop: "1px solid var(--border-light)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
