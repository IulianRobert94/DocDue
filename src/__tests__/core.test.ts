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
import { getWarningDaysForRecurrence } from "../core/enrichment";

// Mock react-native Alert for confirmActions tests
jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
}));
import { buildMarkAsPaidAction } from "../core/confirmActions";

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

  it("alert_error key exists in both languages", () => {
    expect(t("ro", "alert_error")).not.toBe("alert_error");
    expect(t("en", "alert_error")).not.toBe("alert_error");
  });
});

// ─── Warning Days by Recurrence ─────────────────────────

describe("getWarningDaysForRecurrence", () => {
  it("returns 3 for weekly", () => {
    expect(getWarningDaysForRecurrence("weekly")).toBe(3);
  });

  it("returns 7 for monthly", () => {
    expect(getWarningDaysForRecurrence("monthly")).toBe(7);
  });

  it("returns 30 for annual", () => {
    expect(getWarningDaysForRecurrence("annual")).toBe(30);
  });

  it("returns 30 for none", () => {
    expect(getWarningDaysForRecurrence("none")).toBe(30);
  });
});

// ─── Enrichment with Different Recurrences ──────────────

describe("enrichDocument recurrence-aware status", () => {
  it("weekly doc with 5 days left is ok (threshold is 3)", () => {
    const doc: RawDocument = {
      id: "w1", cat: "casa", type: "Internet", title: "Weekly",
      due: addDaysToDate(getTodayString(), 5), amt: null, rec: "weekly",
    };
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("ok");
  });

  it("weekly doc with 2 days left is warning (threshold is 3)", () => {
    const doc: RawDocument = {
      id: "w2", cat: "casa", type: "Internet", title: "Weekly",
      due: addDaysToDate(getTodayString(), 2), amt: null, rec: "weekly",
    };
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("warning");
  });

  it("monthly doc with 10 days left is ok (threshold is 7)", () => {
    const doc: RawDocument = {
      id: "m1", cat: "casa", type: "Gaz", title: "Monthly",
      due: addDaysToDate(getTodayString(), 10), amt: 100, rec: "monthly",
    };
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("ok");
  });

  it("monthly doc with 5 days left is warning (threshold is 7)", () => {
    const doc: RawDocument = {
      id: "m2", cat: "casa", type: "Gaz", title: "Monthly",
      due: addDaysToDate(getTodayString(), 5), amt: 100, rec: "monthly",
    };
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("warning");
  });

  it("annual doc with 20 days left is warning (threshold is 30)", () => {
    const doc: RawDocument = {
      id: "a1", cat: "vehicule", type: "RCA", title: "Annual",
      due: addDaysToDate(getTodayString(), 20), amt: 500, rec: "annual",
    };
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("warning");
  });

  it("annual doc with 50 days left is ok (threshold is 30)", () => {
    const doc: RawDocument = {
      id: "a2", cat: "vehicule", type: "RCA", title: "Annual",
      due: addDaysToDate(getTodayString(), 50), amt: 500, rec: "annual",
    };
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("ok");
  });

  it("past-date doc is always expired regardless of recurrence", () => {
    const doc: RawDocument = {
      id: "e1", cat: "vehicule", type: "RCA", title: "Expired",
      due: addDaysToDate(getTodayString(), -1), amt: 500, rec: "annual",
    };
    const enriched = enrichDocument(doc);
    expect(enriched._status).toBe("expired");
    expect(enriched._daysUntil).toBe(-1);
  });
});

// ─── buildMarkAsPaidAction ──────────────────────────────

describe("buildMarkAsPaidAction", () => {
  const makeEnriched = (status: "expired" | "warning" | "ok", rec: "none" | "monthly" | "annual"): EnrichedDocument => ({
    id: "bmp-1", cat: "vehicule", type: "RCA", title: "Test",
    due: "2025-06-01", amt: 500, rec,
    _daysUntil: status === "expired" ? -5 : status === "warning" ? 5 : 50,
    _status: status,
  });

  it("returns undefined for ok status", () => {
    const result = buildMarkAsPaidAction(makeEnriched("ok", "annual"), "ro", () => {});
    expect(result).toBeUndefined();
  });

  it("returns action for expired status", () => {
    const result = buildMarkAsPaidAction(makeEnriched("expired", "annual"), "ro", () => {});
    expect(result).toBeDefined();
    expect(result!.color).toBe("#34C759");
    expect(typeof result!.onPress).toBe("function");
  });

  it("returns action for warning status", () => {
    const result = buildMarkAsPaidAction(makeEnriched("warning", "monthly"), "en", () => {});
    expect(result).toBeDefined();
  });

  it("uses 'paid' label for recurring documents", () => {
    const result = buildMarkAsPaidAction(makeEnriched("expired", "annual"), "en", () => {});
    expect(result!.label).toBe(t("en", "confirm_paid_btn"));
    expect(result!.icon).toBe("checkmark-circle");
  });

  it("uses 'resolved' label for non-recurring documents", () => {
    const result = buildMarkAsPaidAction(makeEnriched("expired", "none"), "en", () => {});
    expect(result!.label).toBe(t("en", "confirm_resolved_btn"));
    expect(result!.icon).toBe("checkmark-done");
  });
});

// ─── Validation Edge Cases ──────────────────────────────

describe("validateDocument edge cases", () => {
  it("rejects whitespace-only title", () => {
    const doc = { title: "   ", due: "2024-12-31", cat: "vehicule" as const };
    const errors = validateDocument(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid date format", () => {
    const doc = { title: "Test", due: "not-a-date", cat: "vehicule" as const };
    const errors = validateDocument(doc);
    expect(errors.some((e) => e.length > 0)).toBe(true);
  });

  it("rejects unknown category", () => {
    const doc = { title: "Test", due: "2024-12-31", cat: "unknown" as any };
    const errors = validateDocument(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects missing category", () => {
    const doc = { title: "Test", due: "2024-12-31" };
    const errors = validateDocument(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts empty string amount as valid (converts to null)", () => {
    const doc = { title: "Test", due: "2024-12-31", cat: "vehicule" as const, amt: "" as any };
    const errors = validateDocument(doc);
    expect(errors).toEqual([]);
  });

  it("rejects amount exceeding max (999999999)", () => {
    const doc = { title: "Test", due: "2024-12-31", cat: "vehicule" as const, amt: 1_000_000_000 };
    const errors = validateDocument(doc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts zero amount", () => {
    const doc = { title: "Test", due: "2024-12-31", cat: "vehicule" as const, amt: 0 };
    const errors = validateDocument(doc);
    expect(errors).toEqual([]);
  });
});

// ─── parseLocalDate Edge Cases ──────────────────────────

describe("parseLocalDate edge cases", () => {
  it("rejects Feb 30 (auto-correction detection)", () => {
    const date = parseLocalDate("2024-02-30");
    expect(isNaN(date.getTime())).toBe(true);
  });

  it("rejects Feb 29 in non-leap year", () => {
    const date = parseLocalDate("2025-02-29");
    expect(isNaN(date.getTime())).toBe(true);
  });

  it("accepts Feb 29 in leap year", () => {
    const date = parseLocalDate("2024-02-29");
    expect(isNaN(date.getTime())).toBe(false);
    expect(date.getDate()).toBe(29);
  });

  it("rejects day 0", () => {
    const date = parseLocalDate("2024-01-00");
    expect(isNaN(date.getTime())).toBe(true);
  });

  it("rejects month 0", () => {
    const date = parseLocalDate("2024-00-15");
    expect(isNaN(date.getTime())).toBe(true);
  });

  it("rejects day 32", () => {
    const date = parseLocalDate("2024-01-32");
    expect(isNaN(date.getTime())).toBe(true);
  });

  it("handles single-segment string", () => {
    const date = parseLocalDate("20240315");
    expect(isNaN(date.getTime())).toBe(true);
  });
});

// ─── addDaysToDate / addMonthsToDate Edge Cases ─────────

describe("addDaysToDate edge cases", () => {
  it("returns original string for invalid date", () => {
    expect(addDaysToDate("not-a-date", 5)).toBe("not-a-date");
  });

  it("handles adding 0 days", () => {
    expect(addDaysToDate("2024-06-15", 0)).toBe("2024-06-15");
  });

  it("handles leap year day addition", () => {
    expect(addDaysToDate("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("addMonthsToDate edge cases", () => {
  it("returns original string for invalid date", () => {
    expect(addMonthsToDate("invalid", 1)).toBe("invalid");
  });

  it("clamps Jan 30 + 1 month to Feb 29 in leap year", () => {
    expect(addMonthsToDate("2024-01-30", 1)).toBe("2024-02-29");
  });

  it("clamps Jan 30 + 1 month to Feb 28 in non-leap year", () => {
    expect(addMonthsToDate("2025-01-30", 1)).toBe("2025-02-28");
  });

  it("handles adding 0 months", () => {
    expect(addMonthsToDate("2024-06-15", 0)).toBe("2024-06-15");
  });
});

// ─── sortDocumentsByField Additional Cases ──────────────

describe("sortDocumentsByField additional", () => {
  const makeDocs = (): EnrichedDocument[] => [
    { id: "1", cat: "vehicule", type: "RCA", title: "B", due: "2024-06-01", amt: 200, rec: "none", _daysUntil: 10, _status: "warning" },
    { id: "2", cat: "vehicule", type: "ITP", title: "A", due: "2024-03-01", amt: 50, rec: "none", _daysUntil: -5, _status: "expired" },
    { id: "3", cat: "casa", type: "Gaz", title: "C", due: "2024-12-01", amt: 300, rec: "none", _daysUntil: 100, _status: "ok" },
  ];

  it("sorts by date ascending", () => {
    const sorted = sortDocumentsByField(makeDocs(), "date", "asc");
    expect(sorted[0]._daysUntil).toBe(-5);
    expect(sorted[2]._daysUntil).toBe(100);
  });

  it("sorts by date descending", () => {
    const sorted = sortDocumentsByField(makeDocs(), "date", "desc");
    expect(sorted[0]._daysUntil).toBe(100);
    expect(sorted[2]._daysUntil).toBe(-5);
  });

  it("sorts by urgency descending (ok first)", () => {
    const sorted = sortDocumentsByField(makeDocs(), "urgency", "desc");
    expect(sorted[0]._status).toBe("ok");
    expect(sorted[2]._status).toBe("expired");
  });

  it("sorts by name descending", () => {
    const sorted = sortDocumentsByField(makeDocs(), "name", "desc");
    expect(sorted[0].title).toBe("C");
    expect(sorted[2].title).toBe("A");
  });

  it("sorts by amount ascending", () => {
    const sorted = sortDocumentsByField(makeDocs(), "amount", "asc");
    expect(sorted[0].amt).toBe(50);
    expect(sorted[2].amt).toBe(300);
  });

  it("handles null amounts in sort", () => {
    const docs: EnrichedDocument[] = [
      { id: "1", cat: "vehicule", type: "RCA", title: "A", due: "2024-06-01", amt: null, rec: "none", _daysUntil: 10, _status: "ok" },
      { id: "2", cat: "vehicule", type: "ITP", title: "B", due: "2024-06-01", amt: 100, rec: "none", _daysUntil: 10, _status: "ok" },
    ];
    const sorted = sortDocumentsByField(docs, "amount", "asc");
    expect(sorted[0].amt).toBe(null);
    expect(sorted[1].amt).toBe(100);
  });

  it("does not mutate original array", () => {
    const original = makeDocs();
    const firstId = original[0].id;
    sortDocumentsByField(original, "name", "asc");
    expect(original[0].id).toBe(firstId);
  });
});

// ─── Health Score Boundary Values ───────────────────────

describe("getHealthScoreColor boundaries", () => {
  it("score 0 is red", () => {
    expect(getHealthScoreColor(0)).toBe("#FF3B30");
  });

  it("score 40 is red (boundary)", () => {
    expect(getHealthScoreColor(40)).toBe("#FF3B30");
  });

  it("score 41 is orange", () => {
    expect(getHealthScoreColor(41)).toBe("#FF9500");
  });

  it("score 70 is orange (boundary)", () => {
    expect(getHealthScoreColor(70)).toBe("#FF9500");
  });

  it("score 71 is green", () => {
    expect(getHealthScoreColor(71)).toBe("#34C759");
  });

  it("score 100 is green", () => {
    expect(getHealthScoreColor(100)).toBe("#34C759");
  });
});

// ─── translateSubtype Edge Cases ────────────────────────

describe("translateSubtype edge cases", () => {
  it("returns original for unknown subtype in English", () => {
    expect(translateSubtype("SomethingNew", "en")).toBe("SomethingNew");
  });

  it("returns original for empty string", () => {
    expect(translateSubtype("", "ro")).toBe("");
    expect(translateSubtype("", "en")).toBe("");
  });

  it("translates Amendă to Fine in English", () => {
    expect(translateSubtype("Amendă", "en")).toBe("Fine");
  });

  it("translates Pașaport to Passport in English", () => {
    expect(translateSubtype("Pașaport", "en")).toBe("Passport");
  });
});

// ─── i18n Fallback Behavior ─────────────────────────────

describe("i18n fallback behavior", () => {
  it("returns raw key when key doesn't exist in any language", () => {
    expect(t("en", "nonexistent_key_xyz")).toBe("nonexistent_key_xyz");
  });

  it("falls back to Romanian when English key is missing", () => {
    // Both languages should have all keys, but verify fallback works
    const roValue = t("ro", "nav_home");
    expect(roValue).toBeTruthy();
    expect(roValue).not.toBe("nav_home");
  });

  it("handles empty params object", () => {
    const result = t("en", "nav_home", {});
    expect(result).toBe("Home");
  });

  it("leaves unreplaced placeholders as-is", () => {
    // paid_on has {date} placeholder
    const result = t("en", "paid_on");
    expect(result).toContain("{date}");
  });
});

// ─── i18n RO/EN Key Parity (exhaustive) ─────────────────

describe("i18n RO/EN parity", () => {
  // Access the dictionaries via t() — check every RO key exists in EN
  // We can't access TRANSLATIONS directly, but we can check known keys
  const ALL_KEYS = [
    // Navigation
    "nav_home", "nav_alerts", "nav_search", "nav_settings", "nav_add", "nav_label",
    // Status
    "status_expired", "status_warning", "status_ok",
    "status_expired_plural", "status_warning_plural", "status_ok_plural",
    // Categories
    "cat_vehicule", "cat_personal", "cat_casa", "cat_financiar",
    // Category card
    "doc_singular", "doc_plural",
    // Recurrence
    "rec_none", "rec_weekly", "rec_monthly", "rec_annual",
    "rec_none_short", "rec_weekly_short", "rec_monthly_short", "rec_annual_short",
    // Sort
    "sort_urgency", "sort_date", "sort_date_asc", "sort_date_desc",
    "sort_amount", "sort_name", "sort_label",
    // Days
    "days_overdue_plural", "days_overdue_singular", "days_today", "days_tomorrow", "days_future",
    // Home
    "home_needs_attention", "home_see_all", "home_welcome", "home_welcome_sub", "home_30days",
    // Months
    "month_short_1", "month_short_2", "month_short_3", "month_short_4",
    "month_short_5", "month_short_6", "month_short_7", "month_short_8",
    "month_short_9", "month_short_10", "month_short_11", "month_short_12",
    // Alerts
    "alerts_title", "alerts_needs_attention", "alerts_none_title", "alerts_empty",
    // Search
    "search_title", "search_placeholder", "search_no_results", "search_count",
    "search_no_filter_results", "search_all",
    // Document detail
    "detail_due", "detail_amount", "detail_recurrence", "detail_type", "detail_notes",
    "detail_pay_next", "detail_resolved", "detail_edit", "detail_delete",
    // Form
    "form_add_title", "form_edit_title", "form_category", "form_type", "form_title",
    "form_asset", "form_due", "form_amount", "form_recurrence", "form_notes",
    "form_type_select", "form_title_placeholder", "form_asset_placeholder",
    "form_notes_placeholder", "form_custom_type_placeholder", "form_search_type",
    "form_save", "form_done", "form_date_placeholder",
    // Validation
    "val_title_required", "val_date_required", "val_date_invalid",
    "val_amount_positive", "val_category_invalid",
    // Confirm dialogs
    "confirm_discard_title", "confirm_discard_msg", "confirm_discard_btn",
    "confirm_delete_title", "confirm_delete_msg", "confirm_cancel", "confirm_delete_btn",
    "confirm_paid_title", "confirm_paid_msg", "confirm_paid_btn",
    "confirm_resolved_title", "confirm_resolved_msg", "confirm_resolved_btn",
    "confirm_reset_title", "confirm_reset_msg", "confirm_reset_btn",
    "confirm_clear_title", "confirm_clear_msg", "confirm_clear_btn",
    // Toasts
    "toast_added", "toast_updated", "toast_deleted", "toast_paid_next",
    "toast_resolved", "toast_demo_restored", "toast_all_cleared", "toast_save_error",
    "save_error_title", "save_error_msg",
    // Settings
    "settings_title", "settings_general", "settings_appearance", "settings_alerts",
    "settings_data", "settings_about", "settings_total_docs", "settings_version",
    "settings_theme", "settings_currency", "settings_language",
    "settings_warning_threshold", "settings_warning_desc",
    "settings_reminders", "settings_reminders_desc",
    "settings_export_excel", "settings_import_excel",
    "settings_export_success", "settings_export_error",
    "settings_import_success", "settings_import_error", "settings_import_no_data",
    "settings_import_confirm_title", "settings_import_confirm_msg", "settings_import_confirm_btn",
    "settings_reset_demo", "settings_reset_demo_desc",
    "settings_clear_all", "settings_clear_all_desc", "settings_about_text",
    "settings_days_suffix", "settings_per_category", "settings_all_categories",
    "settings_default", "settings_use_global",
    // Buttons
    "btn_close", "btn_back",
    // Alerts
    "alert_success", "alert_error", "alert_notice",
    // Missing
    "no_documents", "doc_not_found",
    // Privacy
    "settings_privacy", "settings_privacy_footer",
    // IAP
    "premium_subscribe", "iap_restore_ok", "iap_restore_none", "purchase_error",
    "plan_monthly", "plan_annual", "plan_lifetime", "plan_month", "plan_best_value",
    // Share
    "share_app", "share_app_message",
    // Congrats
    "congrats_paid",
    // Weekly
    "notif_weekly_title", "notif_weekly_body",
    // Accessibility
    "a11y_search_btn", "a11y_see_all_alerts", "a11y_close_modal", "a11y_go_back",
    "a11y_add_document", "a11y_save_document", "a11y_cancel",
    "a11y_delete_document", "a11y_edit_document", "a11y_mark_paid",
    "a11y_sort_by", "a11y_select_category", "a11y_select_type",
    "a11y_select_recurrence", "a11y_open_document", "a11y_open_category",
    "a11y_theme_toggle", "a11y_close_image", "a11y_image_preview",
    "a11y_health_score", "a11y_onboarding_dot",
    // Biometric
    "biometric_lock", "biometric_desc", "biometric_unlock", "biometric_retry",
    "biometric_failed", "biometric_not_available", "biometric_section", "biometric_locked_out",
    // Attachments
    "attachments", "add_photo", "add_file", "remove_attachment", "attachment_limit",
    "from_camera", "from_gallery", "open_file", "attachment_error",
    // Backup
    "backup_section", "backup_create", "backup_restore", "backup_last",
    "backup_include_attachments", "backup_include_desc",
    "backup_success", "attachments_skipped", "backup_error", "sharing_unavailable",
    "all_docs_exist", "duplicates_skipped",
    "restore_replace", "restore_merge", "restore_confirm",
    "restore_success", "restore_error", "restore_invalid", "restore_choose",
    // Notifications
    "notif_reminder_title", "notif_reminder_body",
    "notif_due_today_title", "notif_due_today_body",
    "notif_permission_title", "notif_permission_denied",
    "settings_notifications", "settings_notifications_desc",
    "settings_notifications_enable", "settings_reminder_days", "settings_reminder_days_desc",
    // Permissions
    "photo_permission",
    // Calendar
    "cal_add", "cal_added", "cal_error", "cal_permission_denied",
    // Analytics
    "analytics_title", "analytics_30days", "analytics_total",
    "analytics_by_category", "analytics_by_month", "analytics_no_data",
    "analytics_total_paid", "analytics_avg_monthly", "analytics_based_on",
    // Sharing
    "share_document", "share_summary",
    // Premium
    "premium_title", "premium_subtitle",
    "premium_feature_unlimited", "premium_feature_analytics",
    "premium_feature_backup", "premium_feature_widgets", "premium_feature_export",
    "settings_contact_support",
    "demo_banner_text", "demo_banner_dismiss",
    "premium_upgrade", "premium_restore", "premium_limit_title", "premium_limit_msg",
    "premium_active", "premium_section", "premium_free_count", "premium_required",
    "premium_early_access_note", "premium_unlock_free",
    // Payment history
    "payment_history", "total_paid", "paid_on", "payment_count",
    // Notification actions
    "notif_action_renewed", "notif_action_tomorrow",
    // Health
    "health_score", "health_critical", "health_attention", "health_good",
    "health_hint_expired", "health_hint_warning",
    // Digest
    "notif_digest_title", "notif_digest_body_zero",
    "notif_digest_body_one", "notif_digest_body_plural",
    // Smart notifications
    "notif_smart_rca", "notif_smart_itp", "notif_smart_tax",
    "notif_smart_utility", "notif_smart_contract", "notif_smart_generic",
    // Countdown
    "countdown_today", "countdown_tomorrow", "countdown_days",
    // Review
    "review_enjoying", "review_rate",
    // Error boundary
    "error_title", "error_subtitle", "error_retry",
    // Smart defaults
    "smart_default_applied",
    // Quick actions
    "quick_action_add", "quick_action_alerts", "quick_action_search",
    // Privacy sections
    "privacy_last_updated",
    "privacy_data_collected_title", "privacy_data_collected_body",
    "privacy_permissions_title", "privacy_permissions_body",
    "privacy_storage_title", "privacy_storage_body",
    "privacy_sharing_title", "privacy_sharing_body",
    "privacy_deletion_title", "privacy_deletion_body",
    "privacy_contact_title", "privacy_contact_body",
    // Onboarding
    "onboarding_slide1_title", "onboarding_slide1_desc",
    "onboarding_slide2_title", "onboarding_slide2_desc",
    "onboarding_slide3_title", "onboarding_slide3_desc",
    "onboarding_slide4_title", "onboarding_slide4_desc",
    "onboarding_skip", "onboarding_next", "onboarding_start",
  ];

  it("every key exists in Romanian (not falling back to raw key)", () => {
    const missing: string[] = [];
    for (const key of ALL_KEYS) {
      if (t("ro", key) === key) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it("every key exists in English (not falling back to raw key)", () => {
    const missing: string[] = [];
    for (const key of ALL_KEYS) {
      if (t("en", key) === key) missing.push(key);
    }
    expect(missing).toEqual([]);
  });
});

// ─── Demo Data Validity ─────────────────────────────────

describe("demo data validity", () => {
  it("every demo document passes validation", () => {
    const docs = createDemoDocuments();
    for (const doc of docs) {
      const errors = validateDocument(doc);
      expect(errors).toEqual([]);
    }
  });

  it("every demo document has a valid category", () => {
    const docs = createDemoDocuments();
    const validCats = ["vehicule", "casa", "personal", "financiar"];
    for (const doc of docs) {
      expect(validCats).toContain(doc.cat);
    }
  });

  it("every demo document has a valid recurrence", () => {
    const docs = createDemoDocuments();
    const validRecs = ["none", "weekly", "monthly", "annual"];
    for (const doc of docs) {
      expect(validRecs).toContain(doc.rec);
    }
  });

  it("demo documents include all 4 categories", () => {
    const docs = createDemoDocuments();
    const cats = new Set(docs.map((d) => d.cat));
    expect(cats.size).toBe(4);
  });

  it("all demo IDs are unique", () => {
    const docs = createDemoDocuments();
    const ids = docs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Enrich → Strip Round-Trip ──────────────────────────

describe("enrich-strip round-trip", () => {
  it("strip(enrich(doc)) returns original document shape", () => {
    const original: RawDocument = {
      id: "rt-1", cat: "vehicule", type: "RCA", title: "Round Trip",
      due: addDaysToDate(getTodayString(), 30), amt: 500, rec: "annual",
      notes: "Test note", asset: "B-99-ABC",
    };
    const enriched = enrichDocument(original);
    const stripped = stripEnrichedFields(enriched);

    expect(stripped).toEqual(original);
    expect((stripped as any)._daysUntil).toBeUndefined();
    expect((stripped as any)._status).toBeUndefined();
  });

  it("preserves all optional fields through round-trip", () => {
    const original: RawDocument = {
      id: "rt-2", cat: "casa", type: "Gaz", title: "With All Fields",
      due: addDaysToDate(getTodayString(), 10), amt: 185, rec: "monthly",
      notes: "Note here", asset: "Apt 1",
      attachments: [{ id: "a1", uri: "file://test.jpg", name: "test.jpg", type: "image" }],
      paymentHistory: [
        { date: "2024-01-15", dueDate: "2024-01-10", amt: 180 },
      ],
    };
    const stripped = stripEnrichedFields(enrichDocument(original));

    expect(stripped.notes).toBe("Note here");
    expect(stripped.asset).toBe("Apt 1");
    expect(stripped.attachments).toHaveLength(1);
    expect(stripped.paymentHistory).toHaveLength(1);
    expect(stripped.paymentHistory![0].amt).toBe(180);
  });

  it("multiple enrich-strip cycles produce stable output", () => {
    const original: RawDocument = {
      id: "rt-3", cat: "personal", type: "Pașaport", title: "Passport",
      due: addDaysToDate(getTodayString(), 100), amt: null, rec: "none",
    };
    const cycle1 = stripEnrichedFields(enrichDocument(original));
    const cycle2 = stripEnrichedFields(enrichDocument(cycle1));
    const cycle3 = stripEnrichedFields(enrichDocument(cycle2));

    expect(cycle3).toEqual(original);
  });
});

// ─── Constants Integrity ────────────────────────────────

import { CATEGORIES, RECURRENCE_OPTIONS, CURRENCY_OPTIONS, STATUS_DISPLAY } from "../core/constants";

describe("constants integrity", () => {
  it("CATEGORIES has exactly 4 entries", () => {
    expect(Object.keys(CATEGORIES)).toHaveLength(4);
  });

  it("every category has required fields", () => {
    for (const [id, cat] of Object.entries(CATEGORIES)) {
      expect(cat.id).toBe(id);
      expect(cat.labelKey).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.iconFilled).toBeTruthy();
      expect(cat.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(cat.subtypes.length).toBeGreaterThan(0);
    }
  });

  it("every category has Altele as last subtype", () => {
    for (const cat of Object.values(CATEGORIES)) {
      expect(cat.subtypes[cat.subtypes.length - 1]).toBe("Altele");
    }
  });

  it("no duplicate subtypes within a category", () => {
    for (const cat of Object.values(CATEGORIES)) {
      const unique = new Set(cat.subtypes);
      expect(unique.size).toBe(cat.subtypes.length);
    }
  });

  it("STATUS_DISPLAY has all 3 statuses", () => {
    expect(STATUS_DISPLAY.expired).toBeDefined();
    expect(STATUS_DISPLAY.warning).toBeDefined();
    expect(STATUS_DISPLAY.ok).toBeDefined();
  });

  it("status colors match brand spec", () => {
    expect(STATUS_DISPLAY.expired.color).toBe("#FF3B30");
    expect(STATUS_DISPLAY.warning.color).toBe("#FF9500");
    expect(STATUS_DISPLAY.ok.color).toBe("#34C759");
  });

  it("RECURRENCE_OPTIONS has 4 entries in correct order", () => {
    expect(RECURRENCE_OPTIONS).toHaveLength(4);
    expect(RECURRENCE_OPTIONS.map((r) => r.value)).toEqual(["none", "weekly", "monthly", "annual"]);
  });

  it("CURRENCY_OPTIONS has 3 entries", () => {
    expect(CURRENCY_OPTIONS).toHaveLength(3);
    expect(CURRENCY_OPTIONS.map((c) => c.value)).toEqual(["RON", "EUR", "USD"]);
  });
});

// ─── Smart Defaults Coverage ────────────────────────────

describe("smart defaults coverage", () => {
  it("every category subtype (except Altele) has a smart default", () => {
    const missing: string[] = [];
    for (const cat of Object.values(CATEGORIES)) {
      for (const subtype of cat.subtypes) {
        if (subtype === "Altele") continue;
        if (!getSmartDefaults(subtype)) {
          missing.push(`${cat.id}/${subtype}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("all smart defaults return valid recurrence values", () => {
    const validRecs = ["none", "weekly", "monthly", "annual"];
    for (const cat of Object.values(CATEGORIES)) {
      for (const subtype of cat.subtypes) {
        const defaults = getSmartDefaults(subtype);
        if (defaults) {
          expect(validRecs).toContain(defaults.recurrence);
        }
      }
    }
  });
});

// ─── Migration: Recurrence Migration ────────────────────

describe("migration recurrence upgrade", () => {
  it("migrates legacy daily → weekly", () => {
    const docs = [{ id: "1", cat: "casa", type: "Gaz", title: "Test", due: "2024-01-01", amt: 50, rec: "daily" }];
    const result = migrateData(docs as any);
    expect(result![0].rec).toBe("weekly");
  });

  it("migrates legacy quarterly → monthly", () => {
    const docs = [{ id: "1", cat: "financiar", type: "Tax", title: "Test", due: "2024-01-01", amt: 100, rec: "quarterly" }];
    const result = migrateData(docs as any);
    expect(result![0].rec).toBe("monthly");
  });

  it("migrates legacy biannual → annual", () => {
    const docs = [{ id: "1", cat: "vehicule", type: "ITP", title: "Test", due: "2024-01-01", amt: null, rec: "biannual" }];
    const result = migrateData(docs as any);
    expect(result![0].rec).toBe("annual");
  });

  it("preserves current recurrence values unchanged", () => {
    const docs = [
      { id: "1", cat: "casa", type: "Gaz", title: "A", due: "2024-01-01", amt: 50, rec: "monthly" },
      { id: "2", cat: "vehicule", type: "RCA", title: "B", due: "2024-01-01", amt: 500, rec: "annual" },
      { id: "3", cat: "personal", type: "CI", title: "C", due: "2024-01-01", amt: null, rec: "none" },
    ];
    const result = migrateData(docs as any);
    expect(result![0].rec).toBe("monthly");
    expect(result![1].rec).toBe("annual");
    expect(result![2].rec).toBe("none");
  });
});
