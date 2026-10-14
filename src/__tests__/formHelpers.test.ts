/**
 * Tests for the add/edit form helpers: date shortcuts, legal deadlines,
 * reminder dates, automatic titles, known assets, missing car documents.
 */

import {
  autoTitle, companionTypes, dateShortcuts, knownAssets, legalDueDate, upcomingReminderDates,
} from "../core/formHelpers";
import type { RawDocument } from "../core/constants";

const doc = (over: Partial<RawDocument>): RawDocument => ({
  id: Math.random().toString(36), cat: "vehicule", type: "RCA", title: "RCA", due: "2027-01-01", amt: null, rec: "annual", ...over,
});

describe("dateShortcuts", () => {
  it("bills and policies: +1 month, +6 months, +1 year", () => {
    expect(dateShortcuts("RCA", "annual")).toEqual([1, 6, 12]);
  });

  it("IDs and other long-lived documents: +5 and +10 years", () => {
    expect(dateShortcuts("Pașaport", "10years")).toEqual([60, 120]);
    expect(dateShortcuts("Carte de identitate", "none")).toEqual([60, 120]);
    expect(dateShortcuts("Card tahograf", "5years")).toEqual([60, 120]);
  });
});

describe("legalDueDate (Romanian fixed deadlines)", () => {
  it.each([
    ["Impozit auto", "2026-10-14", "2027-03-31"],
    ["Impozit locuință", "2027-02-01", "2027-03-31"],
    ["Impozit locuință", "2027-03-31", "2027-03-31"],
    ["Declarație unică", "2026-10-14", "2027-05-25"],
    ["Declarație unică", "2027-04-01", "2027-05-25"],
  ] as const)("%s from %s → %s", (type, today, expected) => {
    expect(legalDueDate(type, today)).toBe(expected);
  });

  it("other types have none", () => {
    expect(legalDueDate("RCA", "2026-10-14")).toBeNull();
  });
});

describe("upcomingReminderDates", () => {
  it("lists the advance reminders still ahead, soonest first", () => {
    expect(upcomingReminderDates("2026-12-01", [30, 7, 1], "2026-10-14")).toEqual(["2026-11-01", "2026-11-24", "2026-11-30"]);
  });

  it("skips the ones already past and anything after the due date", () => {
    expect(upcomingReminderDates("2026-10-20", [30, 7, 1, -1], "2026-10-14")).toEqual(["2026-10-19"]);
  });
});

describe("autoTitle (title left empty)", () => {
  it("type + what it's for", () => {
    expect(autoTitle("RCA", "Dacia Duster", "ro")).toBe("RCA — Dacia Duster");
  });

  it("just the type, translated", () => {
    expect(autoTitle("Pașaport", "", "en")).toBe("Passport");
  });
});

describe("knownAssets", () => {
  it("lists the cars / homes already used, most used first, without duplicates", () => {
    const docs = [
      doc({ asset: "Dacia Duster" }), doc({ asset: "dacia duster " }), doc({ asset: "Apartament Titan" }),
      doc({ asset: "Dacia Duster" }), doc({ asset: undefined }),
    ];
    expect(knownAssets(docs)).toEqual(["Dacia Duster", "Apartament Titan"]);
  });
});

describe("companionTypes (what a car still needs)", () => {
  it("suggests the usual car documents not added yet for that car", () => {
    const docs = [doc({ type: "RCA", asset: "Dacia Duster" }), doc({ type: "ITP", asset: "Logan" })];
    expect(companionTypes("vehicule", "dacia duster", docs)).toEqual(["ITP", "Rovignetă", "CASCO"]);
  });

  it("nothing for other categories or without a car", () => {
    expect(companionTypes("casa", "Apartament", [])).toEqual([]);
    expect(companionTypes("vehicule", "", [])).toEqual([]);
  });

  it("ignores archived documents", () => {
    const docs = [doc({ type: "ITP", asset: "Duster", resolved: "2026-01-01" })];
    expect(companionTypes("vehicule", "Duster", docs)).toContain("ITP");
  });
});
