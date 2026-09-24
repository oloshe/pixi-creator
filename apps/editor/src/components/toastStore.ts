import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  /** Milliseconds before auto-dismiss; `0` keeps it until clicked. */
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  push(toast: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }): string;
  dismiss(id: string): void;
}

let counter = 0;

const DEFAULT_DURATION: Record<ToastKind, number> = {
  info: 4000,
  success: 3500,
  warning: 5500,
  error: 8000,
};

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(toast) {
    const id = `toast-${Date.now()}-${counter++}`;
    const item: ToastItem = {
      ...toast,
      id,
      duration: toast.duration ?? DEFAULT_DURATION[toast.kind],
    };
    // Keep the stack bounded; the newest toast replaces the oldest when full.
    set((state) => ({ toasts: [...state.toasts, item].slice(-6) }));
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  },
}));

/**
 * Imperative toast helpers usable from anywhere (store actions, components,
 * event handlers) without needing the React tree.
 */
export const toast = {
  info(message: string, title?: string): string {
    return useToastStore.getState().push({ kind: 'info', message, title });
  },
  success(message: string, title?: string): string {
    return useToastStore.getState().push({ kind: 'success', message, title });
  },
  warning(message: string, title?: string): string {
    return useToastStore.getState().push({ kind: 'warning', message, title });
  },
  error(message: string, title?: string): string {
    return useToastStore.getState().push({ kind: 'error', message, title });
  },
};
