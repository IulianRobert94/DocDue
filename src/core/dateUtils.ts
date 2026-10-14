/**
 * DocDue — Date Utilities (timezone-safe)
 *
 * IMPORTANT: Nu folosim niciodată `new Date("YYYY-MM-DD")` direct!
 * Asta parsează ca UTC midnight, care în UTC+2 (România) devine
 * ziua anterioară la 22:00. Toate funcțiile de aici folosesc date locale.
 *
 * PORTAT 1:1 din v10 — nu se modifică logica.
 */

import { MS_PER_DAY, DEFAULT_WARNING_DAYS } from "./constants";
import type { DocumentStatus } from "./constants";

/**
 * Parsează un string "YYYY-MM-DD" ca dată LOCALĂ (nu UTC).
 *
 * Exemplu: parseLocalDate("2024-03-15") → 15 martie 2024 la miezul nopții local
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString || typeof dateString !== "string") {
    return new Date(NaN); // invalid, caller can check with isNaN()
  }
  const parts = dateString.split("-");
  if (parts.length !== 3) return new Date(NaN);
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date(NaN);
  // Range validation — reject obviously invalid components
  if (month < 1 || month > 12 || day < 1 || day > 31) return new Date(NaN);
  const date = new Date(year, month - 1, day);
  // Round-trip check: JS auto-corrects invalid dates (e.g., Feb 31 → Mar 3)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return new Date(NaN);
  return date;
}

/**
 * Returnează data de azi la miezul nopții local (pentru comparații).
 */
export function getTodayLocal(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Returnează data de azi ca string "YYYY-MM-DD" folosind componente locale.
 */
export function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calculează zilele între azi și o dată țintă.
 *
 * Returnează:
 * - Negativ = în trecut (ex: -5 = expirat de 5 zile)
 * - 0 = astăzi
 * - Pozitiv = în viitor (ex: 14 = mai sunt 14 zile)
 */
export function calculateDaysUntil(dateString: string): number {
  const target = parseLocalDate(dateString);
  if (isNaN(target.getTime())) return -99999; // clearly invalid → shows as expired
  // Use calendar-day difference to avoid DST off-by-one errors
  const today = getTodayLocal();
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / MS_PER_DAY);
}

/**
 * Determină statusul unui document bazat pe zilele rămase.
 *
 * - "expired" = data a trecut (roșu)
 * - "warning" = expiră în curând, sub pragul de avertizare (galben)
 * - "ok" = totul e bine (verde)
 */
export function getDocumentStatus(dateString: string, warningDays: number = DEFAULT_WARNING_DAYS): DocumentStatus {
  const days = calculateDaysUntil(dateString);
  if (days < 0) return "expired";
  if (days <= warningDays) return "warning";
  return "ok";
}

/**
 * Adaugă un număr de zile la o dată, returnând un nou string "YYYY-MM-DD".
 *
 * Folosit la recurență simplă (daily, weekly).
 */
export function addDaysToDate(dateString: string, daysToAdd: number): string {
  const date = parseLocalDate(dateString);
  if (isNaN(date.getTime())) return dateString; // return original if invalid
  date.setDate(date.getDate() + daysToAdd);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Validate calendar components and format as "YYYY-MM-DD".
 * Rejects impossible dates (month 13, Feb 31) via round-trip check and
 * limits years to 2000-2099 (sane range for imported documents).
 */
function formatValidatedDate(year: number, month: number, day: number): string {
  if (year < 2000 || year > 2099) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse a date value coming from an Excel import (JS Date from cellDates,
 * Excel serial number, or a string in ISO / EU / US format) and validate it
 * as a real calendar date. Returns "YYYY-MM-DD" or "" when invalid.
 */
export function parseImportedDate(raw: unknown): string {
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return "";
    return formatValidatedDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  if (typeof raw === "number" && raw > 0) {
    // Excel serial: days since 1899-12-30 (25569 = 1970-01-01)
    const epoch = new Date((raw - 25569) * 86400 * 1000);
    if (isNaN(epoch.getTime())) return "";
    return formatValidatedDate(epoch.getUTCFullYear(), epoch.getUTCMonth() + 1, epoch.getUTCDate());
  }
  const str = String(raw ?? "").trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return formatValidatedDate(+iso[1], +iso[2], +iso[3]);
  const dmy = str.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (dmy) {
    // EU reading (DD.MM.YYYY) first — Romania-first; if the month is
    // impossible, fall back to US reading (MM/DD/YYYY, e.g. 03/15/2026)
    return (
      formatValidatedDate(+dmy[3], +dmy[2], +dmy[1]) ||
      formatValidatedDate(+dmy[3], +dmy[1], +dmy[2])
    );
  }
  return "";
}

/**
 * Adaugă un număr de luni calendaristice la o dată.
 *
 * Gestionează corect lunile cu lungimi diferite:
 * - 31 ianuarie + 1 lună = 28/29 februarie (nu 3 martie)
 * - 30 martie + 1 lună = 30 aprilie
 */
export function addMonthsToDate(dateString: string, monthsToAdd: number): string {
  const date = parseLocalDate(dateString);
  if (isNaN(date.getTime())) return dateString; // return original if invalid
  const originalDay = date.getDate();
  date.setMonth(date.getMonth() + monthsToAdd);
  // If the day changed (e.g., Jan 31 → Mar 3), clamp to last day of target month
  if (date.getDate() !== originalDay) {
    date.setDate(0); // go to last day of previous month
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Add calendar months and land on `day` of the target month, clamped to that
 * month's length. Unlike chaining addMonthsToDate, a "31st" due date doesn't
 * drift to the 28th forever after February: 31 Jan → 28 Feb → 31 Mar.
 */
export function addMonthsKeepingDay(dateString: string, monthsToAdd: number, day: number): string {
  const date = parseLocalDate(dateString);
  if (isNaN(date.getTime())) return dateString; // return original if invalid
  const wantedDay = Number.isFinite(day) ? Math.max(1, Math.trunc(day)) : date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(wantedDay, daysInMonth));
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Whole calendar days from `from` to `to` (negative if `to` is earlier).
 * DST-safe: counts calendar days, not 24-hour blocks. NaN for invalid dates.
 */
export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return NaN;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

/** Local calendar date of a Date object as "YYYY-MM-DD". */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
