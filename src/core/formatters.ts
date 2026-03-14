/**
 * DocDue — Formatters
 *
 * Funcții pentru afișarea datelor într-un format prietenos:
 * - formatDate: "2024-03-15" → "15.03.2024" (ro) sau "03/15/2024" (en)
 * - formatMoney: 1850 → "1.850 lei"
 * - formatDaysRemaining: -5 → "5 zile întârziere", 0 → "Astăzi!"
 * - getRecurrenceLabel, getCategoryLabel, getStatusLabel
 *
 * PORTAT 1:1 din v10 — nu se modifică logica.
 */

import { CURRENCY_OPTIONS, RECURRENCE_QUICK, RECURRENCE_OPTIONS, STATUS_DISPLAY } from "./constants";
import type { LanguageCode, CurrencyCode, RecurrenceValue, DocumentStatus, Category } from "./constants";
import { t } from "./i18n";

/**
 * Formatează o dată "YYYY-MM-DD" în format uman:
 * - Română: "15.03.2024"
 * - Engleză: "03/15/2024"
 */
export function formatDate(dateString: string, lang: LanguageCode = "ro"): string {
  if (!dateString) return "—";
  const parts = dateString.split("-");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return "—";
  const [y, m, d] = parts;
  if (lang === "en") return `${m}/${d}/${y}`;
  return `${d}.${m}.${y}`;
}

/**
 * Formatează o sumă de bani cu simbolul monedei.
 *
 * Exemple:
 * - formatMoney(1850, "RON") → "1.850 lei"
 * - formatMoney(250, "EUR")  → "250 €"
 */
export function formatMoney(amount: number | null, currencyCode: CurrencyCode = "RON", lang: LanguageCode = "ro"): string {
  if (amount === null || amount === undefined) return "";
  const symbol = CURRENCY_OPTIONS.find(c => c.value === currencyCode)?.symbol || "lei";
  const locale = lang === "en" ? "en-US" : "ro-RO";
  return `${amount.toLocaleString(locale)} ${symbol}`;
}

/**
 * Text uman pentru zilele rămase.
 *
 * Exemple:
 * - formatDaysRemaining(-5, "ro") → "5 zile întârziere"
 * - formatDaysRemaining(0, "ro")  → "Astăzi!"
 * - formatDaysRemaining(1, "ro")  → "Mâine"
 * - formatDaysRemaining(14, "ro") → "în 14 zile"
 */
export function formatDaysRemaining(days: number, lang: LanguageCode = "ro"): string {
  if (days < -1) return t(lang, "days_overdue_plural", { n: Math.abs(days) });
  if (days === -1) return t(lang, "days_overdue_singular");
  if (days === 0) return t(lang, "days_today");
  if (days === 1) return t(lang, "days_tomorrow");
  return t(lang, "days_future", { n: days });
}

/**
 * Returnează textul recurenței (ex: "Lunar", "Anual", "Fără recurență").
 */
export function getRecurrenceLabel(value: RecurrenceValue, lang: LanguageCode = "ro"): string {
  const opt = RECURRENCE_QUICK.find(r => r.value === value)
    ?? RECURRENCE_OPTIONS.find(r => r.value === value);
  return opt ? t(lang, opt.labelKey) : "—";
}

/**
 * Returnează intervalul de recurență în zile (ex: "annual" → 365).
 */
export function getRecurrenceDays(value: RecurrenceValue): number {
  return RECURRENCE_QUICK.find(r => r.value === value)?.days
    ?? RECURRENCE_OPTIONS.find(r => r.value === value)?.days
    ?? 0;
}

/**
 * Returnează numele categoriei tradus (ex: "Vehicule" în ro, "Vehicles" în en).
 */
export function getCategoryLabel(category: Category, lang: LanguageCode): string {
  return t(lang, category.labelKey);
}

/**
 * Returnează textul statusului (ex: "EXPIRAT", "SCADENT", "OK").
 */
export function getStatusLabel(status: DocumentStatus, lang: LanguageCode): string {
  return t(lang, STATUS_DISPLAY[status].labelKey);
}
