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
  STORAGE_KEY_DOCUMENTS_CORRUPT_BACKUP,
  DEMO_ID_PREFIX,
} from "../core/constants";
import { t } from "../core/i18n";
import type {
  RawDocument,
  EnrichedDocument,
  CategoryId,
} from "../core/constants";
import { enrichDocument, stripEnrichedFields } from "../core/enrichment";
import { generateId, isDemoDocument, countTowardFreeLimit } from "../core/helpers";
import { getTodayString } from "../core/dateUtils";
import { applyPayAction, defaultPayAction } from "../core/payment";
import type { PayAction } from "../core/payment";
import { createDemoDocuments } from "../core/demo";
import { migrateData } from "../core/migration";
import { useSettingsStore } from "./useSettingsStore";
import { syncAllNotifications, dismissDeliveredForDocument } from "../services/notifications";
import { updateWidgetData } from "../services/widgetService";
import { maybeRequestReview } from "../services/reviewPrompt";
import { readStorageKey } from "../services/storage";

// ─── Computed Selectors (memoized for performance) ──────

import { useMemo } from "react";
import { useToday } from "./useClockStore";

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
  /**
   * Merge the given fields onto the stored document. Fields not present in
   * `data` (e.g. paymentHistory, resolved) are kept; a key set to `undefined`
   * clears that field.
   */
  updateDocument: (data: Partial<RawDocument> & { id: string }) => void;
  deleteDocument: (id: string) => void;
  undoDelete: () => void;
  /** One tap, no questions (see defaultPayAction). The pay sheet uses applyPayment. */
  markAsPaid: (doc: EnrichedDocument) => "paid_next" | "resolved";
  /**
   * Paid / renewed / closed as chosen in the pay sheet. The previous version is
   * kept for a few seconds so the toast's "Anulează" can bring it back.
   */
  applyPayment: (id: string, action: PayAction) => boolean;
  undoPayment: () => void;
  /** Bring an archived document back to the active list */
  restoreFromArchive: (id: string) => void;
  /** Remove a payment recorded by mistake */
  deletePaymentRecord: (id: string, index: number) => void;
  resetToDemo: () => void;
  /** Remove only the example documents — the user's own documents stay. */
  removeDemoDocuments: () => void;
  /**
   * Replace every document in one step (backup "Replace all"). Attachment
   * files still referenced by `docs` are kept; only the others are deleted.
   */
  replaceAllDocuments: (docs: RawDocument[]) => void;
  clearAll: () => void;
  _hydrate: () => Promise<void>;
}

// ─── Persist helper ─────────────────────────────────────

let _lastPersistedDocs: RawDocument[] | null = null;
let _persistChain: Promise<void> = Promise.resolve();
// Set when the saved documents couldn't be read at launch: nothing is written
// for the rest of the session, so the data on disk survives until a relaunch.
let _persistBlocked = false;

/**
 * Storage writes and notification syncs happen only after the saved data was
 * loaded successfully — otherwise an early or partial in-memory list would
 * overwrite the real documents or cancel their reminders.
 */
function canWrite(): boolean {
  return !_persistBlocked && useDocumentStore.getState()._hydrated;
}

/** True when the saved documents couldn't be read this session. */
export function isDocumentLoadFailed(): boolean {
  return _persistBlocked;
}

function persistDocs(documents: RawDocument[]) {
  if (!canWrite()) return;
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
        // Only revert if this is still the latest queued write. A newer write may
        // have already superseded _lastPersistedDocs and saved successfully —
        // reverting then would clobber that newer state with a stale snapshot.
        if (_lastPersistedDocs === documents) {
          if (prevPersisted !== null) {
            _lastPersistedDocs = prevPersisted;
            useDocumentStore.setState({ documents: prevPersisted });
          }
          Alert.alert(t(lang, "save_error_title"), t(lang, "save_error_msg"));
        }
      });
  });
}

/**
 * Editing or paying an example document means the user is using it for real:
 * from then on it notifies, counts and survives "Șterge exemplele". Its sample
 * payments were never theirs, so they go.
 */
function adoptIfExample(doc: RawDocument): Partial<RawDocument> {
  if (isDemoDocument(doc)) return { userEdited: true, paymentHistory: [] };
  return doc.id.startsWith(DEMO_ID_PREFIX) && !doc.userEdited ? { userEdited: true } : {};
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

// ─── Undo payment buffer ────────────────────────────────

let _payUndo: { before: RawDocument; timer: ReturnType<typeof setTimeout> } | null = null;

function keepForPayUndo(before: RawDocument) {
  if (_payUndo) clearTimeout(_payUndo.timer);
  _payUndo = { before, timer: setTimeout(() => { _payUndo = null; }, 5500) };
}

/** A later change to the same document wins over undoing its payment */
function dropPayUndo(id?: string) {
  if (_payUndo && (id === undefined || _payUndo.before.id === id)) {
    clearTimeout(_payUndo.timer);
    _payUndo = null;
  }
}

function flushUndoBuffer() {
  if (_undoBuffer) {
    // Don't cancel the cleanup timer — let it expire and delete the files.
    // Just remove the undo reference so undoDelete() can't restore this doc.
    _undoBuffer = null;
  }
}

// ─── Notification reschedule helper ──────────────────────

let _rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

async function doReschedule(documents: RawDocument[], attempt = 1) {
  if (!canWrite()) return;
  const settings = useSettingsStore?.getState?.()?.settings;
  if (settings?.notificationsEnabled) {
    try {
      // syncAllNotifications serializes runs and coalesces overlapping calls,
      // so every mutation can call it — the newest document set always wins.
      await syncAllNotifications(documents, settings.language, { discreet: settings.biometricEnabled });
    } catch (e) {
      if (__DEV__) console.warn("DocDue: notification reschedule error", e);
      if (attempt < 3) {
        // Re-read fresh state on retry so we never reschedule a stale doc set.
        _retryTimer = setTimeout(() => {
          _retryTimer = null;
          doReschedule(useDocumentStore.getState().documents, attempt + 1);
        }, attempt * 2000);
      } else if (__DEV__) {
        console.warn("DocDue: notification reschedule failed after 3 attempts — notifications may be stale");
      }
    }
  }
  updateWidgetData(documents);
}

function triggerNotificationReschedule(documents: RawDocument[], immediate = false) {
  if (_rescheduleTimer) clearTimeout(_rescheduleTimer);
  // A fresh mutation supersedes any pending failed-retry
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
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
    const lang = useSettingsStore?.getState?.()?.settings?.language || "ro";
    // A read that fails or times out is NOT "nothing saved" — treating it as a
    // first launch would write example documents over the user's real ones.
    const failLoad = () => {
      _persistBlocked = true;
      set({ documents: [], _hydrated: true });
      Alert.alert(t(lang, "load_error_title"), t(lang, "load_error_msg"));
    };
    try {
      let read = await readStorageKey(STORAGE_KEY_DOCUMENTS);
      if (!read.ok) return failLoad();
      let raw = read.value;
      // Migrate from legacy key if needed
      if (!raw) {
        read = await readStorageKey(STORAGE_KEY_DOCUMENTS_LEGACY);
        if (!read.ok) return failLoad();
        raw = read.value;
        if (raw) {
          await AsyncStorage.setItem(STORAGE_KEY_DOCUMENTS, raw);
          await AsyncStorage.removeItem(STORAGE_KEY_DOCUMENTS_LEGACY);
        }
      }
      if (raw) {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          if (__DEV__) console.warn("DocDue: corrupted JSON in AsyncStorage");
        }
        const migrated = migrateData(parsed as Parameters<typeof migrateData>[0]);
        if (migrated) {
          // migrated can be [] (user deleted all docs) — that's valid
          _lastPersistedDocs = migrated;
          // Startup notification sync is owned by the root layout's init
          // (after settings are hydrated) — scheduling here too ran it twice.
          set({ documents: migrated, _hydrated: true });
          return;
        }
        // Saved data exists but can't be understood: keep a copy for recovery
        // and start empty — never replace it with example documents.
        await AsyncStorage.setItem(STORAGE_KEY_DOCUMENTS_CORRUPT_BACKUP, raw).catch(() => {});
        _lastPersistedDocs = [];
        set({ documents: [], _hydrated: true });
        Alert.alert(t(lang, "load_corrupt_title"), t(lang, "load_corrupt_msg"));
        return;
      }
      // Genuine first launch — persist example documents in the current language
      const demo = createDemoDocuments(lang);
      set({ documents: demo, _hydrated: true });
      persistDocs(demo);
    } catch (e) {
      if (__DEV__) console.warn("DocDue: hydrate error", e);
      failLoad();
    }
  },

  addDocument: (data) => {
    const newDoc = { ...data, id: generateId() } as RawDocument;
    set((state) => ({ documents: [...state.documents, newDoc] }));
    const documents = get().documents;
    afterMutation(documents, true);
    maybeRequestReview(countTowardFreeLimit(documents)).catch(() => {});
  },

  addDocuments: (dataList) => {
    const newDocs = dataList.map((data) => ({ ...data, id: generateId() } as RawDocument));
    set((state) => ({ documents: [...state.documents, ...newDocs] }));
    afterMutation(get().documents);
  },

  updateDocument: (data) => {
    dropPayUndo(data.id);
    set((state) => ({
      documents: state.documents.map((d) =>
        d.id === data.id ? stripEnrichedFields({ ...d, ...data, ...adoptIfExample(d) }) : d
      ),
    }));
    afterMutation(get().documents, true);
  },

  deleteDocument: (id) => {
    const toDelete = get().documents.find((d) => d.id === id);
    if (!toDelete) return;
    dropPayUndo(id);
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
    // Fresh state: a stale double tap must not pay the same period twice
    const fresh = get().documents.find((d) => d.id === doc.id);
    if (!fresh) return "resolved";
    const action = defaultPayAction(fresh, getTodayString());
    get().applyPayment(fresh.id, action);
    return action.kind === "close" ? "resolved" : "paid_next";
  },

  applyPayment: (id, action) => {
    const before = get().documents.find((d) => d.id === id);
    if (!before) return false;
    const updated = applyPayAction(before, action, getTodayString());
    keepForPayUndo(before);
    set((state) => ({ documents: state.documents.map((d) => (d.id === id ? updated : d)) }));
    afterMutation(get().documents, true);
    dismissDeliveredForDocument(id).catch(() => {});
    if (action.kind !== "close") maybeRequestReview(countTowardFreeLimit(get().documents)).catch(() => {});
    return true;
  },

  undoPayment: () => {
    if (!_payUndo) return;
    const { before } = _payUndo;
    dropPayUndo();
    if (!get().documents.some((d) => d.id === before.id)) return;
    set((state) => ({ documents: state.documents.map((d) => (d.id === before.id ? before : d)) }));
    afterMutation(get().documents, true);
  },

  restoreFromArchive: (id) => {
    if (!get().documents.some((d) => d.id === id && d.resolved)) return;
    dropPayUndo(id);
    set((state) => ({
      documents: state.documents.map((d) => (d.id === id ? { ...d, resolved: undefined } : d)),
    }));
    afterMutation(get().documents, true);
  },

  deletePaymentRecord: (id, index) => {
    const doc = get().documents.find((d) => d.id === id);
    if (!doc?.paymentHistory || index < 0 || index >= doc.paymentHistory.length) return;
    dropPayUndo(id);
    const paymentHistory = doc.paymentHistory.filter((_, i) => i !== index);
    set((state) => ({ documents: state.documents.map((d) => (d.id === id ? { ...d, paymentHistory } : d)) }));
    afterMutation(get().documents);
  },

  resetToDemo: () => {
    const lang = useSettingsStore?.getState?.()?.settings?.language || "ro";
    const demo = createDemoDocuments(lang);
    set({ documents: demo });
    afterMutation(demo);
  },

  removeDemoDocuments: () => {
    const docs = get().documents;
    const demo = docs.filter(isDemoDocument);
    if (demo.length === 0) return;
    for (const doc of demo) cleanupAttachments(doc);
    set({ documents: docs.filter((d) => !isDemoDocument(d)) });
    afterMutation(get().documents, true);
  },

  replaceAllDocuments: (incoming) => {
    // Unique ids even if a malformed backup repeats one
    const seen = new Set<string>();
    const docs = incoming.map((d) => {
      const doc = stripEnrichedFields(d);
      if (!doc.id || seen.has(doc.id)) return { ...doc, id: generateId() };
      seen.add(doc.id);
      return doc;
    });
    const stillUsed = new Set(docs.flatMap((d) => (d.attachments || []).map((a) => a.uri)));
    for (const old of get().documents) {
      for (const att of old.attachments || []) {
        if (!stillUsed.has(att.uri)) FileSystem.deleteAsync(att.uri, { idempotent: true }).catch(() => {});
      }
    }
    // A pending undo would re-insert a document from the old set
    flushUndoBuffer();
    dropPayUndo();
    set({ documents: docs });
    afterMutation(docs, true);
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
  dropPayUndo();
  if (_rescheduleTimer) {
    clearTimeout(_rescheduleTimer);
    _rescheduleTimer = null;
  }
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
}

// `today` is a dependency so days remaining / status recompute when the date
// changes (midnight, or the app resumed the next day) — not only on edits.

export function useEnrichedDocuments(): EnrichedDocument[] {
  const documents = useDocumentStore((s) => s.documents);
  const today = useToday();
  return useMemo(() =>
    documents
      .filter((d) => !d.resolved)
      .map((d) => enrichDocument(d))
      .sort((a, b) => a._daysUntil - b._daysUntil),
    [documents, today]
  );
}

export function useEnrichedDocument(id: string | undefined): EnrichedDocument | undefined {
  const doc = useDocumentStore((s) => s.documents.find((d) => d.id === id));
  const today = useToday();
  return useMemo(() => {
    if (!doc) return undefined;
    return enrichDocument(doc);
  }, [doc, today]);
}

/**
 * Counts and money due for the dashboard. Example documents are left out —
 * every number reflects only the user's own documents (same set as reminders).
 */
export function computeGlobalStats(enriched: EnrichedDocument[]): GlobalStats {
  let expired = 0, warning = 0, ok = 0, totalDue = 0;
  for (const d of enriched) {
    if (isDemoDocument(d)) continue;
    if (d._status === "expired") expired++;
    else if (d._status === "warning") warning++;
    else ok++;
    if (d._daysUntil >= 0 && d._daysUntil <= PAYMENT_WINDOW_DAYS && d.amt) {
      totalDue += d.amt || 0;
    }
  }
  return { expired, warning, ok, totalDue, urgentCount: expired + warning };
}

export function computeCategoryStats(enriched: EnrichedDocument[]): Record<CategoryId, CategoryStats> {
  const result = {} as Record<CategoryId, CategoryStats>;
  (Object.keys(CATEGORIES) as CategoryId[]).forEach((catId) => {
    result[catId] = { total: 0, expired: 0, warning: 0, ok: 0, totalDue: 0 };
  });
  for (const d of enriched) {
    const cat = result[d.cat];
    if (!cat || isDemoDocument(d)) continue;
    cat.total++;
    if (d._status === "expired") cat.expired++;
    else if (d._status === "warning") cat.warning++;
    else cat.ok++;
    if (d._daysUntil >= 0 && d._daysUntil <= PAYMENT_WINDOW_DAYS && d.amt) {
      cat.totalDue += d.amt || 0;
    }
  }
  return result;
}

// Enriched docs are passed in (callers already hold them) so we never run a
// second enrichment pass here — on the home screen this avoids enriching 3x/render.
export function useGlobalStats(enriched: EnrichedDocument[]): GlobalStats {
  return useMemo(() => computeGlobalStats(enriched), [enriched]);
}

export function useCategoryStats(enriched: EnrichedDocument[]): Record<CategoryId, CategoryStats> {
  return useMemo(() => computeCategoryStats(enriched), [enriched]);
}
