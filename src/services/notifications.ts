/**
 * DocDue — Local Notification Service
 *
 * Schedules local push notifications for document reminders.
 * Uses cancel-all + reschedule-all strategy for simplicity.
 * Notifications fire at 9:00 AM local time.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { RawDocument, LanguageCode } from "../core/constants";
import { t, tp } from "../core/i18n";
import { addDaysToDate, getTodayString, parseLocalDate, toDateString } from "../core/dateUtils";
import { formatDate } from "../core/formatters";
import { enrichDocument, getScheduledReminderOffsets } from "../core/enrichment";
import { calculateHealthScore } from "../core/healthScore";
import { isDemoDocument } from "../core/helpers";
import { payKind } from "../core/payment";
import type { PayKind } from "../core/payment";

/** Documents that may produce notifications: active and not an example document. */
function notifiableDocuments(documents: RawDocument[]): RawDocument[] {
  return documents.filter((d) => !d.resolved && !isDemoDocument(d));
}

// ─── Constants ──────────────────────────────────────────

const MAX_SCHEDULED = 60; // iOS limit is ~64, leave buffer
const CHANNEL_ID = "docdue-reminders";
const FIRE_HOUR = 9; // 9:00 AM local

// ─── Configure notification behavior ────────────────────

export const NOTIFICATION_CATEGORY = "document_reminder";
export const RENEWAL_CATEGORY = "document_renewal";
export const ENDING_CATEGORY = "document_ending";

/** The action button says what fits the document: Plătit / Reînnoit / Încheiat */
const CATEGORY_BY_KIND: Record<PayKind, { id: string; actionKey: string }> = {
  bill: { id: NOTIFICATION_CATEGORY, actionKey: "notif_action_paid" },
  renewal: { id: RENEWAL_CATEGORY, actionKey: "notif_action_renewed" },
  ending: { id: ENDING_CATEGORY, actionKey: "notif_action_ended" },
};

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Document Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0A79F1",
      sound: "default",
    }).catch(() => {
      // Channel setup may fail in Expo Go
    });
  }
}

/**
 * Register notification action buttons (Plătit / Reînnoit / Încheiat + Mâine).
 * "Plătit" opens the app on the pay sheet, so the user sees the new date.
 * Call on launch and when language changes.
 */
export async function setupNotificationCategories(language: LanguageCode): Promise<void> {
  for (const { id, actionKey } of Object.values(CATEGORY_BY_KIND)) {
    try {
      await Notifications.setNotificationCategoryAsync(id, [
        {
          identifier: "MARK_PAID",
          buttonTitle: t(language, actionKey),
          options: { opensAppToForeground: true },
        },
        {
          identifier: "SNOOZE_1DAY",
          buttonTitle: t(language, "notif_action_tomorrow"),
          options: { opensAppToForeground: false },
        },
      ]);
    } catch {
      // Notification categories may not be supported (e.g., some Android versions)
    }
  }
}

// ─── Permission handling ────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: true,
    },
  });
  return status === "granted";
}

export async function checkNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/** Raw OS permission state — "undetermined" means the user was never asked. */
export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" || status === "undetermined" ? status : "denied";
  } catch {
    return "denied";
  }
}

// ─── Scheduling ─────────────────────────────────────────

interface ScheduleEntry {
  docId: string;
  docTitle: string;
  docType: string;
  docCat: string;
  dueDate: string;
  reminderDay: number;
  fireDate: Date;
  kind: PayKind;
  /** App icon badge when it arrives: the user's documents expired by that day */
  badge: number;
}

/**
 * Cancel the document reminders scheduled earlier and reschedule them from the
 * current documents. Snoozed reminders ("Mâine") survive as long as their
 * document still exists with the same due date. Digest and weekly summary are
 * managed by their own functions.
 */
export interface ReminderOptions {
  /** Biometric lock on: reminders don't show document names on the lock screen */
  discreet?: boolean;
}

export async function rescheduleAllNotifications(
  documents: RawDocument[],
  _reminderDays: number[], // kept for call-site compat; actual reminders are per-document
  language: LanguageCode,
  options: ReminderOptions = {},
): Promise<void> {
  // 1. Cancel the document reminders we own (keep valid snoozes)
  const activeById = new Map(notifiableDocuments(documents).map((d) => [d.id, d]));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const data = n.content?.data;
    if (data?.type !== "document_reminder") continue;
    if (data.snoozed) {
      const doc = activeById.get(data.documentId as string);
      if (doc && (typeof data.due !== "string" || data.due === doc.due)) continue;
    }
    await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  }

  // 2. Check permission
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return;

  // 3. Build entries — use per-document smart reminders
  const now = Date.now();
  const entries: ScheduleEntry[] = [];
  const docs = notifiableDocuments(documents);
  const expiredOn = (day: string) => docs.filter((d) => d.due < day).length;

  for (const doc of docs) {
    const dueDate = parseLocalDate(doc.due);
    if (isNaN(dueDate.getTime())) continue;

    // Advance reminders (per-document or automatic) + due day + follow-ups
    for (const daysBefore of getScheduledReminderOffsets(doc)) {
      const fireDate = new Date(dueDate);
      fireDate.setDate(fireDate.getDate() - daysBefore);
      fireDate.setHours(FIRE_HOUR, 0, 0, 0);

      // Only schedule future notifications
      if (fireDate.getTime() <= now) continue;

      entries.push({
        docId: doc.id,
        docTitle: doc.title,
        docType: doc.type,
        docCat: doc.cat,
        dueDate: doc.due,
        reminderDay: daysBefore,
        fireDate,
        kind: payKind(doc),
        badge: expiredOn(toDateString(fireDate)),
      });
    }
  }

  // 5. Sort by nearest first, cap at limit
  entries.sort((a, b) => a.fireDate.getTime() - b.fireDate.getTime());
  const toSchedule = entries.slice(0, MAX_SCHEDULED);

  // 6. Schedule each (wrap individually — exact alarms may fail on some Android versions)
  for (const entry of toSchedule) {
    const { title, body } = options.discreet ? buildDiscreetContent(entry, language) : buildContent(entry, language);

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: "default",
          badge: entry.badge,
          categoryIdentifier: CATEGORY_BY_KIND[entry.kind].id,
          data: {
            documentId: entry.docId,
            type: "document_reminder",
            // Lets a stale "Plătit" tap (after the doc was already paid) be ignored
            due: entry.dueDate,
          },
          ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: entry.fireDate,
        },
      });
    } catch {
      // Exact alarm scheduling may fail on Android — skip this one, try the rest
      continue;
    }
  }

  // The icon shows how many of the user's documents have expired right now
  try {
    await Notifications.setBadgeCountAsync(expiredOn(getTodayString()));
  } catch {
    // Badges aren't supported everywhere (some Android launchers, Expo Go)
  }
}

// ─── Smart notification context ──────────────────────────

/**
 * Get a contextual smart tip for a document type (e.g. "Insurance costs more if you miss the deadline!").
 * Returns an i18n key suffix for a category/type-specific tip.
 */
function getSmartTip(docType: string, docCat: string, language: LanguageCode): string {
  const typeLower = docType.toLowerCase();

  if (typeLower.includes("rca") || typeLower.includes("casco") || typeLower.includes("insurance")) {
    return t(language, "notif_smart_rca");
  }
  if (typeLower.includes("itp") || typeLower.includes("inspection")) {
    return t(language, "notif_smart_itp");
  }
  if (docCat === "financiar" || typeLower.includes("impozit") || typeLower.includes("tax") || typeLower.includes("amendă")) {
    return t(language, "notif_smart_tax");
  }
  if (docCat === "casa" && (typeLower.includes("curent") || typeLower.includes("gaz") || typeLower.includes("apă") || typeLower.includes("electric"))) {
    return t(language, "notif_smart_utility");
  }
  if (typeLower.includes("contract")) {
    return t(language, "notif_smart_contract");
  }
  return t(language, "notif_smart_generic");
}

// ─── Notification content (bilingual) ───────────────────

function buildContent(
  entry: ScheduleEntry,
  language: LanguageCode,
): { title: string; body: string } {
  const dateFormatted = formatDate(entry.dueDate, language);
  const smartTip = getSmartTip(entry.docType, entry.docCat, language);

  if (entry.reminderDay === 0) {
    return {
      title: t(language, "notif_due_today_title"),
      body: t(language, "notif_due_today_body", {
        title: entry.docTitle,
        date: dateFormatted,
      }),
    };
  }

  if (entry.reminderDay < 0) {
    // Reminder after expiry (e.g. -1 = "1 day after")
    const daysAgo = -entry.reminderDay;
    return {
      title: tp(language, "notif_overdue_title", daysAgo, { days: daysAgo }),
      body: t(language, entry.kind === "bill" ? "notif_overdue_body_bill" : "notif_overdue_body", {
        title: entry.docTitle,
        date: dateFormatted,
      }),
    };
  }

  return {
    title: tp(language, "notif_reminder_title", entry.reminderDay, { days: entry.reminderDay }),
    body: t(language, "notif_reminder_body", {
      title: entry.docTitle,
      date: dateFormatted,
    }) + " " + smartTip,
  };
}

/** Lock-screen-safe wording: no document name, type or date. */
function buildDiscreetContent(entry: ScheduleEntry, language: LanguageCode): { title: string; body: string } {
  return {
    title: t(language, entry.reminderDay < 0 ? "notif_discreet_overdue_title" : "notif_discreet_title"),
    body: t(language, "notif_discreet_body"),
  };
}

// ─── Snooze helper ───────────────────────────────────

/**
 * Schedule a single reminder for tomorrow at 9 AM (snooze action).
 * Dismisses the original notification first to prevent duplicates.
 */
export async function snoozeNotification(
  docId: string,
  notificationId: string,
  title: string,
  body: string,
  due?: string,
  categoryIdentifier: string = NOTIFICATION_CATEGORY,
): Promise<void> {
  // Cancel the original notification to prevent duplicate
  await Notifications.dismissNotificationAsync(notificationId).catch(() => {});

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(FIRE_HOUR, 0, 0, 0);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
        categoryIdentifier,
        // `snoozed` + `due` let later reschedules keep this reminder
        data: { documentId: docId, type: "document_reminder", snoozed: true, ...(due ? { due } : {}) },
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrow,
      },
    });
  } catch {
    // Exact alarm scheduling may fail on Android
  }
}

// ─── "Plătit" from a notification ────────────────────────

/**
 * Whether a "Plătit" (MARK_PAID) tap should mark the document as paid.
 * False when the document is gone, archived, or was already paid since this
 * reminder was scheduled (its due date moved on) — otherwise an old
 * notification left in Notification Center would skip a whole period.
 */
export function shouldApplyMarkPaid(
  doc: RawDocument | undefined,
  data: Record<string, unknown> | undefined,
): boolean {
  if (!doc || doc.resolved) return false;
  return typeof data?.due !== "string" || data.due === doc.due;
}

/** Remove this document's delivered reminders from Notification Center. */
export async function dismissDeliveredForDocument(docId: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const n of presented) {
      if (n.request.content.data?.documentId === docId) {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      }
    }
  } catch {
    // Best effort — not supported everywhere (e.g. Expo Go)
  }
}

// ─── Serialized sync ─────────────────────────────────────

let _syncRun: Promise<void> | null = null;
let _syncNext: { documents: RawDocument[]; language: LanguageCode; options: ReminderOptions } | null = null;

/**
 * Bring every scheduled notification in line with `documents`: reminders,
 * then the morning digest, then the weekly summary, in sequence.
 * Runs never overlap — calls made while one is running are coalesced into a
 * single follow-up run with the newest arguments. Rejects if the last run failed.
 */
export function syncAllNotifications(
  documents: RawDocument[],
  language: LanguageCode,
  options: ReminderOptions = {},
): Promise<void> {
  _syncNext = { documents, language, options };
  if (!_syncRun) {
    _syncRun = (async () => {
      let lastError: unknown = null;
      try {
        while (_syncNext) {
          const { documents: docs, language: lang, options: opts } = _syncNext;
          _syncNext = null;
          try {
            await rescheduleAllNotifications(docs, [], lang, opts);
            await scheduleMorningDigest(docs, lang);
            await scheduleWeeklySummary(docs, lang);
            lastError = null;
          } catch (e) {
            lastError = e;
          }
        }
      } finally {
        _syncRun = null;
      }
      if (lastError) throw lastError;
    })();
  }
  return _syncRun;
}

// ─── Morning Digest ─────────────────────────────────────

/**
 * Schedule a morning digest notification for tomorrow at 9:00 AM.
 * Uses a one-time DATE trigger so the content is always fresh —
 * re-called on every mutation + app foreground to keep data current.
 */
export async function scheduleMorningDigest(
  documents: RawDocument[],
  language: LanguageCode,
): Promise<void> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return;

  // Cancel any existing digest before scheduling a fresh one
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of existing) {
    if (n.content?.data?.type === "morning_digest") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  // Only when something needs doing — no daily "all good" ping
  const docs = notifiableDocuments(documents);
  const enriched = docs.map((d) => enrichDocument(d));
  const needsAttention = enriched.filter(
    (d) => d._status === "expired" || d._status === "warning"
  ).length;
  if (needsAttention === 0) return;

  // A reminder already arrives tomorrow morning — one notification is enough
  const tomorrow = addDaysToDate(getTodayString(), 1);
  if (docs.some((d) => getScheduledReminderOffsets(d).some((off) => addDaysToDate(d.due, -off) === tomorrow))) return;

  const score = calculateHealthScore(enriched);
  const body = tp(language, "notif_digest_body", needsAttention, { score });

  // Schedule for tomorrow at 9 AM (one-time, re-scheduled on next mutation/launch)
  const fireAt = parseLocalDate(tomorrow);
  fireAt.setHours(FIRE_HOUR, 0, 0, 0);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t(language, "notif_digest_title"),
        body,
        sound: "default",
        data: { type: "morning_digest" },
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {
    // Exact alarm scheduling may fail on Android
  }
}

// ─── Weekly Summary ──────────────────────────────────────

/**
 * Schedule a weekly summary notification for next Monday at 9 AM.
 * Shows how many documents are expiring this week and the health score.
 */
export async function scheduleWeeklySummary(
  documents: RawDocument[],
  language: LanguageCode,
): Promise<void> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return;

  // Cancel any existing weekly summary
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of existing) {
    if (n.content?.data?.type === "weekly_summary") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const docs = notifiableDocuments(documents);

  // Calculate stats for the week (active docs only)
  const enriched = docs.map((d) => enrichDocument(d));
  const score = calculateHealthScore(enriched);
  const thisWeek = enriched.filter(
    (d) => d._daysUntil >= 0 && d._daysUntil <= 7
  ).length;
  const urgent = enriched.filter(
    (d) => d._status === "expired" || d._status === "warning"
  ).length;
  // A quiet week — no Monday summary
  if (thisWeek === 0 && urgent === 0) return;

  const body = t(language, "notif_weekly_body", {
    week: tp(language, "notif_weekly_due", thisWeek),
    urgent: tp(language, "notif_weekly_urgent", urgent),
    score,
  });

  // Find next Monday at 9 AM
  const nextMonday = new Date();
  const dayOfWeek = nextMonday.getDay(); // 0=Sun, 1=Mon
  const daysUntilMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : 8 - dayOfWeek;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMon);
  nextMonday.setHours(FIRE_HOUR, 0, 0, 0);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t(language, "notif_weekly_title"),
        body,
        sound: "default",
        data: { type: "weekly_summary" },
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextMonday,
      },
    });
  } catch {
    // Exact alarm scheduling may fail on Android
  }
}

// ─── Deep link helper ───────────────────────────────────

export function getDocumentIdFromNotification(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data;
  if (data?.type === "document_reminder" && data?.documentId) {
    return data.documentId as string;
  }
  return null;
}
