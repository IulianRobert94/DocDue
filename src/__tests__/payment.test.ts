/**
 * Tests for the "Plătit / Reînnoit" rules: next due date, periods covered,
 * renewals that restart when lapsed, one-time documents, undo-friendly updates.
 */

import { applyPayAction, defaultPayAction, isRenewal, payKind, planPayment, projectOccurrences } from "../core/payment";
import { createDemoDocuments } from "../core/demo";
import type { RawDocument } from "../core/constants";

const TODAY = "2026-10-14";

const doc = (over: Partial<RawDocument> = {}): RawDocument => ({
  id: "d1",
  cat: "casa",
  type: "Curent electric",
  title: "Curent",
  due: "2026-10-20",
  amt: 120,
  rec: "monthly",
  ...over,
});

describe("isRenewal (validity restarts) vs bills (fixed calendar)", () => {
  it.each([
    ["vehicule", "RCA", true],
    ["vehicule", "ITP", true],
    ["vehicule", "Impozit auto", false],
    ["personal", "Pașaport", true],
    ["personal", "Altele", true],
    ["casa", "Curent electric", false],
    ["casa", "Asigurare PAD", true],
    ["financiar", "Rată credit", false],
    ["financiar", "Autorizație", true],
  ] as const)("%s / %s → %s", (cat, type, expected) => {
    expect(isRenewal({ cat, type })).toBe(expected);
  });
});

describe("payKind (button label)", () => {
  it.each([
    ["vehicule", "RCA", "renewal"],
    ["casa", "Curent electric", "bill"],
    ["casa", "Garanție produs", "ending"],
  ] as const)("%s / %s → %s", (cat, type, expected) => {
    expect(payKind({ cat, type })).toBe(expected);
  });
});

describe("planPayment — bills keep their calendar", () => {
  it("paid on time: one period ahead, same day of month", () => {
    expect(planPayment(doc({ due: "2026-10-20" }), TODAY)).toMatchObject({
      renewal: false, recurring: true, overdue: false,
      nextOne: "2026-11-20", nextAll: "2026-11-20", periodsAll: 1,
    });
  });

  it("paid 3 months late: covers every missed month up to the next date still ahead", () => {
    expect(planPayment(doc({ due: "2026-07-10" }), TODAY)).toMatchObject({
      overdue: true, nextOne: "2026-08-10", nextAll: "2026-11-10", periodsAll: 4,
    });
  });

  it("a period that falls today stays due", () => {
    expect(planPayment(doc({ due: "2026-08-14" }), TODAY)).toMatchObject({
      nextAll: "2026-10-14", periodsAll: 2,
    });
  });

  it("keeps the 31st after a short month", () => {
    expect(planPayment(doc({ due: "2026-01-31", dueDay: 31 }), "2026-01-20").nextOne).toBe("2026-02-28");
    expect(planPayment(doc({ due: "2026-02-28", dueDay: 31 }), "2026-02-20").nextOne).toBe("2026-03-31");
  });

  it("weekly bills move by 7 days", () => {
    expect(planPayment(doc({ rec: "weekly", due: "2026-10-16" }), TODAY).nextOne).toBe("2026-10-23");
  });
});

describe("planPayment — renewals restart when they lapsed", () => {
  const rca = (due: string) => doc({ cat: "vehicule", type: "RCA", title: "RCA", rec: "annual", due, amt: 1850 });

  it("renewed early: keeps its anniversary", () => {
    expect(planPayment(rca("2026-11-01"), TODAY)).toMatchObject({
      renewal: true, overdue: false, nextOne: "2027-11-01", periodsAll: 1,
    });
  });

  it("renewed a month after it lapsed: runs a year from today, no catch-up", () => {
    expect(planPayment(rca("2026-09-14"), TODAY)).toMatchObject({
      overdue: true, nextOne: "2027-10-14", nextAll: "2027-10-14", periodsAll: 1,
    });
  });
});

describe("planPayment — one-time documents", () => {
  it("suggests 10 years for an ID document", () => {
    const p = planPayment(doc({ cat: "personal", type: "Pașaport", rec: "none", due: "2026-11-01" }), TODAY);
    expect(p).toMatchObject({ recurring: false, renewal: true, nextOne: null, renewSuggestion: "2036-10-14" });
  });

  it("suggests one year for anything else", () => {
    expect(planPayment(doc({ cat: "financiar", type: "Amendă", rec: "none" }), TODAY).renewSuggestion).toBe("2027-10-14");
  });
});

describe("applyPayAction", () => {
  it("pay: moves the due date and records one payment per period covered", () => {
    const after = applyPayAction(doc({ due: "2026-07-10" }), { kind: "pay", nextDue: "2026-11-10", amount: 120, periods: 4 }, TODAY);
    expect(after.due).toBe("2026-11-10");
    expect(after.paymentHistory?.map((p) => p.dueDate)).toEqual(["2026-07-10", "2026-08-10", "2026-09-10", "2026-10-10"]);
    expect(after.paymentHistory?.every((p) => p.date === TODAY && p.amt === 120)).toBe(true);
  });

  it("pay: the amount actually paid becomes the expected amount", () => {
    const after = applyPayAction(doc(), { kind: "pay", nextDue: "2026-11-20", amount: 135.5, periods: 1 }, TODAY);
    expect(after.amt).toBe(135.5);
    expect(after.paymentHistory).toEqual([{ date: TODAY, dueDate: "2026-10-20", amt: 135.5 }]);
  });

  it("pay without an amount keeps the expected amount", () => {
    const after = applyPayAction(doc({ amt: 120 }), { kind: "pay", nextDue: "2026-11-20", amount: null, periods: 1 }, TODAY);
    expect(after.amt).toBe(120);
    expect(after.paymentHistory?.[0].amt).toBeNull();
  });

  it("a date the user picked becomes the new day of month", () => {
    const after = applyPayAction(doc({ due: "2026-10-20", dueDay: 20 }), { kind: "pay", nextDue: "2026-11-25", amount: 120, periods: 1 }, TODAY);
    expect(after.dueDay).toBe(25);
  });

  it("the suggested date keeps the original day (31st)", () => {
    const after = applyPayAction(doc({ due: "2026-01-31", dueDay: 31 }), { kind: "pay", nextDue: "2026-02-28", amount: 120, periods: 1 }, "2026-01-20");
    expect(after.dueDay).toBe(31);
  });

  it("a lapsed renewal restarts its day of month from today", () => {
    const rca = doc({ cat: "vehicule", type: "RCA", rec: "annual", due: "2026-09-03", dueDay: 3 });
    const after = applyPayAction(rca, { kind: "pay", nextDue: "2027-10-14", amount: 1900, periods: 1 }, TODAY);
    expect(after.due).toBe("2027-10-14");
    expect(after.dueDay).toBe(14);
  });

  it("renew: a one-time document stays active with its new date", () => {
    const passport = doc({ cat: "personal", type: "Pașaport", rec: "none", due: "2026-11-01", amt: null });
    const after = applyPayAction(passport, { kind: "renew", nextDue: "2036-10-14", amount: 258 }, TODAY);
    expect(after.resolved).toBeUndefined();
    expect(after.due).toBe("2036-10-14");
    expect(after.paymentHistory).toEqual([{ date: TODAY, dueDate: "2026-11-01", amt: 258 }]);
  });

  it("close without an amount archives it and records no payment", () => {
    const warranty = doc({ type: "Garanție produs", rec: "none", amt: 2400 });
    const after = applyPayAction(warranty, { kind: "close", amount: null }, TODAY);
    expect(after.resolved).toBe(TODAY);
    expect(after.paymentHistory ?? []).toEqual([]);
  });

  it("close with an amount records the payment (a fine)", () => {
    const fine = doc({ cat: "financiar", type: "Amendă", rec: "none", amt: 500 });
    const after = applyPayAction(fine, { kind: "close", amount: 500 }, TODAY);
    expect(after.resolved).toBe(TODAY);
    expect(after.paymentHistory).toEqual([{ date: TODAY, dueDate: fine.due, amt: 500 }]);
  });

  it("paying an example makes it the user's and drops its sample history", () => {
    const example = createDemoDocuments("ro").find((d) => (d.paymentHistory?.length ?? 0) > 0)!;
    const plan = planPayment(example, TODAY);
    const after = applyPayAction(example, { kind: "pay", nextDue: plan.nextAll!, amount: example.amt, periods: 1 }, TODAY);
    expect(after.userEdited).toBe(true);
    expect(after.paymentHistory).toHaveLength(1);
  });

  it("does not touch the original document", () => {
    const before = doc({ due: "2026-07-10" });
    const copy = JSON.parse(JSON.stringify(before));
    applyPayAction(before, { kind: "pay", nextDue: "2026-11-10", amount: 120, periods: 4 }, TODAY);
    expect(before).toEqual(copy);
  });
});

describe("defaultPayAction (one tap, no questions)", () => {
  it("bill: catches up to the next date ahead with a single payment record", () => {
    expect(defaultPayAction(doc({ due: "2026-07-10" }), TODAY)).toEqual({ kind: "pay", nextDue: "2026-11-10", amount: 120, periods: 1 });
  });

  it("lapsed renewal: one period from today", () => {
    const rca = doc({ cat: "vehicule", type: "RCA", rec: "annual", due: "2026-09-14", amt: 1850 });
    expect(defaultPayAction(rca, TODAY)).toEqual({ kind: "pay", nextDue: "2027-10-14", amount: 1850, periods: 1 });
  });

  it("one-time document: closes with its planned amount", () => {
    expect(defaultPayAction(doc({ rec: "none", amt: 500 }), TODAY)).toEqual({ kind: "close", amount: 500 });
  });
});

describe("projectOccurrences (when the next payments fall)", () => {
  it("a monthly bill: every month in the window", () => {
    expect(projectOccurrences(doc({ due: "2026-10-20" }), TODAY, "2026-12-31")).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
  });

  it("an overdue bill: the periods still ahead (the missed ones are overdue, not forecast)", () => {
    expect(projectOccurrences(doc({ due: "2026-08-10" }), TODAY, "2026-12-31")).toEqual(["2026-11-10", "2026-12-10"]);
  });

  it("a one-time document: once, if it falls in the window", () => {
    expect(projectOccurrences(doc({ rec: "none", due: "2026-11-01" }), TODAY, "2026-12-31")).toEqual(["2026-11-01"]);
    expect(projectOccurrences(doc({ rec: "none", due: "2027-03-01" }), TODAY, "2026-12-31")).toEqual([]);
  });

  it("weekly: every 7 days", () => {
    expect(projectOccurrences(doc({ rec: "weekly", due: "2026-10-16" }), TODAY, "2026-10-31")).toEqual(["2026-10-16", "2026-10-23", "2026-10-30"]);
  });
});
