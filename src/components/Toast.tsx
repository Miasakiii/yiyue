import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  type: "info" | "error" | "success";
  leaving?: boolean;
}

let toastId = 0;
let listeners: Array<(toasts: ToastItem[]) => void> = [];
let toasts: ToastItem[] = [];

function notify() {
  for (const l of listeners) l([...toasts]);
}

const EXIT_MS = 220;

function dismissToast(id: number) {
  const t = toasts.find((t) => t.id === id);
  if (!t || t.leaving) return;
  t.leaving = true;
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, EXIT_MS);
}

export function showToast(message: string, type: "info" | "error" | "success" = "info") {
  const id = ++toastId;
  toasts.push({ id, message, type });
  notify();
  setTimeout(() => dismissToast(id), 3000);
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 pointer-events-none"
      style={{ zIndex: "var(--z-toast)" }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pl-4 pr-2.5 py-2.5 text-sm animate-slide-down pointer-events-auto toast-${t.type} flex items-center gap-3`}
          style={{
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            minWidth: 200,
            maxWidth: 400,
            opacity: t.leaving ? 0 : 1,
            transform: t.leaving ? "translateY(-8px)" : undefined,
            transition: `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in`,
          }}
        >
          <span className="flex-1" style={{ textAlign: "center" }}>{t.message}</span>
          <button
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            onClick={() => dismissToast(t.id)}
            aria-label="关闭"
          >
<X size={ 10 } strokeWidth={2.5} />
          </button>
        </div>
      ))}
    </div>
  );
}
