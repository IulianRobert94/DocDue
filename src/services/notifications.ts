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
import { CATEGORIES } from "../core/constants";
import { t } from "../core/i18n";
import { parseLocalDate } from "../core/dateUtils";
import { formatDate } from "../core/formatters";
import { enrichDocument } from "../core/enrichment";
import { calculateHealthScore } from "../core/healthScore";

// ─── Constants ──────────────────────────────────────────

const MAX_SCHEDULED = 60; // iOS limit is ~64, leave buffer
const CHANNEL_ID = "docdue-reminders";
const FIRE_HOUR = 9; // 9:00 AM local

// ─── Configure notification behavior ────────────────────

export const NOTIFICATION_CATEGORY = "document_reminder";

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
      lightColor: "#007AFF",
      sound: "default",
    }).catch(() => {
      // Channel setup may fail in Expo Go
    });
  }
}

/**
 * Register notification action buttons (Renewed / Tomorrow).
 * Call on launch and when language changes.
 */
export async function setupNotificationCategories(language: LanguageCode): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY, [
      {
        identifier: "MARK_PAID",
        buttonTitle: t(language, "notif_action_renewed"),
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

// ─── Scheduling ─────────────────────────────────────────

interface ScheduleEntry {
  docId: string;
  docTitle: string;
  docType: string;
  docCat: string;
  dueDate: string;
  reminderDay: number;
  fireDate: Date;
}

/**
 * Cancel all existing notifications and reschedule based on
 * current documents and reminderDays setting.
 */
export async function rescheduleAllNotifications(
  documents: RawDocument[],
  reminderDays: number[],
  language: LanguageCode,
): Promise<void> {
  // 1. Cancel all existing
  await Notifications.cancelAllScheduledNotificationsAsync();

  // 2. Check permission
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return;

  // 3. No reminder days = disabled
  if (reminderDays.length === 0) return;

  // 4. Build entries
  const now = Date.now();
  const entries: ScheduleEntry[] = [];

  for (const doc of documents) {
    const dueDate = parseLocalDate(doc.due);
    if (isNaN(dueDate.getTime())) continue;

    for (const daysBefore of reminderDays) {
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
      });
    }
  }

  // 5. Sort by nearest first, cap at limit
  entries.sort((a, b) => a.fireDate.getTime() - b.fireDate.getTime());
  const toSchedule = entries.slice(0, MAX_SCHEDULED);

  // 6. Schedule each (wrap individually — exact alarms may fail on some Android versions)
  for (const entry of toSchedule) {
    const { title, body } = buildContent(entry, language);

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: "default",
          categoryIdentifier: NOTIFICATION_CATEGORY,
          data: {
            documentId: entry.docId,
            type: "document_reminder",
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

  return {
    title: t(language, "notif_reminder_title", { days: entry.reminderDay }),
    body: t(language, "notif_reminder_body", {
      title: entry.docTitle,
      date: dateFormatted,
    }) + " " + smartTip,
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
        categoryIdentifier: NOTIFICATION_CATEGORY,
        data: { documentId: docId, type: "document_reminder" },
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

  // Calculate current stats for the digest
  const enriched = documents.map((d) => enrichDocument(d));
  const score = calculateHealthScore(enriched);
  const needsAttention = enriched.filter(
    (d) => d._status === "expired" || d._status === "warning"
  ).length;

  let body: string;
  if (needsAttention === 0) {
    body = t(language, "notif_digest_body_zero", { score });
  } else if (needsAttention === 1) {
    body = t(language, "notif_digest_body_one", { n: 1, score });
  } else {
    body = t(language, "notif_digest_body_plural", { n: needsAttention, score });
  }

  // Schedule for tomorrow at 9 AM (one-time, re-scheduled on next mutation/launch)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(FIRE_HOUR, 0, 0, 0);

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
        date: tomorrow,
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

  // Calculate stats for the week
  const enriched = documents.map((d) => enrichDocument(d));
  const score = calculateHealthScore(enriched);
  const thisWeek = enriched.filter(
    (d) => d._daysUntil >= 0 && d._daysUntil <= 7
  ).length;
  const urgent = enriched.filter(
    (d) => d._status === "expired" || d._status === "warning"
  ).length;

  const body = t(language, "notif_weekly_body", {
    weekCount: thisWeek,
    urgentCount: urgent,
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
