/**
 * Tests for the month calendar: the grid (Monday first) and what falls on
 * each day — due dates, and the next repeats of recurring documents.
 */

import { entriesByDay, monthGrid, shiftMonth } from "../core/calendarGrid";
import { enrichDocument } from "../core/enrichment";
import type { RawDocument } from "../core/constants";

const doc = (over: Partial<RawDocument>) =>
  enrichDocument({ id: "d", cat: "casa", type: "Gaz", title: "Gaz", due: "2026-10-20", amt: 100, rec: "monthly", ...over });

describe("monthGrid", () => {
  it("October 2026 starts on a Thursday (Monday-first weeks)", () => {
    const weeks = monthGrid(2026, 10);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks[4]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
  });

  it("February 2026 starts on a Sunday", () => {
    const weeks = monthGrid(2026, 2);
    expect(weeks[0][6]).toBe("2026-02-01");
    expect(weeks.flat().filter(Boolean)).toHaveLength(28);
  });
});

describe("shiftMonth", () => {
  it.each([
    [2026, 12, 1, [2027, 1]],
    [2026, 1, -1, [2025, 12]],
    [2026, 10, 1, [2026, 11]],
  ] as const)("%i-%i %+i → %j", (y, m, delta, expected) => {
    expect(shiftMonth(y, m, delta)).toEqual(expected);
  });
});

describe("entriesByDay", () => {
  it("the due date this month, solid", () => {
    const days = entriesByDay([doc({})], "2026-10-01", "2026-10-31");
    expect(days.get("2026-10-20")).toEqual([expect.objectContaining({ projected: false })]);
  });

  it("next month: the repeat, marked as projected", () => {
    const days = entriesByDay([doc({})], "2026-11-01", "2026-11-30");
    expect(days.get("2026-11-20")).toEqual([expect.objectContaining({ projected: true })]);
  });

  it("a one-time document appears only on its date", () => {
    const days = entriesByDay([doc({ rec: "none" })], "2026-11-01", "2026-11-30");
    expect(days.size).toBe(0);
  });
});
