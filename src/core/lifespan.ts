/**
 * DocDue — Maintenance journal logic ("Jurnal întreținere")
 *
 * Pure functions over tracked items: how long each installed part lasted,
 * averages, an estimate for the next replacement, and list ordering.
 */

import { CATEGORIES } from "./constants";
import type { ItemInstall, LanguageCode, TrackedItem } from "./constants";
import { addDaysToDate, daysBetween, parseLocalDate } from "./dateUtils";
import { t, tp } from "./i18n";
import { formatDaysRemaining } from "./formatters";

export interface ItemStats {
  /** The install currently in use, if any */
  current: ItemInstall | null;
  isInUse: boolean;
  /** Days since the current install started */
  currentAgeDays: number | null;
  /** Installs that ended (broke or replaced) */
  completed: number;
  avgDays: number | null;
  minDays: number | null;
  maxDays: number | null;
  /** Average km of ended installs that have both odometer readings */
  avgKm: number | null;
  totalCost: number;
  brokeCount: number;
  /** current.start + average lifespan — only once something was replaced */
  estimatedNext: string | null;
  /** Last ended install when nothing is in use */
  lastEnded: ItemInstall | null;
}

/** Days an install lasted — up to `today` while it's still in use. */
export function installDurationDays(install: ItemInstall, today: string): number {
  return Math.max(0, daysBetween(install.start, install.end ?? today));
}

/** Km an install lasted, or null without two valid odometer readings. */
export function installDurationKm(install: ItemInstall): number | null {
  if (typeof install.startKm !== "number" || typeof install.endKm !== "number") return null;
  const km = install.endKm - install.startKm;
  return km >= 0 ? km : null;
}

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function getItemStats(item: TrackedItem, today: string): ItemStats {
  const installs = item.installs;
  const last = installs[installs.length - 1];
  const current = last && !last.end ? last : null;
  const ended = installs.filter((i) => i.end);

  const endedDays = ended.map((i) => installDurationDays(i, today));
  const endedKm = ended.map(installDurationKm).filter((km): km is number => km !== null);
  const avgDays = average(endedDays);

  return {
    current,
    isInUse: current !== null,
    currentAgeDays: current ? installDurationDays(current, today) : null,
    completed: ended.length,
    avgDays,
    minDays: endedDays.length ? Math.min(...endedDays) : null,
    maxDays: endedDays.length ? Math.max(...endedDays) : null,
    avgKm: average(endedKm),
    totalCost: installs.reduce((sum, i) => sum + (typeof i.cost === "number" ? i.cost : 0), 0),
    brokeCount: ended.filter((i) => i.endReason === "broke").length,
    estimatedNext: current && avgDays !== null ? addDaysToDate(current.start, Math.round(avgDays)) : null,
    lastEnded: current ? null : ended[ended.length - 1] ?? null,
  };
}

/**
 * Human duration: "12 zile", "7 luni", "3 ani și 2 luni" / "3 years, 2 months".
 * Under a month it counts days; above that, whole months (rounded).
 */
export function formatDuration(days: number, lang: LanguageCode): string {
  const whole = Math.round(days);
  if (whole <= 0) return t(lang, "duration_less_than_day");
  if (whole < 31) return tp(lang, "duration_days", whole);
  const totalMonths = Math.max(1, Math.round(whole / 30.4375));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return tp(lang, "duration_months", months);
  if (months === 0) return tp(lang, "duration_years", years);
  return t(lang, "duration_join", {
    a: tp(lang, "duration_years", years),
    b: tp(lang, "duration_months", months),
  });
}

/**
 * Lowest odometer reading an event may record — readings never go
 * backwards. Replace/broke close the install in use (≥ its start reading);
 * a new installation follows the last recorded reading. Null = no limit.
 */
export function minimumKm(item: TrackedItem, mode: "replace" | "broke" | "install"): number | null {
  const last = item.installs[item.installs.length - 1];
  if (!last) return null;
  if (mode === "install") {
    const reading = last.endKm ?? last.startKm;
    return typeof reading === "number" ? reading : null;
  }
  return !last.end && typeof last.startKm === "number" ? last.startKm : null;
}

/**
 * When the estimated replacement falls, relative to today: the usual day
 * wording up to a month ("în 12 zile"), then "peste ~7 luni", or
 * "depășită cu 1 lună" once the estimate has passed.
 */
export function formatEstimateWhen(daysAway: number, lang: LanguageCode): string {
  if (daysAway < 0) return t(lang, "journal_overdue_by", { duration: formatDuration(-daysAway, lang) });
  if (daysAway < 31) return formatDaysRemaining(daysAway, lang);
  return t(lang, "journal_in_about", { duration: formatDuration(daysAway, lang) });
}

/**
 * List order: items that broke and weren't replaced first (they need
 * attention), then the soonest estimated replacement, then the rest by
 * name, and items with no history last.
 */
export function sortItems(items: TrackedItem[], today: string, lang: LanguageCode): TrackedItem[] {
  const rank = (item: TrackedItem, stats: ItemStats) => {
    if (item.installs.length === 0) return 3;
    if (!stats.isInUse) return 0;
    return stats.estimatedNext ? 1 : 2;
  };
  return items
    .map((item) => ({ item, stats: getItemStats(item, today) }))
    .sort((a, b) => {
      const ra = rank(a.item, a.stats);
      const rb = rank(b.item, b.stats);
      if (ra !== rb) return ra - rb;
      if (ra === 1 && a.stats.estimatedNext !== b.stats.estimatedNext) {
        return (a.stats.estimatedNext as string) < (b.stats.estimatedNext as string) ? -1 : 1;
      }
      return a.item.name.localeCompare(b.item.name, lang);
    })
    .map(({ item }) => item);
}

/**
 * Group items by the object they belong to ("Dacia Duster", "Apartament"),
 * matching names regardless of case/extra spaces. Named groups come first
 * (alphabetical), items without an object last.
 */
export function groupItemsByAsset(items: TrackedItem[]): { asset: string | null; items: TrackedItem[] }[] {
  const groups = new Map<string, { asset: string; items: TrackedItem[] }>();
  const ungrouped: TrackedItem[] = [];
  for (const item of items) {
    const label = item.asset?.trim();
    if (!label) {
      ungrouped.push(item);
      continue;
    }
    const key = label.toLocaleLowerCase();
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { asset: label, items: [item] });
  }
  const named = [...groups.values()].sort((a, b) => a.asset.localeCompare(b.asset));
  return [
    ...named,
    ...(ungrouped.length ? [{ asset: null, items: ungrouped }] : []),
  ];
}

const isValidDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(parseLocalDate(v).getTime());
const isOptionalKm = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);

function isValidInstall(value: unknown): value is ItemInstall {
  if (!value || typeof value !== "object") return false;
  const i = value as Record<string, unknown>;
  if (typeof i.id !== "string" || !isValidDate(i.start)) return false;
  if (i.end !== undefined && (!isValidDate(i.end) || (i.end as string) < (i.start as string))) return false;
  if (!isOptionalKm(i.startKm) || !isOptionalKm(i.endKm)) return false;
  if (i.endReason !== undefined && i.endReason !== "broke" && i.endReason !== "replaced") return false;
  if (i.cost !== undefined && i.cost !== null && (typeof i.cost !== "number" || !Number.isFinite(i.cost) || i.cost < 0)) return false;
  if (i.note !== undefined && typeof i.note !== "string") return false;
  return true;
}

/** Periods in date order, none overlapping, and only the last one may be open. */
function isConsistentTimeline(installs: ItemInstall[]): boolean {
  return installs.every((install, i) => {
    const next = installs[i + 1];
    if (!next) return true;
    return !!install.end && install.end <= next.start;
  });
}

/** Structural check for items loaded from storage or a backup file. */
export function isValidItem(value: unknown): value is TrackedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" && item.name.trim().length > 0 &&
    typeof item.cat === "string" && Object.prototype.hasOwnProperty.call(CATEGORIES, item.cat) &&
    (item.asset === undefined || typeof item.asset === "string") &&
    (item.notes === undefined || typeof item.notes === "string") &&
    typeof item.createdAt === "string" &&
    Array.isArray(item.installs) && item.installs.every(isValidInstall) &&
    isConsistentTimeline(item.installs as ItemInstall[])
  );
}
