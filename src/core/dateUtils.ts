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
