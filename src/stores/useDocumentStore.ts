/**
 * DocDue — Documents Store (Zustand + AsyncStorage)
 *
 * Sertarul central cu toate documentele.
 * Persistența prin AsyncStorage — datele se salvează automat.
 */

import { create } from "zustand";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import {
  CATEGORIES,
  DATA_VERSION,
  PAYMENT_WINDOW_DAYS,
  STORAGE_KEY_DOCUMENTS,
  STORAGE_KEY_DOCUMENTS_LEGACY,
} from "../core/constants";
import { t } from "../core/i18n";
import type {
  RawDocument,
  EnrichedDocument,
  CategoryId,
} from "../core/constants";
import { enrichDocument, stripEnrichedFields } from "../core/enrichment";
import { generateId } from "../core/helpers";
import { addDaysToDate, addMonthsToDate, getTodayString } from "../core/dateUtils";
import { getRecurrenceDays } from "../core/formatters";
import { createDemoDocuments } from "../core/demo";
import { migrateData } from "../core/migration";
import { useSettingsStore } from "./useSettingsStore";
import { rescheduleAllNotifications, scheduleMorningDigest, scheduleWeeklySummary } from "../services/notifications";
import { updateWidgetData } from "../services/widgetService";
import { maybeRequestReview } from "../services/reviewPrompt";

// ─── Types ──────────────────────────────────────────────

export interface CategoryStats {
  total: number;
  expired: number;
  warning: number;
  ok: number;
  totalDue: number;
}

export interface GlobalStats {
  expired: number;
  warning: number;
  ok: number;
  totalDue: number;
  urgentCount: number;
}

interface DocumentsState {
  documents: RawDocument[];
  _hydrated: boolean;

  // Actions
  addDocument: (data: Omit<RawDocument, "id">) => void;
  addDocuments: (data: Omit<RawDocument, "id">[]) => void;
  updateDocument: (data: RawDocument) => void;
  deleteDocument: (id: string) => void;
  undoDelete: () => void;
  markAsPaid: (doc: EnrichedDocument) => "paid_next" | "resolved";
  resetToDemo: () => void;
  clearAll: () => void;
  _hydrate: () => Promise<void>;
}

// ─── Persist helper ─────────────────────────────────────

let _lastPersistedDocs: RawDocument[] | null = null;
let _persistChain: Promise<void> = Promise.resolve();

function persistDocs(documents: RawDocument[]) {
  const lang = useSettingsStore?.getState?.()?.settings?.language || "en";
  // Serialize writes: each persist waits for the previous one to finish,
  // so the last write always wins and we never lose data from race conditions.
  const prevPersisted = _lastPersistedDocs;
  _lastPersistedDocs = documents;
  _persistChain = _persistChain.then(() => {
    const payload = { version: DATA_VERSION, documents };
    return AsyncStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(payload))
      .then(() => { /* persisted successfully */ })
      .catch((e) => {
        if (__DEV__) console.warn("DocDue: persist error", e);
        if (prevPersisted !== null) {
          _lastPersistedDocs = prevPersisted;
          useDocumentStore.setState({ documents: prevPersisted });
        }
        Alert.alert(t(lang, "save_error_title"), t(lang, "save_error_msg"));
      });
  });
}

// ─── Attachment cleanup helper ──────────────────────────

function cleanupAttachments(doc: RawDocument) {
  if (!doc.attachments?.length) return;
  for (const att of doc.attachments) {
    FileSystem.deleteAsync(att.uri, { idempotent: true }).catch(() => {});
  }
}

// ─── Undo delete buffer ─────────────────────────────────

let _undoBuffer: { doc: RawDocument; timer: ReturnType<typeof setTimeout> } | null = null;

// Pending attachment cleanup timers — survive undo buffer replacement
// so that files are only deleted after their undo window expires
const _pendingCleanups = new Map<string, ReturnType<typeof setTimeout>>();

function flushUndoBuffer() {
  if (_undoBuffer) {
    // Don't cancel the cleanup timer — let it expire and delete the files.
    // Just remove the undo reference so undoDelete() can't restore this doc.
    _undoBuffer = null;
  }
}

// ─── Notification reschedule helper ──────────────────────

let _rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
let _rescheduleRunning = false;

async function doReschedule(documents: RawDocument[], attempt = 1) {
  // Prevent concurrent reschedule calls (e.g. rapid immediate mutations)
  // to avoid duplicate notification scheduling
  if (_rescheduleRunning && attempt === 1) return;
  _rescheduleRunning = true;
  let retryScheduled = false;
  try {
    const settings = useSettingsStore?.getState?.()?.settings;
    if (settings?.notificationsEnabled) {
      try {
        await rescheduleAllNotifications(documents, settings.reminderDays, settings.language);
        await scheduleMorningDigest(documents, settings.language);
        await scheduleWeeklySummary(documents, settings.language);
      } catch (e) {
        if (__DEV__) console.warn("DocDue: notification reschedule error", e);
        if (attempt < 3) {
          retryScheduled = true;
          setTimeout(() => doReschedule(documents, attempt + 1), attempt * 2000);
          return;
        } else if (__DEV__) {
          console.warn("DocDue: notification reschedule failed after 3 attempts — notifications may be stale");
        }
      }
    }
    updateWidgetData(documents);
  } finally {
    if (!retryScheduled) _rescheduleRunning = false;
  }
}

function triggerNotificationReschedule(documents: RawDocument[], immediate = false) {
  if (_rescheduleTimer) clearTimeout(_rescheduleTimer);
  if (immediate) {
    _rescheduleTimer = null;
    doReschedule(documents);
  } else {
    // Debounce: coalesce rapid mutations (e.g. bulk import) into a single reschedule
    _rescheduleTimer = setTimeout(() => {
      _rescheduleTimer = null;
      doReschedule(documents);
    }, 500);
  }
}

// ─── After-mutation side effects (called outside set()) ─

function afterMutation(documents: RawDocument[], immediate = false) {
  persistDocs(documents);
  triggerNotificationReschedule(documents, immediate);
}

// ─── Store ──────────────────────────────────────────────

export const useDocumentStore = create<DocumentsState>()((set, get) => ({
  documents: [],
  _hydrated: false,

  _hydrate: async () => {
    if (get()._hydrated) return;
    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
    try {
      let raw = await withTimeout(AsyncStorage.getItem(STORAGE_KEY_DOCUMENTS), 5000);
      // Migrate from legacy key if needed
      if (!raw) {
        raw = await withTimeout(AsyncStorage.getItem(STORAGE_KEY_DOCUMENTS_LEGACY), 5000);
        if (raw) {
          await AsyncStorage.setItem(STORAGE_KEY_DOCUMENTS, raw);
          await AsyncStorage.removeItem(STORAGE_KEY_DOCUMENTS_LEGACY);
        }
      }
      if (raw) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          if (__DEV__) console.warn("DocDue: corrupted JSON in AsyncStorage, resetting");
          parsed = null;
        }
        const migrated = migrateData(parsed as Parameters<typeof migrateData>[0]);
        if (migrated) {
          // migrated can be [] (user deleted all docs) — that's valid
          _lastPersistedDocs = migrated;
          set({ documents: migrated, _hydrated: true });
          if (migrated.length > 0) triggerNotificationReschedule(migrated);
          return;
        }
      }
      // First launch — persist demo data in current language
      const lang = useSettingsStore?.getState?.()?.settings?.language || "ro";
      const demo = createDemoDocuments(lang);
      _lastPersistedDocs = demo;
      persistDocs(demo);
      set({ documents: demo, _hydrated: true });
    } catch (e) {
      if (__DEV__) console.warn("DocDue: hydrate error", e);
      set({ _hydrated: true });
    }
  },

  addDocument: (data) => {
    const newDoc = { ...data, id: generateId() } as RawDocument;
    set((state) => ({ documents: [...state.documents, newDoc] }));
    const documents = get().documents;
    afterMutation(documents, true);
    maybeRequestReview(documents.length).catch(() => {});
  },

  addDocuments: (dataList) => {
    const newDocs = dataList.map((data) => ({ ...data, id: generateId() } as RawDocument));
    set((state) => ({ documents: [...state.documents, ...newDocs] }));
    afterMutation(get().documents);
  },

  updateDocument: (data) => {
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === data.id ? stripEnrichedFields(data) : d
      ),
    }));
    afterMutation(get().documents, true);
  },

  deleteDocument: (id) => {
    const toDelete = get().documents.find((d) => d.id === id);
    if (!toDelete) return;
    // Discard previous undo reference (its cleanup timer stays alive)
    flushUndoBuffer();
    // Schedule attachment cleanup after undo window expires
    const cleanupTimer = setTimeout(() => {
      _pendingCleanups.delete(id);
      cleanupAttachments(toDelete);
      if (_undoBuffer?.doc.id === id) _undoBuffer = null;
    }, 5500);
    _pendingCleanups.set(id, cleanupTimer);
    _undoBuffer = { doc: toDelete, timer: cleanupTimer };
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }));
    afterMutation(get().documents, true);
  },

  undoDelete: () => {
    if (!_undoBuffer) return;
    const doc = _undoBuffer.doc;
    // Cancel the cleanup timer — user wants the doc (and its files) back
    const pendingTimer = _pendingCleanups.get(doc.id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      _pendingCleanups.delete(doc.id);
    }
    clearTimeout(_undoBuffer.timer);
    _undoBuffer = null;
    set((state) => ({ documents: [...state.documents, doc] }));
    afterMutation(get().documents, true);
  },

  markAsPaid: (doc) => {
    // Safety: fetch fresh state to prevent stale-doc double-tap
    const fresh = get().documents.find((d) => d.id === doc.id);
    if (!fresh) return "resolved";

    // Snapshot the payment before advancing/deleting
    const payment = { date: getTodayString(), dueDate: fresh.due, amt: fresh.amt };
    const history = [...(fresh.paymentHistory || []), payment];

    const recDays = getRecurrenceDays(fresh.rec);
    if (recDays > 0) {
      const MONTH_MAP: Record<string, number> = {
        monthly: 1, quarterly: 3, biannual: 6, annual: 12,
        "2years": 24, "5years": 60, "10years": 120,
      };
      const months = MONTH_MAP[fresh.rec];
      const nextDue = months
        ? addMonthsToDate(fresh.due, months)
        : addDaysToDate(fresh.due, recDays);
      set((state) => ({
        documents: state.documents.map((d) =>
          d.id === doc.id ? { ...d, due: nextDue, paymentHistory: history } : d
        ),
      }));
      afterMutation(get().documents, true);
      maybeRequestReview(get().documents.length).catch(() => {});
      return "paid_next";
    } else {
      // Non-recurring: mark as resolved (keep for analytics history)
      set((state) => ({
        documents: state.documents.map((d) =>
          d.id === doc.id ? { ...d, paymentHistory: history, resolved: getTodayString() } : d
        ),
      }));
      afterMutation(get().documents, true);
      return "resolved";
    }
  },

  resetToDemo: () => {
    const lang = useSettingsStore?.getState?.()?.settings?.language || "ro";
    const demo = createDemoDocuments(lang);
    set({ documents: demo });
    afterMutation(demo);
  },

  clearAll: () => {
    // Clean up all attachment files + pending undo timers
    const docs = get().documents;
    for (const doc of docs) cleanupAttachments(doc);
    clearPendingCleanups();
    set({ documents: [] });
    afterMutation([]);
  },
}));

/** Cancel all pending timers (undo cleanup + reschedule debounce). Used by clearAll and test teardown. */
export function clearPendingCleanups() {
  for (const timer of _pendingCleanups.values()) clearTimeout(timer);
  _pendingCleanups.clear();
  if (_undoBuffer) {
    clearTimeout(_undoBuffer.timer);
    _undoBuffer = null;
  }
  if (_rescheduleTimer) {
    clearTimeout(_rescheduleTimer);
    _rescheduleTimer = null;
  }
}

// ─── Computed Selectors (memoized for performance) ──────

import { useMemo } from "react";

export function useEnrichedDocuments(): EnrichedDocument[] {
  const documents = useDocumentStore((s) => s.documents);
  return useMemo(() =>
    documents
      .filter((d) => !d.resolved)
      .map((d) => enrichDocument(d))
      .sort((a, b) => a._daysUntil - b._daysUntil),
    [documents]
  );
}

export function useEnrichedDocument(id: string | undefined): EnrichedDocument | undefined {
  const doc = useDocumentStore((s) => s.documents.find((d) => d.id === id));
  return useMemo(() => {
    if (!doc) return undefined;
    return enrichDocument(doc);
  }, [doc]);
}

export function useGlobalStats(precomputed?: EnrichedDocument[]): GlobalStats {
  const fallback = useEnrichedDocuments();
  const enriched = precomputed ?? fallback;
  return useMemo(() => {
    let expired = 0, warning = 0, ok = 0, totalDue = 0;
    for (const d of enriched) {
      if (d._status === "expired") expired++;
      else if (d._status === "warning") warning++;
      else ok++;
      if (d._daysUntil >= 0 && d._daysUntil <= PAYMENT_WINDOW_DAYS && d.amt) {
        totalDue += d.amt || 0;
      }
    }
    return { expired, warning, ok, totalDue, urgentCount: expired + warning };
  }, [enriched]);
}

export function useCategoryStats(precomputed?: EnrichedDocument[]): Record<CategoryId, CategoryStats> {
  const fallback = useEnrichedDocuments();
  const enriched = precomputed ?? fallback;
  return useMemo(() => {
    const result = {} as Record<CategoryId, CategoryStats>;
    (Object.keys(CATEGORIES) as CategoryId[]).forEach((catId) => {
      result[catId] = { total: 0, expired: 0, warning: 0, ok: 0, totalDue: 0 };
    });
    for (const d of enriched) {
      const cat = result[d.cat];
      if (!cat) continue;
      cat.total++;
      if (d._status === "expired") cat.expired++;
      else if (d._status === "warning") cat.warning++;
      else cat.ok++;
      if (d._daysUntil >= 0 && d._daysUntil <= PAYMENT_WINDOW_DAYS && d.amt) {
        cat.totalDue += d.amt || 0;
      }
    }
    return result;
  }, [enriched]);
}
