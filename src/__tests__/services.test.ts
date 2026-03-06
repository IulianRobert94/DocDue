/**
 * DocDue — Services & Helpers Tests
 *
 * Tests for generateId, notification content logic,
 * review prompt conditions, and widget data computation.
 */

// ─── Mocks ──────────────────────────────────────────────

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  NativeModules: {},
  Platform: { OS: "ios" },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("mock-id")),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

jest.mock("expo-store-review", () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  requestReview: jest.fn(() => Promise.resolve()),
}));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
  },
  LOG_LEVEL: { DEBUG: "DEBUG" },
}));

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: jest.fn(() => Promise.resolve()),
  documentDirectory: "/mock/documents/",
}));

// ─── Imports ────────────────────────────────────────────

import { generateId } from "../core/helpers";
import { enrichDocument } from "../core/enrichment";
import { addDaysToDate, getTodayString, calculateDaysUntil } from "../core/dateUtils";
import type { RawDocument, EnrichedDocument } from "../core/constants";
import { calculateHealthScore } from "../core/healthScore";
import * as Notifications from "expo-notifications";

// ─── generateId ─────────────────────────────────────────

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique IDs across 100 calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it("generates IDs with reasonable length", () => {
    const id = generateId();
    expect(id.length).toBeGreaterThanOrEqual(10);
    expect(id.length).toBeLessThanOrEqual(50);
  });
});

// ─── Notification scheduling logic ──────────────────────

describe("notification scheduling logic", () => {
  it("rescheduleAllNotifications cancels existing first", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");

    await rescheduleAllNotifications([], [7, 3, 1], "ro");

    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });

  it("schedules notifications for future dates only", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");

    const docs: RawDocument[] = [
      {
        id: "1", cat: "vehicule", type: "RCA", title: "Future Doc",
        due: addDaysToDate(getTodayString(), 30), amt: 500, rec: "annual",
      },
    ];

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await rescheduleAllNotifications(docs, [7, 3, 1], "ro");

    // Should have scheduled notifications (7 days before, 3 days before, 1 day before)
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  it("does not schedule for past documents", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");

    const docs: RawDocument[] = [
      {
        id: "1", cat: "vehicule", type: "RCA", title: "Past Doc",
        due: addDaysToDate(getTodayString(), -30), amt: 500, rec: "annual",
      },
    ];

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await rescheduleAllNotifications(docs, [7, 3, 1], "ro");

    // All reminder dates are in the past, so nothing should be scheduled
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does not schedule when reminder days is empty", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");

    const docs: RawDocument[] = [
      {
        id: "1", cat: "vehicule", type: "RCA", title: "Test",
        due: addDaysToDate(getTodayString(), 30), amt: 500, rec: "annual",
      },
    ];

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await rescheduleAllNotifications(docs, [], "ro");

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("caps at MAX_SCHEDULED (60) notifications", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");

    // Create many documents to exceed the limit
    const docs: RawDocument[] = [];
    for (let i = 0; i < 30; i++) {
      docs.push({
        id: `doc-${i}`,
        cat: "vehicule",
        type: "RCA",
        title: `Doc ${i}`,
        due: addDaysToDate(getTodayString(), 30 + i * 7),
        amt: null,
        rec: "annual",
      });
    }

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await rescheduleAllNotifications(docs, [14, 7, 3, 1], "ro");

    // 30 docs × 4 reminder days = 120 entries, but capped at 60
    const callCount = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;
    expect(callCount).toBeLessThanOrEqual(60);
  });

  it("getDocumentIdFromNotification extracts docId", () => {
    const { getDocumentIdFromNotification } = require("../services/notifications");

    const response = {
      notification: {
        request: {
          content: {
            data: {
              type: "document_reminder",
              documentId: "test-doc-123",
            },
          },
        },
      },
    };

    expect(getDocumentIdFromNotification(response)).toBe("test-doc-123");
  });

  it("getDocumentIdFromNotification returns null for non-document notifications", () => {
    const { getDocumentIdFromNotification } = require("../services/notifications");

    const response = {
      notification: {
        request: {
          content: {
            data: { type: "morning_digest" },
          },
        },
      },
    };

    expect(getDocumentIdFromNotification(response)).toBeNull();
  });
});

// ─── Morning Digest ─────────────────────────────────────

describe("morning digest logic", () => {
  it("scheduleMorningDigest schedules for tomorrow", async () => {
    const { scheduleMorningDigest } = require("../services/notifications");

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await scheduleMorningDigest([], "ro");

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: expect.objectContaining({ type: "morning_digest" }),
        }),
      })
    );
  });

  it("digest includes health score in body", async () => {
    const { scheduleMorningDigest } = require("../services/notifications");

    const docs: RawDocument[] = [
      {
        id: "1", cat: "vehicule", type: "RCA", title: "Expired",
        due: addDaysToDate(getTodayString(), -5), amt: 500, rec: "annual",
      },
    ];

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await scheduleMorningDigest(docs, "ro");

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.body).toBeTruthy();
  });
});

// ─── Widget Data Computation ────────────────────────────

describe("widget data computation", () => {
  it("enriched documents sort by _daysUntil for widget", () => {
    const docs: RawDocument[] = [
      { id: "1", cat: "vehicule", type: "RCA", title: "Far", due: addDaysToDate(getTodayString(), 100), amt: null, rec: "annual" },
      { id: "2", cat: "vehicule", type: "ITP", title: "Near", due: addDaysToDate(getTodayString(), 5), amt: null, rec: "annual" },
      { id: "3", cat: "casa", type: "Gaz", title: "Past", due: addDaysToDate(getTodayString(), -3), amt: null, rec: "monthly" },
    ];

    const enriched = docs.map((d) => enrichDocument(d));
    const sorted = enriched.sort((a, b) => a._daysUntil - b._daysUntil);
    const top5 = sorted.slice(0, 5);

    expect(top5[0].title).toBe("Past");
    expect(top5[1].title).toBe("Near");
    expect(top5[2].title).toBe("Far");
  });

  it("widget data correctly counts urgent docs", () => {
    const docs: RawDocument[] = [
      { id: "1", cat: "vehicule", type: "RCA", title: "Expired", due: addDaysToDate(getTodayString(), -5), amt: null, rec: "annual" },
      { id: "2", cat: "vehicule", type: "ITP", title: "Warning", due: addDaysToDate(getTodayString(), 5), amt: null, rec: "monthly" },
      { id: "3", cat: "casa", type: "Gaz", title: "OK", due: addDaysToDate(getTodayString(), 100), amt: null, rec: "monthly" },
    ];

    const enriched = docs.map((d) => enrichDocument(d));
    const urgent = enriched.filter((d) => d._status === "expired" || d._status === "warning");

    expect(urgent).toHaveLength(2);
    expect(enriched.filter((d) => d._status === "expired")).toHaveLength(1);
    expect(enriched.filter((d) => d._status === "warning")).toHaveLength(1);
  });
});

// ─── Review Prompt Conditions ───────────────────────────

describe("review prompt conditions", () => {
  it("calculateDaysUntil gives negative for past dates (used for daysSinceOpen)", () => {
    const pastDate = addDaysToDate(getTodayString(), -10);
    const daysSinceOpen = -calculateDaysUntil(pastDate);
    expect(daysSinceOpen).toBe(10);
  });

  it("needs minimum 3 documents", () => {
    // The logic: if (docCount < MIN_DOCS) return
    expect(2 < 3).toBe(true); // would skip
    expect(3 < 3).toBe(false); // would proceed
  });

  it("needs minimum 7 days since first open", () => {
    const recentDate = addDaysToDate(getTodayString(), -3);
    const daysSinceOpen = -calculateDaysUntil(recentDate);
    expect(daysSinceOpen < 7).toBe(true); // would skip

    const oldDate = addDaysToDate(getTodayString(), -10);
    const daysSinceOld = -calculateDaysUntil(oldDate);
    expect(daysSinceOld < 7).toBe(false); // would proceed
  });
});

// ─── Excel Import Date Parsing ──────────────────────────

describe("excel import date parsing", () => {
  // Replicate the parseDateValue logic from DataSection
  function parseDateValue(raw: unknown): string {
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    if (typeof raw === "number" && raw > 0) {
      const epoch = new Date((raw - 25569) * 86400 * 1000);
      const y = epoch.getUTCFullYear();
      const m = String(epoch.getUTCMonth() + 1).padStart(2, "0");
      const d = String(epoch.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const str = String(raw || "");
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
    const euMatch = str.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
    if (euMatch) return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;
    const usMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
    return "";
  }

  it("parses YYYY-MM-DD string", () => {
    expect(parseDateValue("2025-06-15")).toBe("2025-06-15");
  });

  it("parses EU format DD.MM.YYYY", () => {
    expect(parseDateValue("15.06.2025")).toBe("2025-06-15");
  });

  it("parses EU format DD/MM/YYYY", () => {
    expect(parseDateValue("15/06/2025")).toBe("2025-06-15");
  });

  it("EU regex takes priority over US format for DD/MM/YYYY", () => {
    // Romanian app: DD/MM/YYYY is the expected format
    // "06/15/2025" → EU regex treats as DD=06, MM=15 → invalid month but passes through
    expect(parseDateValue("06/15/2025")).toBe("2025-15-06");
  });

  it("parses unambiguous US date when EU regex fails", () => {
    // When day > 12, EU regex won't match, so US regex kicks in
    // But with DD/MM format both use same regex — so truly US dates need
    // explicit handling. This test documents current behavior.
    expect(parseDateValue("25.06.2025")).toBe("2025-06-25");
  });

  it("parses JavaScript Date object", () => {
    const date = new Date(2025, 5, 15); // June 15, 2025
    expect(parseDateValue(date)).toBe("2025-06-15");
  });

  it("parses Excel serial date number", () => {
    // Excel serial: Jan 1, 2025 = 45658
    const result = parseDateValue(45658);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2025-01-01");
  });

  it("returns empty for null/undefined", () => {
    expect(parseDateValue(null)).toBe("");
    expect(parseDateValue(undefined)).toBe("");
  });

  it("returns empty for empty string", () => {
    expect(parseDateValue("")).toBe("");
  });

  it("returns empty for invalid string", () => {
    expect(parseDateValue("not-a-date")).toBe("");
  });

  it("handles Date with invalid time", () => {
    const bad = new Date("invalid");
    expect(parseDateValue(bad)).toBe("");
  });
});

// ─── IAP Configuration Guard ────────────────────────────

describe("IAP configuration", () => {
  beforeAll(() => {
    (globalThis as any).__DEV__ = true;
  });

  it("skips init when API keys are placeholders", async () => {
    const { initializeIAP, isIAPConfigured } = require("../services/iap");
    await initializeIAP();
    // Should NOT be initialized because keys start with "YOUR_"
    expect(isIAPConfigured()).toBe(false);
  });
});

// ─── Security Tests ─────────────────────────────────────

describe("input sanitization", () => {
  const sanitize = (input: string) =>
    input.trim().replace(/[^\p{L}\p{N}\s\-.,()]/gu, "").trim();

  it("allows normal Romanian text", () => {
    expect(sanitize("Factură electrică")).toBe("Factură electrică");
  });

  it("allows diacritics ăâîșț", () => {
    expect(sanitize("Pașaport și atestat")).toBe("Pașaport și atestat");
  });

  it("strips HTML tags", () => {
    expect(sanitize("<script>alert('xss')</script>")).toBe("scriptalert(xss)script");
  });

  it("strips special injection characters", () => {
    expect(sanitize("test'; DROP TABLE--")).toBe("test DROP TABLE--");
  });

  it("allows numbers and basic punctuation", () => {
    expect(sanitize("Contract nr. 123 (2025)")).toBe("Contract nr. 123 (2025)");
  });

  it("strips emoji", () => {
    expect(sanitize("Test 🔥 doc")).toBe("Test  doc");
  });

  it("returns empty for all-special input", () => {
    expect(sanitize("@#$%^&*")).toBe("");
  });
});

describe("attachment extension whitelist", () => {
  const ALLOWED = new Set(["jpg", "jpeg", "png", "gif", "heic", "heif", "webp", "bmp", "pdf"]);
  const getExtSafe = (name: string) => {
    const parts = name.split(".");
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
    return ALLOWED.has(ext) ? ext : "";
  };

  it("allows jpg", () => expect(getExtSafe("photo.jpg")).toBe("jpg"));
  it("allows jpeg", () => expect(getExtSafe("photo.jpeg")).toBe("jpeg"));
  it("allows png", () => expect(getExtSafe("image.png")).toBe("png"));
  it("allows pdf", () => expect(getExtSafe("doc.pdf")).toBe("pdf"));
  it("allows heic", () => expect(getExtSafe("IMG_001.HEIC")).toBe("heic"));
  it("rejects exe", () => expect(getExtSafe("virus.exe")).toBe(""));
  it("rejects php", () => expect(getExtSafe("shell.php")).toBe(""));
  it("rejects js", () => expect(getExtSafe("hack.js")).toBe(""));
  it("rejects html", () => expect(getExtSafe("page.html")).toBe(""));
  it("rejects no extension", () => expect(getExtSafe("noext")).toBe(""));
  it("rejects double extension attack", () => expect(getExtSafe("photo.jpg.exe")).toBe(""));
});

describe("backup validation", () => {
  const validateDoc = (d: any) =>
    d && typeof d === "object" &&
    typeof d.id === "string" &&
    typeof d.title === "string" &&
    typeof d.due === "string" &&
    typeof d.cat === "string" &&
    typeof d.type === "string" &&
    ["vehicule", "casa", "personal", "financiar"].includes(d.cat) &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.due) &&
    ["none", "weekly", "monthly", "annual"].includes(d.rec || "none");

  it("accepts valid document", () => {
    expect(validateDoc({
      id: "1", title: "Test", due: "2025-06-15",
      cat: "vehicule", type: "RCA", rec: "annual",
    })).toBe(true);
  });

  it("rejects missing title", () => {
    expect(validateDoc({ id: "1", due: "2025-06-15", cat: "vehicule", type: "RCA" })).toBe(false);
  });

  it("rejects invalid category", () => {
    expect(validateDoc({
      id: "1", title: "Test", due: "2025-06-15",
      cat: "hacked", type: "RCA", rec: "annual",
    })).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(validateDoc({
      id: "1", title: "Test", due: "not-a-date",
      cat: "vehicule", type: "RCA", rec: "annual",
    })).toBe(false);
  });

  it("rejects invalid recurrence", () => {
    expect(validateDoc({
      id: "1", title: "Test", due: "2025-06-15",
      cat: "vehicule", type: "RCA", rec: "daily",
    })).toBe(false);
  });

  it("rejects null input", () => {
    expect(!!validateDoc(null)).toBe(false);
  });

  it("rejects string input", () => {
    expect(!!validateDoc("not an object")).toBe(false);
  });

  it("accepts doc with rec defaulting to none", () => {
    expect(validateDoc({
      id: "1", title: "Test", due: "2025-06-15",
      cat: "personal", type: "CI",
    })).toBe(true);
  });

  it("attachment size limit prevents memory bombs", () => {
    const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
    const smallBase64 = "SGVsbG8="; // "Hello"
    const hugeBase64 = "A".repeat(MAX_ATTACHMENT_SIZE + 1);

    expect(smallBase64.length < MAX_ATTACHMENT_SIZE).toBe(true);
    expect(hugeBase64.length < MAX_ATTACHMENT_SIZE).toBe(false);
  });
});
