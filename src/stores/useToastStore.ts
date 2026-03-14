/**
 * Toast Store — Lightweight state for non-blocking notifications
 * Supports optional action button (e.g., Undo)
 */
import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  action: ToastAction | null;
  show: (message: string, type?: ToastType, action?: ToastAction) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: "",
  type: "success",
  action: null,
  show: (message, type = "success", action = undefined) =>
    set({ visible: true, message, type, action: action ?? null }),
  hide: () => set({ visible: false, action: null }),
}));

/** Convenience function — call from anywhere without hooks */
export const showToast = (message: string, type: ToastType = "success", action?: ToastAction) =>
  useToastStore.getState().show(message, type, action);
