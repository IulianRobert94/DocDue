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
  markAsPaid: (doc: EnrichedDocument) => "paid_next" | "resolved";
  resetToDemo: () => void;
  clearAll: () => void;
  _hydrate: () => Promise<void>;
}

// ─── Persist helper ─────────────────────────────────────

let _lastPersistedDocs: RawDocument[] | null = null;

function persistDocs(documents: RawDocument[]) {
  const lang = useSettingsStore?.getState?.()?.settings?.language || "en";
  const payload = { version: DATA_VERSION, documents };
  AsyncStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(payload))
    .then(() => { _lastPersistedDocs = documents; })
    .catch((e) => {
      if (__DEV__) console.warn("DocDue: persist error", e);
      // Revert in-memory state to last successfully persisted version
      if (_lastPersistedDocs) {
        useDocumentStore.setState({ documents: _lastPersistedDocs });
      }
      Alert.alert(t(lang, "save_error_title"), t(lang, "save_error_msg"));
    });
}

// ─── Attachment cleanup helper ──────────────────────────

function cleanupAttachments(doc: RawDocument) {
  if (!doc.attachments?.length) return;
  for (const att of doc.attachments) {
    FileSystem.deleteAsync(att.uri, { idempotent: true }).catch(() => {});
  }
}

// ─── Notification reschedule helper ──────────────────────

let _rescheduleTimer: ReturnType<typeof setTimeout> | null = null;

function doReschedule(documents: RawDocument[]) {
  const settings = useSettingsStore?.getState?.()?.settings;
  if (settings?.notificationsEnabled) {
    rescheduleAllNotifications(documents, settings.reminderDays, settings.language)
      .then(() => scheduleMorningDigest(documents, settings.language))
      .then(() => scheduleWeeklySummary(documents, settings.language))
      .catch((e) => { if (__DEV__) console.warn("DocDue: notification reschedule error", e); });
  }
  updateWidgetData(documents);
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
    try {
      let raw = await AsyncStorage.getItem(STORAGE_KEY_DOCUMENTS);
      // Migrate from legacy key if needed
      if (!raw) {
        raw = await AsyncStorage.getItem(STORAGE_KEY_DOCUMENTS_LEGACY);
        if (raw) {
          await AsyncStorage.setItem(STORAGE_KEY_DOCUMENTS, raw);
          await AsyncStorage.removeItem(STORAGE_KEY_DOCUMENTS_LEGACY);
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        const migrated = migrateData(parsed);
        if (migrated) {
          // migrated can be [] (user deleted all docs) — that's valid
          _lastPersistedDocs = migrated;
          set({ documents: migrated, _hydrated: true });
          if (migrated.length > 0) triggerNotificationReschedule(migrated);
          return;
        }
      }
      // First launch — persist demo data
      const demo = createDemoDocuments();
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
    if (toDelete) cleanupAttachments(toDelete);
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }));
    afterMutation(get().documents, true);
  },

  markAsPaid: (doc) => {
    // Safety: verify document still exists
    const exists = get().documents.some((d) => d.id === doc.id);
    if (!exists) return "resolved";

    // Snapshot the payment before advancing/deleting
    const payment = { date: getTodayString(), dueDate: doc.due, amt: doc.amt };
    const history = [...(doc.paymentHistory || []), payment];

    const recDays = getRecurrenceDays(doc.rec);
    if (recDays > 0) {
      const MONTH_MAP: Record<string, number> = {
        monthly: 1, annual: 12,
      };
      const months = MONTH_MAP[doc.rec];
      const nextDue = months
        ? addMonthsToDate(doc.due, months)
        : addDaysToDate(doc.due, recDays);
      set((state) => ({
        documents: state.documents.map((d) =>
          d.id === doc.id ? { ...d, due: nextDue, paymentHistory: history } : d
        ),
      }));
      afterMutation(get().documents, true);
      maybeRequestReview(get().documents.length).catch(() => {});
      return "paid_next";
    } else {
      // Non-recurring: resolve but preserve payment history in the final state
      const raw = get().documents.find((d) => d.id === doc.id);
      if (raw) cleanupAttachments(raw);
      set((state) => ({
        documents: state.documents.filter((d) => d.id !== doc.id),
      }));
      afterMutation(get().documents, true);
      return "resolved";
    }
  },

  resetToDemo: () => {
    const demo = createDemoDocuments();
    set({ documents: demo });
    afterMutation(demo);
  },

  clearAll: () => {
    // Clean up all attachment files
    const docs = get().documents;
    for (const doc of docs) cleanupAttachments(doc);
    set({ documents: [] });
    afterMutation([]);
  },
}));

// ─── Computed Selectors (memoized for performance) ──────

import { useMemo } from "react";

export function useEnrichedDocuments(): EnrichedDocument[] {
  const documents = useDocumentStore((s) => s.documents);
  return useMemo(() =>
    documents
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
