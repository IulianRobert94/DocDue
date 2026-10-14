/**
 * DocDue — Alerts grouping
 *
 * The Alerts tab answers "what do I have to pay or renew, and when?": every
 * document that's late, flagged by its warning window, or due within 30 days,
 * grouped by when — with the money each group needs. Example documents are
 * listed (marked) but their amounts never count.
 */

import type { CurrencyCode, EnrichedDocument } from "./constants";
import { isDemoDocument } from "./helpers";
import { sumByCurrency } from "./money";
import type { CurrencyTotals } from "./money";

export type AlertGroupKey = "overdue" | "week" | "month" | "later";

export interface AlertGroup {
  key: AlertGroupKey;
  data: EnrichedDocument[];
  /** Money due in this group per currency (the user's own documents with an amount) */
  totals: CurrencyTotals;
}

const ORDER: AlertGroupKey[] = ["overdue", "week", "month", "later"];

function groupOf(daysUntil: number): AlertGroupKey {
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 7) return "week";
  if (daysUntil <= 30) return "month";
  return "later";
}

export function groupAlerts(docs: EnrichedDocument[], fallbackCurrency: CurrencyCode): AlertGroup[] {
  const byKey: Record<AlertGroupKey, EnrichedDocument[]> = { overdue: [], week: [], month: [], later: [] };
  for (const doc of docs) {
    if (doc._status === "ok" && doc._daysUntil > 30) continue;
    byKey[groupOf(doc._daysUntil)].push(doc);
  }
  return ORDER
    .map((key) => {
      const data = byKey[key].sort((a, b) => a._daysUntil - b._daysUntil);
      const totals = sumByCurrency(data.filter((d) => !isDemoDocument(d)), fallbackCurrency);
      return { key, data, totals };
    })
    .filter((group) => group.data.length > 0);
}
