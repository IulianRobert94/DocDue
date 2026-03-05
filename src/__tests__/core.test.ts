/**
 * DocDue — Core Logic Tests
 *
 * Tests for date utilities, validation, enrichment, migration, and formatters.
 * Run with: npm test
 */

import {
  parseLocalDate,
  calculateDaysUntil,
  getDocumentStatus,
  addDaysToDate,
  addMonthsToDate,
  getTodayString,
} from "../core/dateUtils";

import { validateDocument } from "../core/validators";
import { enrichDocument, stripEnrichedFields, sortDocumentsByField } from "../core/enrichment";
import { migrateData } from "../core/migration";
import { formatDate, formatMoney, formatDaysRemaining, getRecurrenceDays } from "../core/formatters";
import type { RawDocument, EnrichedDocument } from "../core/constants";

// ─── Date Utilities ──────────────────────────────────────

describe("parseLocalDate", () => {
  it("parses a valid YYYY-MM-DD string", () => {
    const date = parseLocalDate("2024-03-15");
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2); // 0-indexed
    expect(date.getDate()).toBe(15);
  });

  it("returns Invalid Date for empty string", () => {
    const date = parseLocalDate("");
    expect(isNaN(date.getTime())).toBe(true);
  });

  it("returns Invalid Date for malformed input", () => {
    expect(isNaN(parseLocalDate("not-a-date").getTime())).toBe(true);
    expect(isNaN(parseLocalDate("2024-13-01").getTime())).toBe(true); // now rejects invalid month
    expect(isNaN(parseLocalDate("abc").getTime())).toBe(true);
  });

  it("returns Invalid Date for null/undefined coerced to string", () => {
    expect(isNaN(parseLocalDate(null as any).getTime())).toBe(true);
    expect(isNaN(parseLocalDate(undefined as any).getTime())).toBe(true);
  });
});

describe("getTodayString", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    const today = getTodayString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("calculateDaysUntil", () => {
  it("returns 0 for today", () => {
    const today = getTodayString();
    expect(calculateDaysUntil(today)).toBe(0);
  });

  it("returns positive for future dates", () => {
    const future = addDaysToDate(getTodayString(), 10);
    expect(calculateDaysUntil(future)).toBe(10);
  });

  it("returns negative for past dates", () => {
    const past = addDaysToDate(getTodayString(), -5);
    expect(calculateDaysUntil(past)).toBe(-5);
  });

  it("returns -99999 for invalid date (clearly expired fallback)", () => {
    expect(calculateDaysUntil("invalid")).toBe(-99999);
  });
});

describe("getDocumentStatus", () => {
  it("returns 'expired' for past dates", () => {
    const past = addDaysToDate(getTodayString(), -1);
    expect(getDocumentStatus(past)).toBe("expired");
  });

  it("returns 'warning' for dates within threshold", () => {
    const soon = addDaysToDate(getTodayString(), 7);
    expect(getDocumentStatus(soon, 14)).toBe("warning");
  });

  it("returns 'ok' for dates beyond threshold", () => {
    const far = addDaysToDate(getTodayString(), 30);
    expect(getDocumentStatus(far, 14)).toBe("ok");
  });

  it("returns 'warning' for today (0 days)", () => {
    const today = getTodayString();
    expect(getDocumentStatus(today)).toBe("warning");
  });
});

describe("addDaysToDate", () => {
  it("adds days correctly", () => {
    expect(addDaysToDate("2024-01-01", 31)).toBe("2024-02-01");
  });

  it("handles negative days", () => {
    expect(addDaysToDate("2024-03-01", -1)).toBe("2024-02-29"); // leap year
  });

  it("handles year boundary", () => {
    expect(addDaysToDate("2024-12-31", 1)).toBe("2025-01-01");
  });
});

describe("addMonthsToDate", () => {
  it("adds 1 month to a normal date", () => {
    expect(addMonthsToDate("2024-01-15", 1)).toBe("2024-02-15");
  });

  it("clamps to end of month when target month is shorter", () => {
    // Jan 31 + 1 month should be Feb 29 (leap year 2024)
    const result = addMonthsToDate("2024-01-31", 1);
    expect(result).toBe("2024-02-29");
  });

  it("handles non-leap year February correctly", () => {
    const result = addMonthsToDate("2025-01-31", 1);
    expect(result).toBe("2025-02-28");
  });

  it("adds 3 months (quarterly)", () => {
    expect(addMonthsToDate("2024-06-15", 3)).toBe("2024-09-15");
  });

  it("adds 12 months (annual)", () => {
    expect(addMonthsToDate("2024-03-15", 12)).toBe("2025-03-15");
  });

  it("crosses year boundary", () => {
    expect(addMonthsToDate("2024-11-15", 3)).toBe("2025-02-15");
  });
});

// ─── Validation ─────────────────────────────────────────

describe("validateDocument", () => {
  it("returns no errors for valid document", () => {
    const doc = { title: "Test", due: "2024-12-31", amt: 100, cat: "vehicule" as const, type: "RCA", rec: "none" as const };
    expect(validateDocument(doc)).toEqual([]);
  });

  it("requires title", () => {
    const doc = { title: "", due: "2024-12-31" };
    const errors = validateDocument(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("requires due date", () => {
    const doc = { title: "Test" };
    const errors = validateDocument(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects negative amount", () => {
    const doc = { title: "Test", due: "2024-12-31", amt: -50 };
    const errors = validateDocument(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("allows null amount but requires category", () => {
    const doc = { title: "Test", due: "2024-12-31", amt: null, cat: "vehicule" as const };
    expect(validateDocument(doc)).toEqual([]);
  });
});

// ─── Enrichment ─────────────────────────────────────────

describe("enrichDocument", () => {
  const makeDoc = (due: string): RawDocument => ({
    id: "test-1", cat: "vehicule", type: "RCA", title: "Test",
    due, amt: 100, rec: "none",
  });

  it("adds _daysUntil and _status fields", () => {
    const doc = makeDoc(getTodayString());
    const enriched = enrichDocument(doc);
    expect(enriched._daysUntil).toBe(0);
    expect(enriched._status).toBe("warning");
  });

  it("marks far-future docs as ok", () => {
    const doc = makeDoc(addDaysToDate(getTodayString(), 100));
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("ok");
  });
});

describe("stripEnrichedFields", () => {
  it("removes _daysUntil and _status", () => {
    const enriched = {
      id: "1", cat: "vehicule" as const, type: "RCA", title: "Test",
      due: "2024-12-31", amt: 100, rec: "none" as const,
      _daysUntil: 10, _status: "ok" as const,
    };
    const raw = stripEnrichedFields(enriched);
    expect((raw as any)._daysUntil).toBeUndefined();
    expect((raw as any)._status).toBeUndefined();
    expect(raw.id).toBe("1");
    expect(raw.title).toBe("Test");
  });
});

describe("sortDocumentsByField", () => {
  const makeDocs = (): EnrichedDocument[] => [
    { id: "1", cat: "vehicule", type: "RCA", title: "Banana", due: "2024-06-01", amt: 200, rec: "none", _daysUntil: 10, _status: "warning" },
    { id: "2", cat: "vehicule", type: "ITP", title: "Apple", due: "2024-03-01", amt: 50, rec: "none", _daysUntil: -5, _status: "expired" },
    { id: "3", cat: "casa", type: "Gaz", title: "Cherry", due: "2024-12-01", amt: 300, rec: "none", _daysUntil: 100, _status: "ok" },
  ];

  it("sorts by urgency (soonest first)", () => {
    const sorted = sortDocumentsByField(makeDocs(), "urgency", "asc");
    expect(sorted[0].id).toBe("2"); // -5 days
    expect(sorted[2].id).toBe("3"); // 100 days
  });

  it("sorts by name alphabetically", () => {
    const sorted = sortDocumentsByField(makeDocs(), "name", "asc");
    expect(sorted[0].title).toBe("Apple");
    expect(sorted[2].title).toBe("Cherry");
  });

  it("sorts by amount descending", () => {
    const sorted = sortDocumentsByField(makeDocs(), "amount", "desc");
    expect(sorted[0].amt).toBe(300);
    expect(sorted[2].amt).toBe(50);
  });
});

// ─── Migration ──────────────────────────────────────────

describe("migrateData", () => {
  it("returns null for null input", () => {
    expect(migrateData(null)).toBeNull();
  });

  it("returns array for valid document array", () => {
    const docs = [{ id: "1", cat: "vehicule", type: "RCA", title: "Test", due: "2024-12-31", amt: 100, rec: "none" }];
    expect(migrateData(docs as any)).toEqual(docs);
  });

  it("returns null for corrupted array (no id field)", () => {
    const bad = [{ name: "not a document" }];
    expect(migrateData(bad as any)).toBeNull();
  });

  it("extracts documents from object format", () => {
    const docs = [{ id: "1", cat: "vehicule", type: "RCA", title: "Test", due: "2024-12-31", amt: 100, rec: "none" }];
    const stored = { version: 1, documents: docs };
    expect(migrateData(stored as any)).toEqual(docs);
  });

  it("returns null for object without documents array", () => {
    const stored = { version: 1 };
    expect(migrateData(stored as any)).toBeNull();
  });
});

// ─── Formatters ─────────────────────────────────────────

describe("formatDate", () => {
  it("formats for Romanian locale", () => {
    expect(formatDate("2024-03-15", "ro")).toBe("15.03.2024");
  });

  it("formats for English locale", () => {
    expect(formatDate("2024-03-15", "en")).toBe("03/15/2024");
  });
});

describe("formatMoney", () => {
  it("formats RON", () => {
    const result = formatMoney(1850, "RON", "ro");
    expect(result).toContain("lei");
  });

  it("formats EUR", () => {
    const result = formatMoney(250, "EUR", "en");
    expect(result).toContain("€");
  });

  it("returns empty for null amount", () => {
    expect(formatMoney(null)).toBe("");
  });

  it("formats zero amount", () => {
    const result = formatMoney(0);
    expect(result).toContain("0");
  });
});

describe("formatDaysRemaining", () => {
  it("shows 'today' for 0", () => {
    const result = formatDaysRemaining(0, "en");
    expect(result.toLowerCase()).toContain("today");
  });

  it("shows 'tomorrow' for 1", () => {
    const result = formatDaysRemaining(1, "en");
    expect(result.toLowerCase()).toContain("tomorrow");
  });

  it("shows overdue for negative", () => {
    const result = formatDaysRemaining(-5, "en");
    expect(result).toContain("5");
    expect(result.toLowerCase()).toContain("overdue");
  });

  it("shows future for positive", () => {
    const result = formatDaysRemaining(14, "en");
    expect(result).toContain("14");
  });
});

describe("getRecurrenceDays", () => {
  it("returns 0 for none", () => {
    expect(getRecurrenceDays("none")).toBe(0);
  });

  it("returns 365 for annual", () => {
    expect(getRecurrenceDays("annual")).toBe(365);
  });

  it("returns 7 for weekly", () => {
    expect(getRecurrenceDays("weekly")).toBe(7);
  });
});

// ─── i18n Completeness ──────────────────────────────────

import { t, translateSubtype } from "../core/i18n";

describe("i18n completeness", () => {
  // Gather all keys used by t() in both languages
  const allKeys = [
    // Core keys that must exist in both languages
    "nav_home", "nav_alerts", "nav_search", "nav_settings",
    "form_add_title", "form_edit_title", "form_save", "form_category", "form_type",
    "form_title", "form_due", "form_amount", "form_recurrence", "form_notes",
    "status_expired", "status_warning", "status_ok",
    "cat_vehicule", "cat_casa", "cat_personal", "cat_financiar",
    // Payment history keys (new)
    "payment_history", "total_paid", "paid_on", "payment_count",
    // Premium keys
    "premium_title", "premium_subtitle", "premium_upgrade", "premium_restore", "premium_active",
    "premium_required",
    // Alert title keys
    "alert_success", "alert_notice",
    // Notification action keys
    "notif_action_renewed", "notif_action_tomorrow",
  ];

  it("all critical keys exist in Romanian", () => {
    for (const key of allKeys) {
      const val = t("ro", key);
      expect(val).not.toBe(key); // Should not fall back to the raw key
    }
  });

  it("all critical keys exist in English", () => {
    for (const key of allKeys) {
      const val = t("en", key);
      expect(val).not.toBe(key);
    }
  });

  it("t() supports interpolation", () => {
    const result = t("en", "paid_on", { date: "2024-03-15" });
    expect(result).toContain("2024-03-15");
  });

  it("translateSubtype returns English for known subtypes", () => {
    expect(translateSubtype("Rovignetă", "en")).toBe("Road vignette");
    expect(translateSubtype("Curent electric", "en")).toBe("Electricity");
  });

  it("translateSubtype returns original for Romanian", () => {
    expect(translateSubtype("RCA", "ro")).toBe("RCA");
    expect(translateSubtype("Rovignetă", "ro")).toBe("Rovignetă");
  });
});

// ─── Payment History (data model) ───────────────────────

describe("PaymentRecord in RawDocument", () => {
  it("enrichment preserves paymentHistory", () => {
    const doc: RawDocument = {
      id: "pay-1", cat: "vehicule", type: "RCA", title: "RCA Test",
      due: addDaysToDate(getTodayString(), 30), amt: 500, rec: "annual",
      paymentHistory: [
        { date: "2024-01-15", dueDate: "2024-01-10", amt: 480 },
        { date: "2024-07-15", dueDate: "2024-07-10", amt: 500 },
      ],
    };
    const enriched = enrichDocument(doc);
    expect(enriched.paymentHistory).toBeDefined();
    expect(enriched.paymentHistory!.length).toBe(2);
    expect(enriched.paymentHistory![0].amt).toBe(480);
  });

  it("stripEnrichedFields preserves paymentHistory", () => {
    const enriched = {
      id: "pay-2", cat: "vehicule" as const, type: "RCA", title: "Test",
      due: "2024-12-31", amt: 100, rec: "annual" as const,
      _daysUntil: 10, _status: "ok" as const,
      paymentHistory: [{ date: "2024-06-01", dueDate: "2024-05-31", amt: 100 }],
    };
    const raw = stripEnrichedFields(enriched);
    expect(raw.paymentHistory).toBeDefined();
    expect(raw.paymentHistory!.length).toBe(1);
    expect((raw as any)._daysUntil).toBeUndefined();
  });
});

// ─── Demo Data ──────────────────────────────────────────

import { createDemoDocuments } from "../core/demo";
import { calculateHealthScore, getHealthScoreColor, getHealthScoreLabel } from "../core/healthScore";
import { getSmartDefaults } from "../core/smartDefaults";

describe("demo data", () => {
  it("creates documents with valid structure", () => {
    const docs = createDemoDocuments();
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.id).toBeTruthy();
      expect(doc.cat).toBeTruthy();
      expect(doc.title).toBeTruthy();
      expect(doc.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("includes some documents with paymentHistory", () => {
    const docs = createDemoDocuments();
    const withHistory = docs.filter((d) => d.paymentHistory && d.paymentHistory.length > 0);
    expect(withHistory.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Health Score ────────────────────────────────────────

describe("calculateHealthScore", () => {
  const makeDoc = (daysUntil: number, status: "expired" | "warning" | "ok"): EnrichedDocument => ({
    id: `test-${daysUntil}`,
    cat: "vehicule",
    type: "RCA",
    title: "Test",
    due: addDaysToDate(getTodayString(), daysUntil),
    amt: null,
    rec: "none",
    _daysUntil: daysUntil,
    _status: status,
  });

  it("returns 100 for empty document list", () => {
    expect(calculateHealthScore([])).toBe(100);
  });

  it("returns 100 (with bonus clamped) when all docs are ok", () => {
    const docs = [makeDoc(30, "ok"), makeDoc(60, "ok")];
    expect(calculateHealthScore(docs)).toBe(100);
  });

  it("subtracts 20 for each expired doc", () => {
    const docs = [makeDoc(-5, "expired")];
    expect(calculateHealthScore(docs)).toBe(80);
  });

  it("subtracts more for multiple expired docs", () => {
    const docs = [makeDoc(-5, "expired"), makeDoc(-10, "expired")];
    expect(calculateHealthScore(docs)).toBe(60);
  });

  it("penalizes warning docs based on urgency", () => {
    // 1 day left out of 30 warning days (rec=none) → high urgency
    const docs = [makeDoc(1, "warning")];
    const score = calculateHealthScore(docs);
    expect(score).toBeGreaterThan(90);
    expect(score).toBeLessThan(100);
  });

  it("penalizes warning docs less when far from expiration", () => {
    // 13 days left out of 30 warning days (rec=none) → low urgency
    const docs = [makeDoc(13, "warning")];
    const score = calculateHealthScore(docs);
    expect(score).toBeGreaterThan(95);
  });

  it("never goes below 0", () => {
    const docs = Array.from({ length: 10 }, (_, i) => makeDoc(-i, "expired"));
    expect(calculateHealthScore(docs)).toBe(0);
  });

  it("handles mixed statuses", () => {
    const docs = [
      makeDoc(-5, "expired"),
      makeDoc(3, "warning"),
      makeDoc(30, "ok"),
    ];
    const score = calculateHealthScore(docs);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe("getHealthScoreColor", () => {
  it("returns red for low scores", () => {
    expect(getHealthScoreColor(20)).toBe("#FF3B30");
    expect(getHealthScoreColor(40)).toBe("#FF3B30");
  });

  it("returns orange for medium scores", () => {
    expect(getHealthScoreColor(50)).toBe("#FF9500");
    expect(getHealthScoreColor(70)).toBe("#FF9500");
  });

  it("returns green for high scores", () => {
    expect(getHealthScoreColor(80)).toBe("#34C759");
    expect(getHealthScoreColor(100)).toBe("#34C759");
  });
});

describe("getHealthScoreLabel", () => {
  it("returns critical for low scores", () => {
    expect(getHealthScoreLabel(20)).toBe("health_critical");
  });

  it("returns attention for medium scores", () => {
    expect(getHealthScoreLabel(50)).toBe("health_attention");
  });

  it("returns good for high scores", () => {
    expect(getHealthScoreLabel(80)).toBe("health_good");
  });
});

// ─── Smart Defaults ─────────────────────────────────────

describe("getSmartDefaults", () => {
  it("returns annual for RCA", () => {
    const defaults = getSmartDefaults("RCA");
    expect(defaults).not.toBeNull();
    expect(defaults!.recurrence).toBe("annual");
  });

  it("returns annual for ITP", () => {
    const defaults = getSmartDefaults("ITP");
    expect(defaults).not.toBeNull();
    expect(defaults!.recurrence).toBe("annual");
  });

  it("returns monthly for utilities", () => {
    expect(getSmartDefaults("Curent electric")!.recurrence).toBe("monthly");
    expect(getSmartDefaults("Gaz")!.recurrence).toBe("monthly");
    expect(getSmartDefaults("Apă")!.recurrence).toBe("monthly");
    expect(getSmartDefaults("Internet")!.recurrence).toBe("monthly");
  });

  it("returns monthly for subscription services", () => {
    expect(getSmartDefaults("Streaming video")!.recurrence).toBe("monthly");
    expect(getSmartDefaults("Telefonie mobilă")!.recurrence).toBe("monthly");
  });

  it("returns annual for insurance types", () => {
    expect(getSmartDefaults("CASCO")!.recurrence).toBe("annual");
    expect(getSmartDefaults("Asigurare PAD")!.recurrence).toBe("annual");
    expect(getSmartDefaults("Asigurare viață")!.recurrence).toBe("annual");
  });

  it("returns none for one-time documents", () => {
    expect(getSmartDefaults("Carte de identitate")!.recurrence).toBe("none");
    expect(getSmartDefaults("Pașaport")!.recurrence).toBe("none");
    expect(getSmartDefaults("Amendă")!.recurrence).toBe("none");
  });

  it("returns null for unknown subtypes", () => {
    expect(getSmartDefaults("Sconosciuto")).toBeNull();
    expect(getSmartDefaults("")).toBeNull();
  });

  it("returns monthly for ANAF tax", () => {
    expect(getSmartDefaults("Impozit ANAF")!.recurrence).toBe("monthly");
  });

  it("returns monthly for loan payments", () => {
    expect(getSmartDefaults("Rată credit")!.recurrence).toBe("monthly");
    expect(getSmartDefaults("Rată leasing")!.recurrence).toBe("monthly");
  });
});

// ─── Migration Edge Cases ───────────────────────────────

describe("migrateData edge cases", () => {
  it("returns empty array for empty array (user deleted all docs)", () => {
    expect(migrateData([])).toEqual([]);
  });

  it("returns null for undefined input", () => {
    expect(migrateData(undefined as any)).toBeNull();
  });

  it("returns null for non-object primitive (string)", () => {
    expect(migrateData("hello" as any)).toBeNull();
  });

  it("returns null for non-object primitive (number)", () => {
    expect(migrateData(42 as any)).toBeNull();
  });

  it("extracts documents from object with version + documents", () => {
    const docs = [
      { id: "m1", cat: "vehicule", type: "RCA", title: "Test", due: "2024-01-01", amt: 100, rec: "none" },
      { id: "m2", cat: "casa", type: "Gaz", title: "Gas", due: "2024-06-01", amt: 50, rec: "monthly" },
    ];
    const stored = { version: 1, documents: docs };
    const result = migrateData(stored as any);
    expect(result).toEqual(docs);
    expect(result!.length).toBe(2);
  });

  it("returns null for object with empty documents array missing id", () => {
    const stored = { version: 1, documents: "not-an-array" };
    expect(migrateData(stored as any)).toBeNull();
  });

  it("returns null for array of primitives", () => {
    expect(migrateData([1, 2, 3] as any)).toBeNull();
  });

  it("returns null for array of objects without id field", () => {
    expect(migrateData([{ name: "foo" }, { name: "bar" }] as any)).toBeNull();
  });

  it("accepts array where first element has id field", () => {
    const docs = [{ id: "x1", cat: "personal", type: "CI", title: "ID", due: "2025-01-01", amt: null, rec: "none" }];
    expect(migrateData(docs as any)).toEqual(docs);
  });
});

// ─── Formatter Edge Cases ───────────────────────────────

describe("formatDate edge cases", () => {
  it("returns dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("returns dash for null/undefined", () => {
    expect(formatDate(null as any)).toBe("—");
    expect(formatDate(undefined as any)).toBe("—");
  });

  it("formats last day of year correctly (RO)", () => {
    expect(formatDate("2024-12-31", "ro")).toBe("31.12.2024");
  });

  it("formats first day of year correctly (EN)", () => {
    expect(formatDate("2024-01-01", "en")).toBe("01/01/2024");
  });

  it("defaults to Romanian when no lang specified", () => {
    expect(formatDate("2024-06-15")).toBe("15.06.2024");
  });
});

describe("formatMoney edge cases", () => {
  it("returns empty for undefined amount", () => {
    expect(formatMoney(undefined as any)).toBe("");
  });

  it("formats USD with $ symbol", () => {
    const result = formatMoney(100, "USD", "en");
    expect(result).toContain("$");
  });

  it("formats EUR with € symbol (en locale)", () => {
    const result = formatMoney(100, "EUR", "en");
    expect(result).toContain("€");
  });

  it("defaults to RON and RO locale", () => {
    const result = formatMoney(500);
    expect(result).toContain("lei");
  });
});

describe("formatDaysRemaining edge cases", () => {
  it("shows singular overdue for -1 day (RO)", () => {
    const result = formatDaysRemaining(-1, "ro");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("shows plural overdue for -1 day (EN)", () => {
    const result = formatDaysRemaining(-1, "en");
    expect(result).toBeTruthy();
  });

  it("shows today for 0 (RO)", () => {
    const result = formatDaysRemaining(0, "ro");
    expect(result.toLowerCase()).toContain("astăzi");
  });

  it("shows tomorrow for 1 (RO)", () => {
    const result = formatDaysRemaining(1, "ro");
    expect(result.toLowerCase()).toContain("mâine");
  });

  it("shows days count for large values", () => {
    const result = formatDaysRemaining(365, "en");
    expect(result).toContain("365");
  });

  it("defaults to Romanian", () => {
    const result = formatDaysRemaining(5);
    expect(result).toContain("5");
  });
});

// ─── i18n New Keys Completeness ─────────────────────────

describe("i18n new keys (health, notifications, digest)", () => {
  const newKeys = [
    // Health score keys
    "health_score", "health_critical", "health_attention", "health_good",
    "health_hint_expired", "health_hint_warning",
    // Notification digest keys
    "notif_digest_title", "notif_digest_body_zero",
    "notif_digest_body_one", "notif_digest_body_plural",
    // Smart notification keys
    "notif_smart_rca", "notif_smart_itp", "notif_smart_tax",
    "notif_smart_utility", "notif_smart_contract", "notif_smart_generic",
  ];

  it("all new keys exist in Romanian", () => {
    for (const key of newKeys) {
      const val = t("ro", key);
      expect(val).not.toBe(key);
    }
  });

  it("all new keys exist in English", () => {
    for (const key of newKeys) {
      const val = t("en", key);
      expect(val).not.toBe(key);
    }
  });

  it("health_hint_expired supports interpolation (RO)", () => {
    const result = t("ro", "health_hint_expired", { n: 3 });
    expect(result).toContain("3");
    expect(result).toContain("expirate");
  });

  it("health_hint_warning supports interpolation (EN)", () => {
    const result = t("en", "health_hint_warning", { n: 5 });
    expect(result).toContain("5");
    expect(result).toContain("due soon");
  });

  it("notif_digest_body_plural supports interpolation", () => {
    const resultRo = t("ro", "notif_digest_body_plural", { n: 4, score: 75 });
    expect(resultRo).toContain("4");
    expect(resultRo).toContain("75");

    const resultEn = t("en", "notif_digest_body_plural", { n: 4, score: 75 });
    expect(resultEn).toContain("4");
    expect(resultEn).toContain("75");
  });
});
