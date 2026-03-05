/**
 * DocDue — Calendar Integration Service
 *
 * Adds document due dates to the device calendar.
 * Uses expo-calendar for native calendar access.
 */

import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import type { EnrichedDocument, LanguageCode } from "../core/constants";
import { t, translateSubtype } from "../core/i18n";
import { parseLocalDate } from "../core/dateUtils";

/**
 * Request calendar permission and return true if granted.
 */
export async function requestCalendarPermission(): Promise<boolean> {
  const { status: existing } = await Calendar.getCalendarPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

/**
 * Get the default calendar ID for creating events.
 * Falls back to the first writable calendar.
 */
async function getDefaultCalendarId(): Promise<string | null> {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    // Prefer the default calendar
    if (Platform.OS === "ios") {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      if (defaultCal) return defaultCal.id;
    }

    // Fallback: first writable calendar
    const writable = calendars.find(
      (c) => c.allowsModifications && c.source?.type !== "birthdays"
    );
    return writable?.id || calendars[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Add a document's due date to the device calendar.
 * Creates an all-day event on the due date with a reminder alert.
 */
export async function addDocumentToCalendar(
  doc: EnrichedDocument,
  language: LanguageCode,
): Promise<boolean> {
  // Ensure calendar permission before accessing APIs
  const hasPermission = await requestCalendarPermission();
  if (!hasPermission) return false;

  const calendarId = await getDefaultCalendarId();
  if (!calendarId) return false;

  const dueDate = parseLocalDate(doc.due);
  if (isNaN(dueDate.getTime())) return false;

  // All-day event on the due date
  const startDate = new Date(dueDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(dueDate);
  endDate.setHours(23, 59, 59, 999);

  const typeLabel = translateSubtype(doc.type, language);
  const title = `${doc.title} — ${t(language, "detail_due")}`;
  const notes = doc.notes || "";
  const location = doc.asset || "";

  try {
    await Calendar.createEventAsync(calendarId, {
      title,
      startDate,
      endDate,
      allDay: true,
      notes: `${typeLabel}\n${notes}`.trim(),
      location,
      alarms: [{ relativeOffset: -1440 }], // Remind 1 day before (in minutes)
    });
    return true;
  } catch {
    return false;
  }
}
