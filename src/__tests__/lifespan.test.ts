/**
 * DocDue — Maintenance journal ("Jurnal întreținere") logic tests
 *
 * Pure lifespan math: how long each installed part lasted, averages,
 * the estimate for the next replacement, and list ordering/grouping.
 * Expected values are hand-computed (see dates in each fixture).
 */

import type { TrackedItem } from "../core/constants";
import { daysBetween } from "../core/dateUtils";
import {
  installDurationDays,
  installDurationKm,
  getItemStats,
  formatDuration,
  sortItems,
  groupItemsByAsset,
  isValidItem,
  formatEstimateWhen,
  minimumKm,
  formatKm,
} from "../core/lifespan";

// Car battery: broke after 1156 days (52,000 km), next one replaced after
// 731 days (28,000 km), current one in use since 2025-05-01.
const battery: TrackedItem = {
  id: "i1", name: "Baterie", cat: "vehicule", asset: "Dacia Duster", createdAt: "2020-03-01",
  installs: [
    { id: "a", start: "2020-03-01", startKm: 60000, end: "2023-05-01", endKm: 112000, endReason: "broke", cost: 450 },
    { id: "b", start: "2023-05-01", startKm: 112000, end: "2025-05-01", endKm: 140000, endReason: "replaced", cost: 520 },
    { id: "c", start: "2025-05-01", startKm: 140000, cost: 600 },
  ],
};
const TODAY = "2026-05-01";

describe("daysBetween", () => {
  it.each([
    ["2020-03-01", "2023-05-01", 1156],
    ["2023-05-01", "2025-05-01", 731],
    ["2026-03-28", "2026-03-30", 2], // across the DST change in Romania
    ["2026-05-01", "2026-05-01", 0],
  ])("%s → %s = %i days", (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });
});

describe("install durations", () => {
  it("a finished install lasted from start to end", () => {
    expect(installDurationDays(battery.installs[0], TODAY)).toBe(1156);
  });

  it("the install in use counts up to today", () => {
    expect(installDurationDays(battery.installs[2], TODAY)).toBe(365);
  });

  it("km are counted only when both readings exist", () => {
    expect(installDurationKm(battery.installs[0])).toBe(52000);
    expect(installDurationKm(battery.installs[2])).toBeNull();
  });

  it("an odometer that went backwards is ignored, not negative", () => {
    expect(installDurationKm({ id: "x", start: "2024-01-01", startKm: 50000, end: "2025-01-01", endKm: 40000 })).toBeNull();
  });
});

describe("getItemStats", () => {
  it("summarises lifespans, km, cost and breakdowns", () => {
    const stats = getItemStats(battery, TODAY);
    expect(stats.isInUse).toBe(true);
    expect(stats.current?.id).toBe("c");
    expect(stats.currentAgeDays).toBe(365);
    expect(stats.completed).toBe(2);
    expect(stats.avgDays).toBe(943.5);
    expect(stats.minDays).toBe(731);
    expect(stats.maxDays).toBe(1156);
    expect(stats.avgKm).toBe(40000);
    expect(stats.totalCost).toBe(1570);
    expect(stats.brokeCount).toBe(1);
  });

  it("estimates the next replacement from the average lifespan", () => {
    expect(getItemStats(battery, TODAY).estimatedNext).toBe("2027-12-01");
  });

  it("gives no estimate before anything has been replaced", () => {
    const fresh: TrackedItem = { ...battery, installs: [{ id: "c", start: "2025-05-01" }] };
    const stats = getItemStats(fresh, TODAY);
    expect(stats.completed).toBe(0);
    expect(stats.avgDays).toBeNull();
    expect(stats.estimatedNext).toBeNull();
  });

  it("an item that broke and wasn't replaced is not in use", () => {
    const broken: TrackedItem = { ...battery, installs: battery.installs.slice(0, 2) };
    const stats = getItemStats(broken, TODAY);
    expect(stats.isInUse).toBe(false);
    expect(stats.current).toBeNull();
    expect(stats.lastEnded?.id).toBe("b");
    expect(stats.estimatedNext).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "ro", "sub o zi"],
    [1, "ro", "1 zi"],
    [12, "ro", "12 zile"],
    [25, "ro", "25 de zile"],
    [45, "ro", "1 lună"],
    [200, "ro", "7 luni"],
    [365, "ro", "1 an"],
    [400, "ro", "1 an și 1 lună"],
    [1156, "ro", "3 ani și 2 luni"],
    [7300, "ro", "20 de ani"],
    [25, "en", "25 days"],
    [365, "en", "1 year"],
    [1156, "en", "3 years, 2 months"],
  ] as const)("%i days (%s) → %s", (days, lang, expected) => {
    expect(formatDuration(days, lang)).toBe(expected);
  });
});

describe("sortItems", () => {
  const item = (id: string, name: string, installs: TrackedItem["installs"]): TrackedItem => ({
    id, name, cat: "casa", createdAt: "2024-01-01", installs,
  });
  const brokenFilter = item("broken", "Filtru apă", [{ id: "1", start: "2024-01-01", end: "2026-04-01", endReason: "broke" }]);
  const soon = item("soon", "Plăcuțe", [
    { id: "1", start: "2024-01-01", end: "2025-01-01" },
    { id: "2", start: "2025-01-01" },
  ]);
  const later = item("later", "Anvelope", [
    { id: "1", start: "2020-01-01", end: "2024-01-01" },
    { id: "2", start: "2024-01-01" },
  ]);
  const noEstimate = item("noest", "Centrală", [{ id: "1", start: "2025-01-01" }]);
  const empty = item("empty", "Aer condiționat", []);

  it("puts broken items first, then the soonest replacement, then the rest by name", () => {
    const ids = sortItems([empty, noEstimate, later, soon, brokenFilter], TODAY, "ro").map((i) => i.id);
    expect(ids).toEqual(["broken", "soon", "later", "noest", "empty"]);
  });
});

describe("groupItemsByAsset", () => {
  const base = { cat: "vehicule" as const, createdAt: "2024-01-01", installs: [] };
  it("groups by object (ignoring case/spaces), named groups first, ungrouped last", () => {
    const groups = groupItemsByAsset([
      { ...base, id: "1", name: "Baterie", asset: "Dacia Duster" },
      { ...base, id: "2", name: "Filtru", asset: undefined },
      { ...base, id: "3", name: "Anvelope", asset: "dacia duster " },
      { ...base, id: "4", name: "Centrală", asset: "Apartament" },
    ]);
    expect(groups.map((g) => [g.asset, g.items.map((i) => i.id)])).toEqual([
      ["Apartament", ["4"]],
      ["Dacia Duster", ["1", "3"]],
      [null, ["2"]],
    ]);
  });
});

describe("isValidItem", () => {
  it("accepts a well-formed item", () => {
    expect(isValidItem(battery)).toBe(true);
  });

  it.each([
    ["missing name", { ...battery, name: "" }],
    ["unknown category", { ...battery, cat: "boats" }],
    ["installs not a list", { ...battery, installs: "nope" }],
    ["impossible date", { ...battery, installs: [{ id: "a", start: "2026-02-30" }] }],
    ["end before start", { ...battery, installs: [{ id: "a", start: "2026-02-10", end: "2026-01-10" }] }],
    ["negative km", { ...battery, installs: [{ id: "a", start: "2026-02-10", startKm: -5 }] }],
    ["null", null],
    ["inherited category name", { ...battery, cat: "toString" }],
    ["two installs in use", { ...battery, installs: [{ id: "a", start: "2024-01-01" }, { id: "b", start: "2025-01-01" }] }],
    ["periods out of order", { ...battery, installs: [
      { id: "a", start: "2025-01-01", end: "2025-06-01" },
      { id: "b", start: "2024-01-01", end: "2024-06-01" },
    ] }],
  ])("rejects %s", (_label, value) => {
    expect(isValidItem(value)).toBe(false);
  });
});

describe("formatEstimateWhen", () => {
  it.each([
    [0, "ro", "Astăzi!"],
    [12, "ro", "în 12 zile"],
    [214, "ro", "peste ~7 luni"],
    [-45, "ro", "depășită cu 1 lună"],
    [214, "en", "in ~7 months"],
  ] as const)("%i days away (%s) → %s", (days, lang, expected) => {
    expect(formatEstimateWhen(days, lang)).toBe(expected);
  });
});

describe("minimumKm (odometer can't go backwards)", () => {
  it("replacing or 'it broke' can't be below the reading at installation", () => {
    expect(minimumKm(battery, "replace")).toBe(140000);
    expect(minimumKm(battery, "broke")).toBe(140000);
  });

  it("a new installation can't be below the last recorded reading", () => {
    const broken: TrackedItem = { ...battery, installs: battery.installs.slice(0, 2) };
    expect(minimumKm(broken, "install")).toBe(140000);
  });

  it("no limit when no reading was recorded", () => {
    const noKm: TrackedItem = { ...battery, installs: [{ id: "x", start: "2025-01-01" }] };
    expect(minimumKm(noKm, "replace")).toBeNull();
  });
});

describe("compact durations (list rows)", () => {
  it.each([
    [400, "ro", "1 an"],
    [1156, "ro", "3 ani"],
    [1000, "ro", "3 ani"], // 2 years 9 months rounds to 3
    [200, "ro", "7 luni"],
    [12, "ro", "12 zile"],
    [1156, "en", "3 years"],
  ] as const)("%i days (%s) → %s", (days, lang, expected) => {
    expect(formatDuration(days, lang, { compact: true })).toBe(expected);
  });

  it("a far estimate stays short enough for a list row", () => {
    expect(formatEstimateWhen(1130, "ro", { compact: true })).toBe("peste ~3 ani");
  });
});

describe("formatKm", () => {
  it.each([
    [141000, "ro", "141.000"],
    [141000, "en", "141,000"],
    [950, "ro", "950"],
  ] as const)("%i (%s) → %s", (km, lang, expected) => {
    expect(formatKm(km, lang)).toBe(expected);
  });
});
