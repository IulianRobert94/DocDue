/**
 * DocDue — Maintenance journal store (Zustand + AsyncStorage)
 *
 * Tracked items (car battery, tyres, water filter…) and the history of each
 * installation, so the app can show how long things last. Kept apart from
 * documents: no reminders, free-tier limit or notifications involved.
 */

import { create } from "zustand";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ITEMS_DATA_VERSION,
  STORAGE_KEY_ITEMS,
  STORAGE_KEY_ITEMS_CORRUPT_BACKUP,
} from "../core/constants";
import type { CategoryId, ItemInstall, TrackedItem } from "../core/constants";
import { generateId } from "../core/helpers";
import { getTodayString, parseLocalDate } from "../core/dateUtils";
import { isValidItem } from "../core/lifespan";
import { t } from "../core/i18n";
import { readStorageKey } from "../services/storage";
import { useSettingsStore } from "./useSettingsStore";

export interface NewItemInput {
  name: string;
  cat: CategoryId;
  asset?: string;
  notes?: string;
  /** First installation */
  start: string;
  startKm?: number;
  cost?: number | null;
  note?: string;
}

export interface InstallEvent {
  date: string;
  km?: number;
  cost?: number | null;
  note?: string;
}

interface ItemsState {
  items: TrackedItem[];
  _hydrated: boolean;
  _hydrate: () => Promise<void>;

  /** Returns the new item's id */
  addItem: (data: NewItemInput) => string;
  updateItem: (id: string, patch: Partial<Pick<TrackedItem, "name" | "cat" | "asset" | "notes">>) => void;
  deleteItem: (id: string) => void;
  /** End the install in use and start a new one the same day. False if not possible. */
  replaceCurrent: (id: string, event: InstallEvent & { reason: "broke" | "replaced" }) => boolean;
  /** End the install in use without a replacement (it broke). */
  markBroken: (id: string, event: { date: string; km?: number }) => boolean;
  /** Start a new install when nothing is in use. */
  startNewInstall: (id: string, event: InstallEvent) => boolean;
  /** Record a period from before the existing history (must end by the first one's start). */
  addPastInstall: (id: string, period: {
    start: string; end: string; startKm?: number; endKm?: number;
    reason: "broke" | "replaced"; cost?: number | null; note?: string;
  }) => boolean;
  deleteInstall: (itemId: string, installId: string) => void;
  /** Backup "Replace all" */
  replaceAllItems: (items: TrackedItem[]) => void;
  /** Backup "Merge" — adds items whose id isn't present; returns how many were added */
  mergeItems: (items: TrackedItem[]) => number;
  clearAllItems: () => void;
}

// ─── Persistence (serialized; blocked if loading failed) ──

let _lastPersisted: TrackedItem[] | null = null;
let _persistChain: Promise<void> = Promise.resolve();
let _persistBlocked = false;

function persistItems(items: TrackedItem[]) {
  // Never before the saved journal was read (or after that failed)
  if (_persistBlocked || !useItemStore.getState()._hydrated) return;
  const lang = useSettingsStore?.getState?.()?.settings?.language || "en";
  const previous = _lastPersisted;
  _lastPersisted = items;
  _persistChain = _persistChain.then(() =>
    AsyncStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify({ version: ITEMS_DATA_VERSION, items }))
      .catch((e) => {
        if (__DEV__) console.warn("DocDue: items persist error", e);
        // Revert only if no newer write superseded this one
        if (_lastPersisted === items) {
          if (previous !== null) {
            _lastPersisted = previous;
            useItemStore.setState({ items: previous });
          }
          Alert.alert(t(lang, "save_error_title"), t(lang, "save_error_msg"));
        }
      })
  );
}

const isValidDate = (date: string) => !isNaN(parseLocalDate(date).getTime());
const cleanKm = (km?: number) => (typeof km === "number" && Number.isFinite(km) && km >= 0 ? Math.round(km) : undefined);
const cleanText = (text?: string) => text?.trim() || undefined;

// ─── Store ──────────────────────────────────────────────

export const useItemStore = create<ItemsState>()((set, get) => {
  /** Apply a change to one item; returns false if the item doesn't exist. */
  const updateOne = (id: string, change: (item: TrackedItem) => TrackedItem | null): boolean => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return false;
    const next = change(item);
    if (!next) return false;
    const items = get().items.map((i) => (i.id === id ? next : i));
    set({ items });
    persistItems(items);
    return true;
  };

  return {
    items: [],
    _hydrated: false,

    _hydrate: async () => {
      if (get()._hydrated) return;
      const lang = useSettingsStore?.getState?.()?.settings?.language || "ro";
      const read = await readStorageKey(STORAGE_KEY_ITEMS);
      if (!read.ok) {
        // Couldn't read — keep the saved journal untouched for this session
        _persistBlocked = true;
        set({ items: [], _hydrated: true });
        Alert.alert(t(lang, "load_error_title"), t(lang, "load_error_msg"));
        return;
      }
      if (!read.value) {
        set({ items: [], _hydrated: true });
        return;
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(read.value);
      } catch {
        if (__DEV__) console.warn("DocDue: corrupted items JSON");
      }
      const list = parsed && typeof parsed === "object" ? (parsed as { items?: unknown }).items : undefined;
      if (!Array.isArray(list)) {
        // Saved data exists but can't be understood: keep a copy for recovery
        await AsyncStorage.setItem(STORAGE_KEY_ITEMS_CORRUPT_BACKUP, read.value).catch(() => {});
        _lastPersisted = [];
        set({ items: [], _hydrated: true });
        return;
      }
      const items = list.filter(isValidItem);
      if (items.length < list.length) {
        // Some entries were unusable and will be gone after the next save —
        // keep the original for recovery
        await AsyncStorage.setItem(STORAGE_KEY_ITEMS_CORRUPT_BACKUP, read.value).catch(() => {});
      }
      _lastPersisted = items;
      set({ items, _hydrated: true });
    },

    addItem: (data) => {
      const id = generateId();
      const item: TrackedItem = {
        id,
        name: data.name.trim(),
        cat: data.cat,
        asset: cleanText(data.asset),
        notes: cleanText(data.notes),
        createdAt: getTodayString(),
        installs: [{
          id: generateId(),
          start: data.start,
          startKm: cleanKm(data.startKm),
          cost: data.cost ?? undefined,
          note: cleanText(data.note),
        }],
      };
      const items = [...get().items, item];
      set({ items });
      persistItems(items);
      return id;
    },

    updateItem: (id, patch) => {
      updateOne(id, (item) => ({
        ...item,
        ...(patch.name !== undefined && patch.name.trim() ? { name: patch.name.trim() } : {}),
        ...(patch.cat !== undefined ? { cat: patch.cat } : {}),
        ...("asset" in patch ? { asset: cleanText(patch.asset) } : {}),
        ...("notes" in patch ? { notes: cleanText(patch.notes) } : {}),
      }));
    },

    deleteItem: (id) => {
      const items = get().items.filter((i) => i.id !== id);
      set({ items });
      persistItems(items);
    },

    replaceCurrent: (id, event) => updateOne(id, (item) => {
      const last = item.installs[item.installs.length - 1];
      if (!last || last.end || !isValidDate(event.date) || event.date < last.start) return null;
      const km = cleanKm(event.km);
      const closed: ItemInstall = { ...last, end: event.date, endKm: km, endReason: event.reason };
      const next: ItemInstall = {
        id: generateId(),
        start: event.date,
        startKm: km,
        cost: event.cost ?? undefined,
        note: cleanText(event.note),
      };
      return { ...item, installs: [...item.installs.slice(0, -1), closed, next] };
    }),

    markBroken: (id, event) => updateOne(id, (item) => {
      const last = item.installs[item.installs.length - 1];
      if (!last || last.end || !isValidDate(event.date) || event.date < last.start) return null;
      const closed: ItemInstall = { ...last, end: event.date, endKm: cleanKm(event.km), endReason: "broke" };
      return { ...item, installs: [...item.installs.slice(0, -1), closed] };
    }),

    startNewInstall: (id, event) => updateOne(id, (item) => {
      const last = item.installs[item.installs.length - 1];
      if (last && !last.end) return null; // one is already in use
      if (!isValidDate(event.date) || (last?.end && event.date < last.end)) return null;
      const next: ItemInstall = {
        id: generateId(),
        start: event.date,
        startKm: cleanKm(event.km),
        cost: event.cost ?? undefined,
        note: cleanText(event.note),
      };
      return { ...item, installs: [...item.installs, next] };
    }),

    deleteInstall: (itemId, installId) => {
      updateOne(itemId, (item) => {
        const index = item.installs.findIndex((i) => i.id === installId);
        if (index === -1) return null;
        const removed = item.installs[index];
        let installs = item.installs.filter((i) => i.id !== installId);
        // Undoing a mistaken "Replace": the period it closed is in use again
        const previous = installs[index - 1];
        const wasOpenLast = index === item.installs.length - 1 && !removed.end;
        if (wasOpenLast && previous && previous.end === removed.start) {
          const { end: _end, endKm: _endKm, endReason: _reason, ...reopened } = previous;
          installs = [...installs.slice(0, -1), reopened];
        }
        return { ...item, installs };
      });
    },

    addPastInstall: (id, period) => updateOne(id, (item) => {
      const first = item.installs[0];
      if (!isValidDate(period.start) || !isValidDate(period.end) || period.end < period.start) return null;
      if (first && period.end > first.start) return null; // would overlap the history
      const past: ItemInstall = {
        id: generateId(),
        start: period.start,
        startKm: cleanKm(period.startKm),
        end: period.end,
        endKm: cleanKm(period.endKm),
        endReason: period.reason,
        cost: period.cost ?? undefined,
        note: cleanText(period.note),
      };
      return { ...item, installs: [past, ...item.installs] };
    }),

    replaceAllItems: (incoming) => {
      const items = incoming.filter(isValidItem);
      set({ items });
      persistItems(items);
    },

    mergeItems: (incoming) => {
      const known = new Set(get().items.map((i) => i.id));
      const added = incoming.filter((i) => isValidItem(i) && !known.has(i.id));
      if (added.length === 0) return 0;
      const items = [...get().items, ...added];
      set({ items });
      persistItems(items);
      return added.length;
    },

    clearAllItems: () => {
      set({ items: [] });
      persistItems([]);
    },
  };
});
