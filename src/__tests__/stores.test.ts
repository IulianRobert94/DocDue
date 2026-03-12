/**
 * DocDue — Store Tests
 *
 * Tests for useDocumentStore actions: add, update, delete, markAsPaid,
 * resetToDemo, clearAll, hydration, and computed selectors logic.
 */

// ─── Mocks (must be before imports) ─────────────────────

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  NativeModules: {},
  Platform: { OS: "ios" },
}));

jest.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] || null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store = {};
        return Promise.resolve();
      }),
      _getStore: () => store,
      _setStore: (s: Record<string, string>) => { store = s; },
    },
  };
});

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: jest.fn(() => Promise.resolve()),
  documentDirectory: "/mock/documents/",
}));

jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("mock-id")),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "denied" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "denied" })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

jest.mock("expo-store-review", () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  requestReview: jest.fn(() => Promise.resolve()),
}));

jest.mock("react-native-iap", () => ({
  initConnection: jest.fn(() => Promise.resolve()),
  endConnection: jest.fn(() => Promise.resolve()),
  getProducts: jest.fn(() => Promise.resolve([])),
  getAvailablePurchases: jest.fn(() => Promise.resolve([])),
  requestPurchase: jest.fn(() => Promise.resolve()),
  finishTransaction: jest.fn(() => Promise.resolve()),
}));

// ─── Imports ────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDocumentStore } from "../stores/useDocumentStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import type { RawDocument, EnrichedDocument } from "../core/constants";
import { addDaysToDate, getTodayString } from "../core/dateUtils";
import { enrichDocument } from "../core/enrichment";
import { getRecurrenceDays } from "../core/formatters";
import { addMonthsToDate } from "../core/dateUtils";

// ─── Helper ─────────────────────────────────────────────

function makeDoc(overrides: Partial<RawDocument> = {}): Omit<RawDocument, "id"> {
  return {
    cat: "vehicule" as const,
    type: "RCA",
    title: "Test Doc",
    due: addDaysToDate(getTodayString(), 30),
    amt: 500,
    rec: "annual" as const,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────

describe("useDocumentStore", () => {
  beforeEach(() => {
    // Reset store to empty state
    useDocumentStore.setState({ documents: [], _hydrated: true });
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clear any pending debounce timers from store mutations
    jest.runAllTimers();
  });

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe("addDocument", () => {
    it("adds a document with a generated id", () => {
      const data = makeDoc();
      useDocumentStore.getState().addDocument(data);

      const docs = useDocumentStore.getState().documents;
      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBeTruthy();
      expect(docs[0].title).toBe("Test Doc");
      expect(docs[0].cat).toBe("vehicule");
    });

    it("generates unique IDs for each document", () => {
      useDocumentStore.getState().addDocument(makeDoc({ title: "A" }));
      useDocumentStore.getState().addDocument(makeDoc({ title: "B" }));

      const docs = useDocumentStore.getState().documents;
      expect(docs).toHaveLength(2);
      expect(docs[0].id).not.toBe(docs[1].id);
    });

    it("persists to AsyncStorage after add", () => {
      useDocumentStore.getState().addDocument(makeDoc());
      // addDocument calls persistDocs synchronously (the AsyncStorage.setItem is async but called immediately)
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe("addDocuments (bulk)", () => {
    it("adds multiple documents at once", () => {
      const batch = [
        makeDoc({ title: "Doc A" }),
        makeDoc({ title: "Doc B" }),
        makeDoc({ title: "Doc C" }),
      ];
      useDocumentStore.getState().addDocuments(batch);

      expect(useDocumentStore.getState().documents).toHaveLength(3);
    });

    it("each bulk document gets a unique ID", () => {
      const batch = [makeDoc({ title: "A" }), makeDoc({ title: "B" })];
      useDocumentStore.getState().addDocuments(batch);

      const docs = useDocumentStore.getState().documents;
      const ids = docs.map((d) => d.id);
      expect(new Set(ids).size).toBe(2);
    });
  });

  describe("updateDocument", () => {
    it("updates an existing document", () => {
      useDocumentStore.getState().addDocument(makeDoc({ title: "Original" }));
      const doc = useDocumentStore.getState().documents[0];

      useDocumentStore.getState().updateDocument({ ...doc, title: "Updated" });

      const updated = useDocumentStore.getState().documents[0];
      expect(updated.title).toBe("Updated");
      expect(updated.id).toBe(doc.id);
    });

    it("does not affect other documents", () => {
      useDocumentStore.getState().addDocument(makeDoc({ title: "Keep" }));
      useDocumentStore.getState().addDocument(makeDoc({ title: "Change" }));

      const docs = useDocumentStore.getState().documents;
      useDocumentStore.getState().updateDocument({ ...docs[1], title: "Changed" });

      const result = useDocumentStore.getState().documents;
      expect(result[0].title).toBe("Keep");
      expect(result[1].title).toBe("Changed");
    });

    it("strips enriched fields before saving", () => {
      useDocumentStore.getState().addDocument(makeDoc());
      const doc = useDocumentStore.getState().documents[0];

      // Simulate passing an enriched document to update
      const enriched = { ...doc, _daysUntil: 30, _status: "ok" } as EnrichedDocument;
      useDocumentStore.getState().updateDocument(enriched);

      const saved = useDocumentStore.getState().documents[0];
      expect((saved as any)._daysUntil).toBeUndefined();
      expect((saved as any)._status).toBeUndefined();
    });
  });

  describe("deleteDocument", () => {
    it("removes a document by id", () => {
      useDocumentStore.getState().addDocument(makeDoc({ title: "To Delete" }));
      const doc = useDocumentStore.getState().documents[0];

      useDocumentStore.getState().deleteDocument(doc.id);

      expect(useDocumentStore.getState().documents).toHaveLength(0);
    });

    it("only removes the targeted document", () => {
      useDocumentStore.getState().addDocument(makeDoc({ title: "Keep" }));
      useDocumentStore.getState().addDocument(makeDoc({ title: "Delete" }));

      const docs = useDocumentStore.getState().documents;
      useDocumentStore.getState().deleteDocument(docs[1].id);

      const remaining = useDocumentStore.getState().documents;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].title).toBe("Keep");
    });

    it("does nothing for non-existent id", () => {
      useDocumentStore.getState().addDocument(makeDoc());
      useDocumentStore.getState().deleteDocument("non-existent-id");

      expect(useDocumentStore.getState().documents).toHaveLength(1);
    });
  });

  describe("markAsPaid", () => {
    it("advances due date for recurring document and returns 'paid_next'", () => {
      useDocumentStore.getState().addDocument(makeDoc({
        title: "Monthly Bill",
        due: "2026-03-01",
        rec: "monthly",
        amt: 100,
      }));
      const doc = useDocumentStore.getState().documents[0];
      const enriched = enrichDocument(doc);

      const result = useDocumentStore.getState().markAsPaid(enriched);

      expect(result).toBe("paid_next");
      const updated = useDocumentStore.getState().documents[0];
      expect(updated.due).toBe("2026-04-01"); // Advanced by 1 month
    });

    it("advances annual doc by 12 months", () => {
      useDocumentStore.getState().addDocument(makeDoc({
        title: "Annual RCA",
        due: "2026-01-15",
        rec: "annual",
      }));
      const doc = useDocumentStore.getState().documents[0];
      const enriched = enrichDocument(doc);

      useDocumentStore.getState().markAsPaid(enriched);

      const updated = useDocumentStore.getState().documents[0];
      expect(updated.due).toBe("2027-01-15");
    });

    it("advances weekly doc by 7 days", () => {
      useDocumentStore.getState().addDocument(makeDoc({
        title: "Weekly",
        due: "2026-03-01",
        rec: "weekly",
      }));
      const doc = useDocumentStore.getState().documents[0];
      const enriched = enrichDocument(doc);

      useDocumentStore.getState().markAsPaid(enriched);

      const updated = useDocumentStore.getState().documents[0];
      expect(updated.due).toBe("2026-03-08");
    });

    it("removes non-recurring document and returns 'resolved'", () => {
      useDocumentStore.getState().addDocument(makeDoc({
        title: "One-time fine",
        rec: "none",
      }));
      const doc = useDocumentStore.getState().documents[0];
      const enriched = enrichDocument(doc);

      const result = useDocumentStore.getState().markAsPaid(enriched);

      expect(result).toBe("resolved");
      expect(useDocumentStore.getState().documents).toHaveLength(0);
    });

    it("appends payment history for recurring documents", () => {
      useDocumentStore.getState().addDocument(makeDoc({
        title: "Monthly",
        due: "2026-03-01",
        rec: "monthly",
        amt: 200,
      }));
      const doc = useDocumentStore.getState().documents[0];
      const enriched = enrichDocument(doc);

      useDocumentStore.getState().markAsPaid(enriched);

      const updated = useDocumentStore.getState().documents[0];
      expect(updated.paymentHistory).toHaveLength(1);
      expect(updated.paymentHistory![0].dueDate).toBe("2026-03-01");
      expect(updated.paymentHistory![0].amt).toBe(200);
      expect(updated.paymentHistory![0].date).toBe(getTodayString());
    });

    it("preserves existing payment history", () => {
      const existingHistory = [
        { date: "2026-01-01", dueDate: "2026-01-01", amt: 100 },
        { date: "2026-02-01", dueDate: "2026-02-01", amt: 100 },
      ];
      useDocumentStore.getState().addDocument(makeDoc({
        title: "Monthly",
        due: "2026-03-01",
        rec: "monthly",
        amt: 100,
        paymentHistory: existingHistory,
      }));
      const doc = useDocumentStore.getState().documents[0];
      const enriched = enrichDocument(doc);

      useDocumentStore.getState().markAsPaid(enriched);

      const updated = useDocumentStore.getState().documents[0];
      expect(updated.paymentHistory).toHaveLength(3);
    });

    it("returns 'resolved' for non-existent document", () => {
      const fakeDoc: EnrichedDocument = {
        id: "non-existent",
        cat: "vehicule",
        type: "RCA",
        title: "Ghost",
        due: "2026-01-01",
        amt: null,
        rec: "none",
        _daysUntil: -10,
        _status: "expired",
      };
      const result = useDocumentStore.getState().markAsPaid(fakeDoc);
      expect(result).toBe("resolved");
    });
  });

  describe("resetToDemo", () => {
    it("replaces documents with demo data", () => {
      useDocumentStore.getState().addDocument(makeDoc({ title: "Custom" }));
      useDocumentStore.getState().resetToDemo();

      const docs = useDocumentStore.getState().documents;
      expect(docs.length).toBeGreaterThan(1);
      // Demo docs should not include our custom doc
      expect(docs.find((d) => d.title === "Custom")).toBeUndefined();
    });
  });

  describe("clearAll", () => {
    it("removes all documents", () => {
      useDocumentStore.getState().addDocument(makeDoc({ title: "A" }));
      useDocumentStore.getState().addDocument(makeDoc({ title: "B" }));

      useDocumentStore.getState().clearAll();

      expect(useDocumentStore.getState().documents).toHaveLength(0);
    });
  });
});

// ─── Settings Store ─────────────────────────────────────

describe("useSettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: {
        theme: "dark",
        currency: "RON",
        language: "ro",
        reminderDays: [7, 3, 1],
        notificationsEnabled: false,
        biometricEnabled: false,
        lastBackupDate: null,
        includeAttachmentsInBackup: false,
        isPremium: false,
        firstOpenDate: null,
        reviewPrompted: false,
        customSubtypes: { vehicule: [], personal: [], casa: [], financiar: [] },
      },
      _hydrated: true,
    });
    jest.clearAllMocks();
  });

  it("updates a single setting", () => {
    useSettingsStore.getState().updateSetting("currency", "EUR");
    expect(useSettingsStore.getState().settings.currency).toBe("EUR");
  });

  it("preserves other settings when updating one", () => {
    useSettingsStore.getState().updateSetting("language", "en");
    const s = useSettingsStore.getState().settings;
    expect(s.language).toBe("en");
    expect(s.currency).toBe("RON");
    expect(s.theme).toBe("dark");
  });

  it("persists to AsyncStorage on update", () => {
    useSettingsStore.getState().updateSetting("currency", "USD");
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it("toggles boolean settings", () => {
    useSettingsStore.getState().updateSetting("biometricEnabled", true);
    expect(useSettingsStore.getState().settings.biometricEnabled).toBe(true);

    useSettingsStore.getState().updateSetting("biometricEnabled", false);
    expect(useSettingsStore.getState().settings.biometricEnabled).toBe(false);
  });

  it("updates reminder days array", () => {
    useSettingsStore.getState().updateSetting("reminderDays", [14, 7]);
    expect(useSettingsStore.getState().settings.reminderDays).toEqual([14, 7]);
  });

  it("updates premium status", () => {
    expect(useSettingsStore.getState().settings.isPremium).toBe(false);
    useSettingsStore.getState().updateSetting("isPremium", true);
    expect(useSettingsStore.getState().settings.isPremium).toBe(true);
  });
});

// ─── Computed Stats (unit-level, no React hooks) ────────

describe("computed stats logic", () => {
  it("calculates global stats correctly", () => {
    const docs: RawDocument[] = [
      { id: "1", cat: "vehicule", type: "RCA", title: "Expired", due: addDaysToDate(getTodayString(), -5), amt: 500, rec: "annual" },
      { id: "2", cat: "casa", type: "Gaz", title: "Warning", due: addDaysToDate(getTodayString(), 3), amt: 100, rec: "monthly" },
      { id: "3", cat: "personal", type: "Pașaport", title: "OK", due: addDaysToDate(getTodayString(), 200), amt: null, rec: "none" },
    ];
    const enriched = docs.map((d) => enrichDocument(d));

    let expired = 0, warning = 0, ok = 0;
    for (const d of enriched) {
      if (d._status === "expired") expired++;
      else if (d._status === "warning") warning++;
      else ok++;
    }

    expect(expired).toBe(1);
    expect(warning).toBe(1);
    expect(ok).toBe(1);
  });

  it("calculates category stats correctly", () => {
    const docs: RawDocument[] = [
      { id: "1", cat: "vehicule", type: "RCA", title: "A", due: addDaysToDate(getTodayString(), -5), amt: 500, rec: "annual" },
      { id: "2", cat: "vehicule", type: "ITP", title: "B", due: addDaysToDate(getTodayString(), 50), amt: 200, rec: "annual" },
      { id: "3", cat: "casa", type: "Gaz", title: "C", due: addDaysToDate(getTodayString(), 3), amt: 100, rec: "monthly" },
    ];
    const enriched = docs.map((d) => enrichDocument(d));

    const vehiculeDocs = enriched.filter((d) => d.cat === "vehicule");
    const casaDocs = enriched.filter((d) => d.cat === "casa");

    expect(vehiculeDocs).toHaveLength(2);
    expect(casaDocs).toHaveLength(1);
    expect(vehiculeDocs.filter((d) => d._status === "expired")).toHaveLength(1);
    expect(vehiculeDocs.filter((d) => d._status === "ok")).toHaveLength(1);
  });

  it("urgentCount = expired + warning", () => {
    const docs: RawDocument[] = [
      { id: "1", cat: "vehicule", type: "RCA", title: "Exp", due: addDaysToDate(getTodayString(), -1), amt: null, rec: "annual" },
      { id: "2", cat: "vehicule", type: "ITP", title: "Warn", due: addDaysToDate(getTodayString(), 5), amt: null, rec: "monthly" },
      { id: "3", cat: "vehicule", type: "CASCO", title: "OK", due: addDaysToDate(getTodayString(), 100), amt: null, rec: "annual" },
    ];
    const enriched = docs.map((d) => enrichDocument(d));
    const expired = enriched.filter((d) => d._status === "expired").length;
    const warning = enriched.filter((d) => d._status === "warning").length;
    const urgentCount = expired + warning;

    expect(urgentCount).toBe(2);
  });
});
