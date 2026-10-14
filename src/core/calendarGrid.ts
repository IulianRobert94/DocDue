/**
 * DocDue — Month calendar
 *
 * The grid of a month (Monday-first weeks, as in Romania) and what falls on
 * each day: the documents' due dates and, faded, the next repeats of
 * recurring ones — so "what's coming in December?" has a visual answer.
 */

import type { EnrichedDocument } from "./constants";
import { toDateString } from "./dateUtils";
import { projectOccurrences } from "./payment";

/** Weeks of a month, Monday first; null for the days outside it */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(toDateString(new Date(year, month - 1, day)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The month `delta` months away, as [year, month] (month 1–12) */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const date = new Date(year, month - 1 + delta, 1);
  return [date.getFullYear(), date.getMonth() + 1];
}

export interface DayEntry {
  doc: EnrichedDocument;
  /** A future repeat of a recurring document, not its current due date */
  projected: boolean;
}

/** What falls on each day between `from` and `to` (inclusive) */
export function entriesByDay(docs: EnrichedDocument[], from: string, to: string): Map<string, DayEntry[]> {
  const days = new Map<string, DayEntry[]>();
  for (const doc of docs) {
    for (const date of projectOccurrences(doc, from, to)) {
      const list = days.get(date) ?? [];
      list.push({ doc, projected: date !== doc.due });
      days.set(date, list);
    }
  }
  return days;
}
