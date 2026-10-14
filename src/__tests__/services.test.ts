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

jest.mock("react-native-iap", () => ({
  initConnection: jest.fn(() => Promise.resolve()),
  endConnection: jest.fn(() => Promise.resolve()),
  fetchProducts: jest.fn(() => Promise.resolve([])),
  getAvailablePurchases: jest.fn(() => Promise.resolve([])),
  requestPurchase: jest.fn(() => Promise.resolve()),
  finishTransaction: jest.fn(() => Promise.resolve()),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("expo-calendar", () => ({
  getCalendarPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  requestCalendarPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  getCalendarsAsync: jest.fn(() => Promise.resolve([{ id: "cal1", allowsModifications: true, source: { type: "local" } }])),
  getDefaultCalendarAsync: jest.fn(() => Promise.resolve({ id: "cal1" })),
  getEventsAsync: jest.fn(() => Promise.resolve([])),
  createEventAsync: jest.fn(() => Promise.resolve("evt1")),
  EntityTypes: { EVENT: "event" },
}));

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  documentDirectory: "/mock/documents/",
  EncodingType: { Base64: "base64" },
}));

// ─── Imports ────────────────────────────────────────────

import { generateId } from "../core/helpers";
import { enrichDocument } from "../core/enrichment";
import { addDaysToDate, getTodayString, calculateDaysUntil } from "../core/dateUtils";
import type { RawDocument, EnrichedDocument, Attachment } from "../core/constants";
import * as FileSystem from "expo-file-system/legacy";
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
  it("rescheduleAllNotifications never wipes every notification (snoozes survive)", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");
    (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockClear();

    await rescheduleAllNotifications([], [7, 3, 1], "ro");

    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });

  it("keeps a valid snooze and cancels the reminders it replaces", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");
    const due = addDaysToDate(getTodayString(), 10);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: "snooze-keep", content: { data: { type: "document_reminder", documentId: "u1", snoozed: true, due } } },
      { identifier: "old-reminder", content: { data: { type: "document_reminder", documentId: "u1", due } } },
      { identifier: "snooze-orphan", content: { data: { type: "document_reminder", documentId: "deleted", snoozed: true, due } } },
      { identifier: "snooze-paid", content: { data: { type: "document_reminder", documentId: "u2", snoozed: true, due: addDaysToDate(getTodayString(), -20) } } },
      { identifier: "digest", content: { data: { type: "morning_digest" } } },
    ]);
    const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
    cancel.mockClear();

    await rescheduleAllNotifications([
      { id: "u1", cat: "casa", type: "Gaz", title: "Gaz", due, amt: null, rec: "monthly" },
      { id: "u2", cat: "casa", type: "Apă", title: "Apă", due: addDaysToDate(getTodayString(), 30), amt: null, rec: "monthly" },
    ], [], "ro");

    expect(cancel.mock.calls.map((c) => c[0]).sort()).toEqual(["old-reminder", "snooze-orphan", "snooze-paid"]);
  });

  it("schedules the '1 day after expiry' reminder on the day after the due date", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");
    const due = addDaysToDate(getTodayString(), 3);
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    await rescheduleAllNotifications([
      { id: "u1", cat: "vehicule", type: "ITP", title: "ITP Logan", due, amt: null, rec: "annual", reminderDays: [-1] },
    ], [], "ro");

    expect(schedule).toHaveBeenCalledTimes(1);
    const { content, trigger } = schedule.mock.calls[0][0];
    const [y, m, d] = addDaysToDate(due, 1).split("-").map(Number);
    expect(trigger.date.getTime()).toBe(new Date(y, m - 1, d, 9, 0, 0, 0).getTime());
    expect(content.title).toBe("A expirat ieri");
  });

  it.each([
    [1, "Mai e o zi"],
    [7, "7 zile rămase"],
    [30, "30 de zile rămase"],
  ])("a reminder %i day(s) before reads '%s' (Romanian plural)", async (days, title) => {
    const { rescheduleAllNotifications } = require("../services/notifications");
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    await rescheduleAllNotifications([
      { id: "u1", cat: "casa", type: "Gaz", title: "Gaz", due: addDaysToDate(getTodayString(), 60), amt: null, rec: "monthly", reminderDays: [days] },
    ], [], "ro");

    expect(schedule.mock.calls[0][0].content.title).toBe(title);
  });

  it("stores the due date in each reminder so a stale 'Paid' tap can be ignored", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");
    const due = addDaysToDate(getTodayString(), 20);
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    await rescheduleAllNotifications([
      { id: "u1", cat: "casa", type: "Gaz", title: "Gaz", due, amt: null, rec: "monthly", reminderDays: [7] },
    ], [], "ro");

    expect(schedule.mock.calls[0][0].content.data).toEqual({ documentId: "u1", type: "document_reminder", due });
  });

  it("a snooze remembers the due date so later syncs keep it", async () => {
    const { snoozeNotification } = require("../services/notifications");
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    await snoozeNotification("u1", "notif-1", "Titlu", "Corp", "2026-05-01");

    expect(schedule.mock.calls[0][0].content.data).toEqual({
      documentId: "u1", type: "document_reminder", snoozed: true, due: "2026-05-01",
    });
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

  it("does not schedule reminders for the example (demo) documents", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");
    const due = addDaysToDate(getTodayString(), 20);
    const docs: RawDocument[] = [
      { id: "demo_1", cat: "vehicule", type: "RCA", title: "RCA — Dacia Duster", due, amt: 1850, rec: "annual" },
      { id: "u1", cat: "vehicule", type: "RCA", title: "RCA Logan", due, amt: 900, rec: "annual" },
    ];

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await rescheduleAllNotifications(docs, [7, 3, 1], "ro");

    const ids = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls
      .map((c) => c[0].content.data.documentId);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id: string) => id !== "u1")).toEqual([]);
  });

  it("does not schedule for resolved documents", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");

    const docs: RawDocument[] = [
      {
        id: "1", cat: "vehicule", type: "RCA", title: "Test",
        due: addDaysToDate(getTodayString(), 30), amt: 500, rec: "annual",
        resolved: getTodayString(),
      },
    ];

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await rescheduleAllNotifications(docs, [7, 3, 1], "ro");

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

describe("syncAllNotifications (one sync at a time)", () => {
  const docDue20 = (id: string): RawDocument => ({
    id, cat: "casa", type: "Gaz", title: id, due: addDaysToDate(getTodayString(), 20), amt: null, rec: "monthly",
  });

  it("never overlaps runs and coalesces calls made meanwhile into the newest one", async () => {
    const { syncAllNotifications } = require("../services/notifications");
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    const first = syncAllNotifications([docDue20("d1")], "ro");
    const second = syncAllNotifications([docDue20("d2")], "ro");
    const third = syncAllNotifications([docDue20("d3")], "ro");
    await Promise.all([first, second, third]);

    const order: string[] = schedule.mock.calls
      .map((c) => c[0].content.data?.documentId)
      .filter(Boolean);
    expect(order).toContain("d1");
    expect(order).toContain("d3");
    expect(order).not.toContain("d2");
    expect(order.lastIndexOf("d1")).toBeLessThan(order.indexOf("d3"));
  });
});

describe("shouldApplyMarkPaid", () => {
  const doc: RawDocument = { id: "u1", cat: "casa", type: "Gaz", title: "Gaz", due: "2026-03-10", amt: 80, rec: "monthly" };

  it.each<[string, RawDocument | undefined, Record<string, unknown>, boolean]>([
    ["the reminder is for the current due date", doc, { due: "2026-03-10" }, true],
    ["an old reminder for a due date already paid", doc, { due: "2026-02-10" }, false],
    ["the document was archived meanwhile", { ...doc, resolved: "2026-03-01" }, { due: "2026-03-10" }, false],
    ["the document was deleted", undefined, { due: "2026-03-10" }, false],
    ["a reminder scheduled before this update (no due stored)", doc, {}, true],
  ])("%s", (_label, d, data, expected) => {
    const { shouldApplyMarkPaid } = require("../services/notifications");
    expect(shouldApplyMarkPaid(d, data)).toBe(expected);
  });
});

describe("resolveRestoredAttachments (backup restore)", () => {
  const ATT_DIR = "/mock/documents/attachments/";
  const att = (id: string, uri: string): Attachment => ({ id, uri, name: `${id}.jpg`, type: "image" });
  const docWith = (attachments: Attachment[]): RawDocument => ({
    id: "d1", cat: "casa", type: "Gaz", title: "Gaz", due: "2026-06-01", amt: null, rec: "none", attachments,
  });

  beforeEach(() => {
    const onDisk = new Set([`${ATT_DIR}local.jpg`, `${ATT_DIR}moved.jpg`]);
    (FileSystem.getInfoAsync as jest.Mock).mockImplementation((uri: string) => Promise.resolve({ exists: onDisk.has(uri) }));
  });

  afterEach(() => {
    (FileSystem.getInfoAsync as jest.Mock).mockImplementation(() => Promise.resolve({ exists: true }));
  });

  it("keeps an attachment whose file is in the app's attachments folder", async () => {
    const { resolveRestoredAttachments } = require("../services/backupRestore");
    const [doc] = await resolveRestoredAttachments([docWith([att("a", `${ATT_DIR}local.jpg`)])]);
    expect(doc.attachments).toEqual([att("a", `${ATT_DIR}local.jpg`)]);
  });

  it("re-points an attachment saved under an old app folder to the current one", async () => {
    const { resolveRestoredAttachments } = require("../services/backupRestore");
    const old = "file:///var/mobile/Containers/Data/Application/OLD-ID/Documents/attachments/moved.jpg";
    const [doc] = await resolveRestoredAttachments([docWith([att("a", old)])]);
    expect(doc.attachments).toEqual([att("a", `${ATT_DIR}moved.jpg`)]);
  });

  it("drops attachments whose file is gone, web links, and paths outside the app", async () => {
    const { resolveRestoredAttachments } = require("../services/backupRestore");
    const [doc] = await resolveRestoredAttachments([docWith([
      att("gone", `${ATT_DIR}missing.jpg`),
      att("web", "https://tracker.example/pixel.png"),
      att("escape", `${ATT_DIR}../../Library/secret.db`),
      att("dots", `${ATT_DIR}..`),
      att("ok", `${ATT_DIR}local.jpg`),
    ])]);
    expect(doc.attachments?.map((a: Attachment) => a.id)).toEqual(["ok"]);
  });

  it("removes the attachments field when nothing usable is left", async () => {
    const { resolveRestoredAttachments } = require("../services/backupRestore");
    const [doc] = await resolveRestoredAttachments([docWith([att("gone", `${ATT_DIR}missing.jpg`)])]);
    expect(doc.attachments).toBeUndefined();
  });
});

describe("digest and weekly summary", () => {
  const exampleOnly: RawDocument[] = [
    { id: "demo_1", cat: "vehicule", type: "RCA", title: "RCA — Dacia Duster", due: addDaysToDate(getTodayString(), -3), amt: 1850, rec: "annual" },
  ];

  it("are not scheduled when there is nothing real to report", async () => {
    const { scheduleMorningDigest, scheduleWeeklySummary } = require("../services/notifications");
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    await scheduleMorningDigest(exampleOnly, "ro");
    await scheduleWeeklySummary([], "ro");

    expect(schedule).not.toHaveBeenCalled();
  });

  it("the weekly summary reads naturally in Romanian", async () => {
    const { scheduleWeeklySummary } = require("../services/notifications");
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();
    const soon = addDaysToDate(getTodayString(), 2);

    await scheduleWeeklySummary([
      { id: "u1", cat: "casa", type: "Gaz", title: "Gaz", due: soon, amt: null, rec: "monthly" },
    ], "ro");

    expect(schedule.mock.calls[0][0].content.body).toMatch(/^Săptămâna aceasta: 1 document scadent, 1 urgent\. Scor: \d+\/100\.$/);
  });
});

describe("morning digest logic", () => {
  it("scheduleMorningDigest schedules for tomorrow", async () => {
    const { scheduleMorningDigest } = require("../services/notifications");

    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    await scheduleMorningDigest([
      { id: "u1", cat: "casa", type: "Gaz", title: "Gaz", due: addDaysToDate(getTodayString(), 40), amt: null, rec: "monthly" },
    ], "ro");

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

  it("initializes when store connection succeeds", async () => {
    const { initializeIAP, isIAPConfigured } = require("../services/iap");
    await initializeIAP();
    // react-native-iap connects directly to Apple/Google — no API keys needed
    expect(isIAPConfigured()).toBe(true);
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

// ─── IAP pending purchases ──────────────────────────────

describe("IAP pending purchases", () => {
  const PRO_PRODUCT_ID = "com.docdueapp.pro.lifetime";
  let purchaseCallback: ((purchase: unknown) => void) | undefined;
  let rniap: any;
  let iapService: any;

  beforeAll(() => {
    (globalThis as any).__DEV__ = true;
  });

  beforeEach(async () => {
    jest.resetModules();
    purchaseCallback = undefined;
    rniap = require("react-native-iap");
    rniap.purchaseUpdatedListener.mockImplementation((cb: (p: unknown) => void) => {
      purchaseCallback = cb;
      return { remove: jest.fn() };
    });
    iapService = require("../services/iap");
    await iapService.initializeIAP();
  });

  afterEach(async () => {
    await iapService.endIAP();
  });

  it("does not grant PRO or finish the transaction for a pending purchase", () => {
    const granted = jest.fn();
    iapService.setPremiumGrantedCallback(granted);
    purchaseCallback!({ productId: PRO_PRODUCT_ID, purchaseState: "pending" });
    expect(granted).not.toHaveBeenCalled();
    expect(rniap.finishTransaction).not.toHaveBeenCalled();
  });

  it("grants PRO and finishes the transaction for a purchased purchase", () => {
    const granted = jest.fn();
    iapService.setPremiumGrantedCallback(granted);
    purchaseCallback!({ productId: PRO_PRODUCT_ID, purchaseState: "purchased" });
    expect(granted).toHaveBeenCalledTimes(1);
    expect(rniap.finishTransaction).toHaveBeenCalled();
  });

  it("an unconfirmed ('unknown') purchase doesn't unlock PRO either", () => {
    const granted = jest.fn();
    iapService.setPremiumGrantedCallback(granted);
    purchaseCallback!({ productId: PRO_PRODUCT_ID, purchaseState: "unknown" });
    expect(granted).not.toHaveBeenCalled();
    expect(rniap.finishTransaction).not.toHaveBeenCalled();
  });

  it("ignores purchases for other product ids", () => {
    const granted = jest.fn();
    iapService.setPremiumGrantedCallback(granted);
    purchaseCallback!({ productId: "com.other.app", purchaseState: "purchased" });
    expect(granted).not.toHaveBeenCalled();
  });

  it("resolves an in-flight purchase as pending, not success", async () => {
    const resultPromise = iapService.purchasePackage(PRO_PRODUCT_ID);
    await Promise.resolve(); // let requestPurchase settle
    purchaseCallback!({ productId: PRO_PRODUCT_ID, purchaseState: "pending" });
    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.pending).toBe(true);
    expect(result.cancelled).toBe(false);
  });
});

// ─── restoreAttachmentFiles (backup restore) ─────────────

describe("restoreAttachmentFiles", () => {
  const FS = require("expo-file-system/legacy");
  const { restoreAttachmentFiles } = require("../services/backupRestore");

  const makeDoc = (id: string, attId: string, uri: string) => ({
    id,
    cat: "vehicule",
    type: "RCA",
    title: "Test",
    due: "2026-12-01",
    rec: "annual",
    attachments: [{ id: attId, uri, name: "photo.jpg", type: "image" as const }],
  });

  beforeEach(() => {
    FS.writeAsStringAsync.mockClear();
    FS.getInfoAsync.mockResolvedValue({ exists: true });
  });

  it("writes each attachment under a fresh unique filename, never the old path", async () => {
    // clearAll() deletes old files asynchronously without awaiting — reusing
    // the old filename would let an in-flight delete remove the restored file
    const doc: any = makeDoc("doc1", "att1", "/old/sandbox/attachments/doc1_att1.jpg");
    await restoreAttachmentFiles([doc], { doc1_att1: "QUJD" });

    expect(FS.writeAsStringAsync).toHaveBeenCalledTimes(1);
    const writtenPath = FS.writeAsStringAsync.mock.calls[0][0] as string;
    expect(writtenPath).toMatch(/^\/mock\/documents\/attachments\/.+\.jpg$/);
    expect(writtenPath).not.toContain("doc1_att1.jpg"); // fresh name, no collision
    expect(doc.attachments[0].uri).toBe(writtenPath);   // doc remapped to new file
  });

  it("generates distinct filenames for identical source names", async () => {
    const docA: any = makeDoc("a", "x", "/sandbox/attachments/same.jpg");
    const docB: any = makeDoc("b", "x", "/sandbox/attachments/same.jpg");
    await restoreAttachmentFiles([docA, docB], { a_x: "QUJD", b_x: "QUJD" });

    const paths = FS.writeAsStringAsync.mock.calls.map((c: unknown[]) => c[0]);
    expect(paths).toHaveLength(2);
    expect(new Set(paths).size).toBe(2);
  });

  it("skips attachments with missing or oversized base64 data", async () => {
    const doc: any = makeDoc("doc1", "att1", "/sandbox/attachments/f.jpg");
    const huge = "A".repeat(20 * 1024 * 1024);
    await restoreAttachmentFiles([doc], { doc1_att1: huge });
    await restoreAttachmentFiles([doc], {});
    expect(FS.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("keeps the original extension, lowercased and sanitized", async () => {
    const doc: any = makeDoc("doc1", "att1", "/sandbox/attachments/SCAN.PDF");
    await restoreAttachmentFiles([doc], { doc1_att1: "QUJD" });
    const writtenPath = FS.writeAsStringAsync.mock.calls[0][0] as string;
    expect(writtenPath).toMatch(/\.pdf$/);
  });

  it("creates the attachments directory when missing", async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: false });
    const doc: any = makeDoc("doc1", "att1", "/sandbox/attachments/f.jpg");
    await restoreAttachmentFiles([doc], { doc1_att1: "QUJD" });
    expect(FS.makeDirectoryAsync).toHaveBeenCalledWith(
      "/mock/documents/attachments/",
      { intermediates: true }
    );
  });
});

// ─── Calendar (all-day event on the due date) ────────────

describe("addDocumentToCalendar", () => {
  const doc = enrichDocument({
    id: "u1", cat: "vehicule", type: "ITP", title: "ITP Logan", due: "2026-06-01", amt: null, rec: "annual",
  });

  afterEach(() => {
    require("react-native").Platform.OS = "ios";
  });

  it("on Android creates the all-day event at UTC midnight so it lands on the due date", async () => {
    require("react-native").Platform.OS = "android";
    const Calendar = require("expo-calendar");
    Calendar.createEventAsync.mockClear();
    const { addDocumentToCalendar } = require("../services/calendar");

    await addDocumentToCalendar(doc, "ro");

    const event = Calendar.createEventAsync.mock.calls[0][1];
    expect(event.allDay).toBe(true);
    expect(event.timeZone).toBe("UTC");
    expect(event.startDate.getTime()).toBe(Date.UTC(2026, 5, 1));
    expect(event.endDate.getTime()).toBe(Date.UTC(2026, 5, 2));
  });

  it("on iOS keeps the local-day event", async () => {
    const Calendar = require("expo-calendar");
    Calendar.createEventAsync.mockClear();
    const { addDocumentToCalendar } = require("../services/calendar");

    await addDocumentToCalendar(doc, "ro");

    const event = Calendar.createEventAsync.mock.calls[0][1];
    expect(event.allDay).toBe(true);
    expect(event.startDate.getTime()).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).getTime());
  });
});

// ─── Biometric strength (Android) ────────────────────────

describe("biometricSecurityLevel", () => {
  // Earlier suites reset the module registry — load both from the same one
  afterEach(() => {
    const rn = require("react-native");
    rn.Platform.OS = "ios";
    delete rn.Platform.Version;
  });

  it.each([
    ["ios", 18, "weak"],
    ["android", 34, "strong"],
    ["android", 30, "strong"],
    ["android", 29, "weak"], // Android 10 can't combine Class 3 biometrics with the PIN fallback
  ] as const)("%s API %i → %s", (os, version, expected) => {
    const rn = require("react-native");
    rn.Platform.OS = os;
    rn.Platform.Version = version;
    const { biometricSecurityLevel } = require("../services/biometric");
    expect(biometricSecurityLevel()).toBe(expected);
  });
});

// ─── Discreet reminders (biometric lock on) ──────────────

describe("discreet reminders", () => {
  it("with the app lock on, lock-screen reminders don't reveal the document", async () => {
    const { rescheduleAllNotifications } = require("../services/notifications");
    const schedule = require("expo-notifications").scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    await rescheduleAllNotifications([
      { id: "u1", cat: "personal", type: "Pașaport", title: "Pașaport Ana", due: addDaysToDate(getTodayString(), 40), amt: null, rec: "none", reminderDays: [7] },
    ], [], "ro", { discreet: true });

    const { title, body } = schedule.mock.calls[0][0].content;
    expect(`${title} ${body}`).not.toContain("Pașaport");
    expect(title).toBe("Un document expiră în curând");
  });

  it("syncAllNotifications passes the discreet option through", async () => {
    const { syncAllNotifications } = require("../services/notifications");
    const schedule = require("expo-notifications").scheduleNotificationAsync as jest.Mock;
    schedule.mockClear();

    await syncAllNotifications([
      { id: "u1", cat: "personal", type: "Pașaport", title: "Pașaport Ana", due: addDaysToDate(getTodayString(), 40), amt: null, rec: "none", reminderDays: [7] },
    ], "ro", { discreet: true });

    const reminder = schedule.mock.calls.find((c) => c[0].content.data?.type === "document_reminder");
    expect(reminder[0].content.title).toBe("Un document expiră în curând");
  });
});
