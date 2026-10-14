/**
 * DocDue — Add / edit form helpers
 *
 * Small rules that make adding a document quicker and less error-prone:
 * sensible date shortcuts, Romanian fixed deadlines, the exact reminder dates,
 * an automatic title, the cars / homes already used, missing car documents.
 */

import type { CategoryId, LanguageCode, RawDocument, RecurrenceValue } from "./constants";
import { addDaysToDate } from "./dateUtils";
import { translateSubtype } from "./i18n";
import { normalizeText } from "./smartDefaults";

const LONG_LIVED_TYPES = new Set(["Carte de identitate", "Pașaport", "Permis conducere"]);

/** Month offsets offered as quick buttons under the due date */
export function dateShortcuts(type: string, rec: RecurrenceValue): number[] {
  if (rec === "5years" || rec === "10years" || LONG_LIVED_TYPES.has(type)) return [60, 120];
  return [1, 6, 12];
}

// Fixed yearly deadlines: local taxes on 31 March (the discount for paying in
// full), the single tax return on 25 May
const LEGAL_DEADLINES: Record<string, { month: number; day: number }> = {
  "Impozit auto": { month: 3, day: 31 },
  "Impozit locuință": { month: 3, day: 31 },
  "Declarație unică": { month: 5, day: 25 },
};

/** The next fixed deadline for this type (today counts), or null */
export function legalDueDate(type: string, today: string): string | null {
  const deadline = LEGAL_DEADLINES[type];
  if (!deadline) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const on = (year: number) => `${year}-${pad(deadline.month)}-${pad(deadline.day)}`;
  const year = Number(today.slice(0, 4));
  return today <= on(year) ? on(year) : on(year + 1);
}

/** Advance reminders (days before the due date) still ahead, soonest first */
export function upcomingReminderDates(due: string, offsets: number[], today: string): string[] {
  return offsets
    .filter((days) => days > 0)
    .map((days) => addDaysToDate(due, -days))
    .filter((date) => date > today)
    .sort();
}

/** Title for a document saved without one: "RCA — Dacia Duster" */
export function autoTitle(type: string, asset: string, lang: LanguageCode): string {
  const name = translateSubtype(type, lang);
  return asset.trim() ? `${name} — ${asset.trim()}` : name;
}

/** Cars / homes already used, most used first, spelled as first written */
export function knownAssets(docs: Pick<RawDocument, "asset">[]): string[] {
  const seen = new Map<string, { label: string; count: number }>();
  for (const { asset } of docs) {
    const label = asset?.trim();
    if (!label) continue;
    const key = normalizeText(label);
    const entry = seen.get(key);
    if (entry) entry.count++;
    else seen.set(key, { label, count: 1 });
  }
  return [...seen.values()].sort((a, b) => b.count - a.count).map((entry) => entry.label);
}

const CAR_ESSENTIALS = ["RCA", "ITP", "Rovignetă", "CASCO"];

/** The usual car documents not added yet for this car */
export function companionTypes(cat: CategoryId, asset: string, docs: RawDocument[]): string[] {
  if (cat !== "vehicule" || !asset.trim()) return [];
  const key = normalizeText(asset);
  const have = new Set(
    docs.filter((d) => !d.resolved && d.asset && normalizeText(d.asset) === key).map((d) => d.type),
  );
  return CAR_ESSENTIALS.filter((type) => !have.has(type));
}
