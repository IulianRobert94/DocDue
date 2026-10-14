/**
 * DocDue — Maintenance journal store tests (useItemStore)
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

import type { TrackedItem } from "../core/constants";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

type ItemStore = typeof import("../stores/useItemStore").useItemStore;

/** Fresh store module + storage pre-filled with `saved`. */
function load(saved: Record<string, string> = {}) {
  let loaded!: {
    useItemStore: ItemStore;
    AsyncStorage: { getItem: jest.Mock; _getStore: () => Record<string, string> };
  };
  jest.isolateModules(() => {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    AsyncStorage._setStore({ ...saved });
    loaded = { AsyncStorage, useItemStore: require("../stores/useItemStore").useItemStore };
  });
  loaded.useItemStore.setState({ _hydrated: true });
  return loaded;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const newBattery = {
  name: "Baterie", cat: "vehicule" as const, asset: "Dacia Duster",
  start: "2023-05-01", startKm: 112000, cost: 520, note: "Varta 74Ah",
};

describe("useItemStore actions", () => {
  it("adding an item records its first install as in use", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);

    const item = useItemStore.getState().items.find((i) => i.id === id)!;
    expect(item.name).toBe("Baterie");
    expect(item.asset).toBe("Dacia Duster");
    expect(item.installs).toHaveLength(1);
    expect(item.installs[0]).toMatchObject({ start: "2023-05-01", startKm: 112000, cost: 520, note: "Varta 74Ah" });
    expect(item.installs[0].end).toBeUndefined();
  });

  it("replacing closes the current install and starts a new one the same day", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);

    const ok = useItemStore.getState().replaceCurrent(id, {
      date: "2025-05-01", km: 140000, reason: "broke", cost: 600, note: "Bosch S4",
    });

    const [first, second] = useItemStore.getState().items[0].installs;
    expect(ok).toBe(true);
    expect(first).toMatchObject({ end: "2025-05-01", endKm: 140000, endReason: "broke" });
    expect(second).toMatchObject({ start: "2025-05-01", startKm: 140000, cost: 600, note: "Bosch S4" });
    expect(second.end).toBeUndefined();
  });

  it("refuses a replacement dated before the current install started", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);

    const ok = useItemStore.getState().replaceCurrent(id, { date: "2023-04-01", reason: "replaced" });

    expect(ok).toBe(false);
    expect(useItemStore.getState().items[0].installs).toHaveLength(1);
  });

  it("'it broke' ends the install without a replacement; a new one can be installed later", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);

    expect(useItemStore.getState().markBroken(id, { date: "2025-01-10", km: 130000 })).toBe(true);
    expect(useItemStore.getState().items[0].installs[0]).toMatchObject({ end: "2025-01-10", endKm: 130000, endReason: "broke" });

    expect(useItemStore.getState().startNewInstall(id, { date: "2025-01-15", km: 130050, cost: 610 })).toBe(true);
    expect(useItemStore.getState().items[0].installs[1]).toMatchObject({ start: "2025-01-15", startKm: 130050, cost: 610 });
  });

  it("won't start a second install while one is in use", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);

    expect(useItemStore.getState().startNewInstall(id, { date: "2025-01-15" })).toBe(false);
    expect(useItemStore.getState().items[0].installs).toHaveLength(1);
  });

  it("editing an item changes its details but keeps the history", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);

    useItemStore.getState().updateItem(id, { name: "Baterie 12V", asset: "Logan" });

    const item = useItemStore.getState().items[0];
    expect(item.name).toBe("Baterie 12V");
    expect(item.asset).toBe("Logan");
    expect(item.installs).toHaveLength(1);
  });

  it("deletes a single history entry, and whole items", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);
    useItemStore.getState().replaceCurrent(id, { date: "2025-05-01", reason: "replaced" });
    const firstInstallId = useItemStore.getState().items[0].installs[0].id;

    useItemStore.getState().deleteInstall(id, firstInstallId);
    expect(useItemStore.getState().items[0].installs.map((i) => i.start)).toEqual(["2025-05-01"]);

    useItemStore.getState().deleteItem(id);
    expect(useItemStore.getState().items).toEqual([]);
  });

  it("deleting a mistaken replacement reopens the previous period", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);
    useItemStore.getState().replaceCurrent(id, { date: "2025-05-01", km: 140000, reason: "replaced" });
    const mistaken = useItemStore.getState().items[0].installs[1];

    useItemStore.getState().deleteInstall(id, mistaken.id);

    const installs = useItemStore.getState().items[0].installs;
    expect(installs).toHaveLength(1);
    expect(installs[0].end).toBeUndefined();
    expect(installs[0].endKm).toBeUndefined();
    expect(installs[0].endReason).toBeUndefined();
  });

  it("adds a past period before the current history", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery); // in use since 2023-05-01

    const ok = useItemStore.getState().addPastInstall(id, {
      start: "2019-04-01", end: "2023-05-01", startKm: 40000, endKm: 112000, reason: "broke", cost: 400,
    });

    const installs = useItemStore.getState().items[0].installs;
    expect(ok).toBe(true);
    expect(installs.map((i) => [i.start, i.end])).toEqual([["2019-04-01", "2023-05-01"], ["2023-05-01", undefined]]);
    expect(installs[0]).toMatchObject({ endReason: "broke", startKm: 40000, endKm: 112000, cost: 400 });
  });

  it("refuses a past period that overlaps the existing history or ends before it starts", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery); // in use since 2023-05-01

    expect(useItemStore.getState().addPastInstall(id, { start: "2022-01-01", end: "2023-06-01", reason: "replaced" })).toBe(false);
    expect(useItemStore.getState().addPastInstall(id, { start: "2022-01-01", end: "2021-01-01", reason: "replaced" })).toBe(false);
    expect(useItemStore.getState().items[0].installs).toHaveLength(1);
  });

  it("saves the journal under its own storage key", async () => {
    const { useItemStore, AsyncStorage } = load();
    useItemStore.getState().addItem(newBattery);
    await flush();

    const saved = JSON.parse(AsyncStorage._getStore().dt12_items);
    expect(saved.version).toBe(1);
    expect(saved.items[0].name).toBe("Baterie");
  });

  it("merging a backup adds only items that aren't already there", () => {
    const { useItemStore } = load();
    const id = useItemStore.getState().addItem(newBattery);
    const existing = useItemStore.getState().items[0];
    const incoming: TrackedItem = { ...existing, id: "other", name: "Anvelope iarnă" };

    const added = useItemStore.getState().mergeItems([existing, incoming]);

    expect(added).toBe(1);
    expect(useItemStore.getState().items.map((i) => i.id)).toEqual([id, "other"]);
  });
});

describe("useItemStore loading", () => {
  const valid: TrackedItem = {
    id: "i1", name: "Baterie", cat: "vehicule", createdAt: "2023-05-01",
    installs: [{ id: "a", start: "2023-05-01" }],
  };

  it("loads saved items and drops malformed ones", async () => {
    const saved = JSON.stringify({ version: 1, items: [valid, { id: "bad" }] });
    const { useItemStore } = load({ dt12_items: saved });
    useItemStore.setState({ _hydrated: false });

    await useItemStore.getState()._hydrate();

    expect(useItemStore.getState().items).toEqual([valid]);
  });

  it("keeps a raw copy when some saved items had to be dropped", async () => {
    const saved = JSON.stringify({ version: 1, items: [valid, { id: "bad" }] });
    const { useItemStore, AsyncStorage } = load({ dt12_items: saved });
    useItemStore.setState({ _hydrated: false });

    await useItemStore.getState()._hydrate();
    await flush();

    expect(AsyncStorage._getStore().dt12_items_corrupt_backup).toBe(saved);
  });

  it("unreadable saved data is backed up and the journal starts empty", async () => {
    const { useItemStore, AsyncStorage } = load({ dt12_items: "{oops" });
    useItemStore.setState({ _hydrated: false });

    await useItemStore.getState()._hydrate();
    await flush();

    expect(AsyncStorage._getStore().dt12_items_corrupt_backup).toBe("{oops");
    expect(useItemStore.getState().items).toEqual([]);
  });

  it("a storage read error never lets later changes overwrite the saved journal", async () => {
    const saved = JSON.stringify({ version: 1, items: [valid] });
    const { useItemStore, AsyncStorage } = load({ dt12_items: saved });
    useItemStore.setState({ _hydrated: false });
    AsyncStorage.getItem.mockImplementation(() => Promise.reject(new Error("disk busy")));

    await useItemStore.getState()._hydrate();
    useItemStore.getState().addItem(newBattery);
    await flush();

    expect(AsyncStorage._getStore().dt12_items).toBe(saved);
  });
});
