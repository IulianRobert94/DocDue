/**
 * Tests for the Alerts tab grouping: what needs doing, grouped by when,
 * with the money each group needs (example documents never count).
 */

import { groupAlerts } from "../core/alerts";
import { enrichDocument } from "../core/enrichment";
import { addDaysToDate, getTodayString } from "../core/dateUtils";
import { createDemoDocuments } from "../core/demo";
import type { RawDocument } from "../core/constants";

const inDays = (n: number) => addDaysToDate(getTodayString(), n);
const doc = (id: string, days: number, over: Partial<RawDocument> = {}) =>
  enrichDocument({ id, cat: "casa", type: "Gaz", title: id, due: inDays(days), amt: 100, rec: "monthly", ...over });

describe("groupAlerts", () => {
  it("groups by when: late, next 7 days, next 30 days, later", () => {
    const groups = groupAlerts([
      doc("late", -2),
      doc("today", 0),
      doc("week", 7),
      doc("month", 8),
      doc("month30", 30, { rec: "annual" }),
      // 10-year documents warn 6 months ahead: they show up under "later"
      doc("passport", 150, { cat: "personal", type: "Pașaport", rec: "10years" }),
    ], "RON");
    expect(groups.map((g) => [g.key, g.data.map((d) => d.id)])).toEqual([
      ["overdue", ["late"]],
      ["week", ["today", "week"]],
      ["month", ["month", "month30"]],
      ["later", ["passport"]],
    ]);
  });

  it("includes a bill due within 30 days even before its warning window", () => {
    // Monthly bills only turn orange 7 days ahead, but rent due in 10 days still needs paying this month
    const groups = groupAlerts([doc("rent", 10)], "RON");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("month");
  });

  it("leaves out what's far away and not flagged", () => {
    expect(groupAlerts([doc("far", 45)], "RON")).toEqual([]);
  });

  it("adds up the money per group, skipping documents without an amount", () => {
    const groups = groupAlerts([doc("a", 2, { amt: 845 }), doc("b", 5, { amt: null }), doc("c", 6, { amt: 55 })], "RON");
    expect(groups[0]).toMatchObject({ key: "week", totals: { RON: 900 } });
  });

  it("a bill three months late counts all three missed periods (like the pay sheet)", () => {
    const groups = groupAlerts([doc("late", -70, { amt: 200 })], "RON");
    expect(groups[0]).toMatchObject({ key: "overdue", totals: { RON: 600 } });
  });

  it("keeps currencies apart: rent in EUR, bills in lei", () => {
    const groups = groupAlerts([doc("rent", 3, { amt: 400, currency: "EUR" }), doc("power", 4, { amt: 310 })], "RON");
    expect(groups[0].totals).toEqual({ EUR: 400, RON: 310 });
  });

  it("shows example documents but never counts their money", () => {
    const example = createDemoDocuments("ro").map((d) => enrichDocument(d)).find((d) => d._daysUntil < 0 && d.amt)!;
    const groups = groupAlerts([example, doc("mine", -1, { amt: 100 })], "RON");
    expect(groups[0].data).toHaveLength(2);
    expect(groups[0].totals).toEqual({ RON: 100 });
  });
});
