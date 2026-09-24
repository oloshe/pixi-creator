import { useEffect } from 'react';
import { useToastStore, type ToastItem } from './toastStore';

/**
 * Global toast stack rendered once at the app root. Toasts are pushed with the
 * imperative `toast` helpers in `toastStore.ts`, auto-dismiss after their
 * duration, and can be dismissed early by clicking.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((item) => <ToastView key={item.id} toast={item} />)}
    </div>
  );
}

function ToastView({ toast: item }: { toast: ToastItem }) {
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, dismiss]);

  return (
    <button
      type="button"
      className={`toast toast-${item.kind}`}
      onClick={() => dismiss(item.id)}
      title="Dismiss"
    >
      {item.title ? <span className="toastTitle">{item.title}</span> : null}
      <span className="toastMessage">{item.message}</span>
    </button>
  );
}
