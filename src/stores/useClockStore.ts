/**
 * DocDue — Clock Store
 *
 * Holds "today" as a "YYYY-MM-DD" string so everything derived from the date
 * (days remaining, status, health score, badges) recomputes when the day
 * changes — after midnight or when the app returns from the background.
 * Without it, memoized values stayed frozen at the last document change.
 */

import { create } from "zustand";
import { getTodayString } from "../core/dateUtils";

interface ClockState {
  today: string;
  /** Re-read the device date; only notifies subscribers when the day changed. */
  refreshToday: () => void;
}

export const useClockStore = create<ClockState>()((set, get) => ({
  today: getTodayString(),
  refreshToday: () => {
    const today = getTodayString();
    if (today !== get().today) set({ today });
  },
}));

/** Today's date ("YYYY-MM-DD"); components re-render when the day changes. */
export function useToday(): string {
  return useClockStore((s) => s.today);
}

/**
 * Refresh `today` shortly after each local midnight while the app is open.
 * (Timers don't run while the app is suspended — the root layout also
 * refreshes on every return to the foreground.) Returns a stop function.
 */
export function startMidnightTimer(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleNext = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    timer = setTimeout(() => {
      useClockStore.getState().refreshToday();
      scheduleNext();
    }, nextMidnight.getTime() - now.getTime());
  };
  scheduleNext();
  return () => {
    if (timer) clearTimeout(timer);
  };
}
