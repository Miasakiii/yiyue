import { useEffect, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "info" | "error" | "success";
}

let toastId = 0;
let listeners: Array<(toasts: ToastItem[]) => void> = [];
let toasts: ToastItem[] = [];

function notify() {
  for (const l of listeners) l([...toasts]);
}

export function showToast(message: string, type: "info" | "error" | "success" = "info") {
  const id = ++toastId;
  toasts.push({ id, message, type });
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, 3000);
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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 text-sm shadow-lg animate-slide-down pointer-events-auto toast-${t.type}`}
          style={{ borderRadius: "var(--radius-md)", minWidth: 200, maxWidth: 400, textAlign: "center" }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
