/**
 * DocDue — Hydration safety tests
 *
 * Loading saved data must never destroy it: a slow or failing storage read,
 * or unreadable saved data, must not be treated as a "first launch" that
 * writes example documents / default settings over the user's real data.
 *
 * Each test loads fresh store modules (jest.isolateModules) because the
 * stores keep module-level state about whether loading succeeded.
 */

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
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
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
  getAvailablePurchases: jest.fn(() => Promise.resolve([])),
  requestPurchase: jest.fn(() => Promise.resolve()),
  finishTransaction: jest.fn(() => Promise.resolve()),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
}));

import type { RawDocument } from "../core/constants";
import { DEFAULT_SETTINGS } from "../core/constants";

// React Native defines __DEV__ globally; the error paths under test read it.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

type DocumentStore = typeof import("../stores/useDocumentStore").useDocumentStore;
type SettingsStore = typeof import("../stores/useSettingsStore").useSettingsStore;

interface Loaded {
  AsyncStorage: {
    getItem: jest.Mock;
    _getStore: () => Record<string, string>;
  };
  Alert: { alert: jest.Mock };
  useDocumentStore: DocumentStore;
  useSettingsStore: SettingsStore;
}

/** Fresh store modules + storage pre-filled with `saved`. */
function load(saved: Record<string, string>): Loaded {
  let loaded!: Loaded;
  jest.isolateModules(() => {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    AsyncStorage._setStore({ ...saved });
    loaded = {
      AsyncStorage,
      Alert: require("react-native").Alert,
      useDocumentStore: require("../stores/useDocumentStore").useDocumentStore,
      useSettingsStore: require("../stores/useSettingsStore").useSettingsStore,
    };
  });
  return loaded;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const realDoc: RawDocument = {
  id: "u1", cat: "vehicule", type: "RCA", title: "RCA Logan",
  due: "2026-06-01", amt: 900, rec: "annual",
};
const savedDocs = JSON.stringify({ version: 12, documents: [realDoc] });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-01-01T10:00:00"));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("document hydration never destroys saved data", () => {
  it("first launch (nothing saved) shows the 8 example documents", async () => {
    const { useDocumentStore } = load({});

    await useDocumentStore.getState()._hydrate();

    const docs = useDocumentStore.getState().documents;
    expect(docs).toHaveLength(8);
    expect(docs.every((d) => d.id.startsWith("demo_"))).toBe(true);
  });

  it("loads the saved documents normally", async () => {
    const { useDocumentStore } = load({ dt12_docs: savedDocs });

    await useDocumentStore.getState()._hydrate();

    expect(useDocumentStore.getState().documents).toEqual([realDoc]);
  });

  it("a storage read error does not let later edits overwrite the saved documents", async () => {
    const { useDocumentStore, AsyncStorage, Alert } = load({ dt12_docs: savedDocs });
    AsyncStorage.getItem.mockImplementation(() => Promise.reject(new Error("disk busy")));

    await useDocumentStore.getState()._hydrate();
    const { id, ...rest } = realDoc;
    useDocumentStore.getState().addDocument({ ...rest, title: "Nou" });
    await flush();

    expect(AsyncStorage._getStore().dt12_docs).toBe(savedDocs);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it("a read that times out is not mistaken for a first launch", async () => {
    const { useDocumentStore, AsyncStorage } = load({ dt12_docs: savedDocs });
    AsyncStorage.getItem.mockImplementation(() => new Promise(() => { /* never answers */ }));

    const hydrating = useDocumentStore.getState()._hydrate();
    await jest.advanceTimersByTimeAsync(60_000);
    await hydrating;
    await flush();

    expect(useDocumentStore.getState().documents.some((d) => d.id.startsWith("demo_"))).toBe(false);
    expect(AsyncStorage._getStore().dt12_docs).toBe(savedDocs);
  });

  it("nothing is saved before loading has finished", async () => {
    const { useDocumentStore, AsyncStorage } = load({ dt12_docs: savedDocs });
    let finishRead: (v: string) => void = () => {};
    AsyncStorage.getItem.mockImplementationOnce(() => new Promise<string>((resolve) => { finishRead = resolve; }));

    const hydrating = useDocumentStore.getState()._hydrate();
    const { id, ...rest } = realDoc;
    useDocumentStore.getState().addDocument({ ...rest, title: "Prea devreme" });
    await flush();
    expect(AsyncStorage._getStore().dt12_docs).toBe(savedDocs);

    finishRead(savedDocs);
    await hydrating;
    expect(useDocumentStore.getState().documents).toEqual([realDoc]);
  });

  it("after a failed load, edits don't touch the scheduled reminders", async () => {
    const { useDocumentStore, AsyncStorage } = load({ dt12_docs: savedDocs });
    AsyncStorage.getItem.mockImplementation(() => Promise.reject(new Error("disk busy")));
    const Notifications = require("expo-notifications");

    await useDocumentStore.getState()._hydrate();
    Notifications.getAllScheduledNotificationsAsync.mockClear();
    const { id, ...rest } = realDoc;
    useDocumentStore.getState().addDocument({ ...rest, title: "Nou" });
    await jest.advanceTimersByTimeAsync(2000);

    expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });

  it("unreadable saved data is backed up instead of being replaced by examples", async () => {
    const { useDocumentStore, AsyncStorage } = load({ dt12_docs: "{not json" });

    await useDocumentStore.getState()._hydrate();
    await flush();

    expect(AsyncStorage._getStore().dt12_docs_corrupt_backup).toBe("{not json");
    expect(useDocumentStore.getState().documents).toEqual([]);
  });
});

describe("settings hydration never destroys saved settings", () => {
  it("a failed settings read keeps the saved settings on disk", async () => {
    const saved = JSON.stringify({ ...DEFAULT_SETTINGS, biometricEnabled: true, language: "en" });
    const { useSettingsStore, AsyncStorage } = load({ dt12_settings: saved });
    AsyncStorage.getItem.mockImplementation(() => Promise.reject(new Error("disk busy")));

    await useSettingsStore.getState()._hydrate();
    useSettingsStore.getState().updateSetting("streakDays", 3);
    await flush();

    expect(AsyncStorage._getStore().dt12_settings).toBe(saved);
  });

  it("loads the saved settings normally", async () => {
    const saved = JSON.stringify({ ...DEFAULT_SETTINGS, biometricEnabled: true, language: "en" });
    const { useSettingsStore } = load({ dt12_settings: saved });

    await useSettingsStore.getState()._hydrate();

    expect(useSettingsStore.getState().settings.biometricEnabled).toBe(true);
    expect(useSettingsStore.getState().settings.language).toBe("en");
  });
});
