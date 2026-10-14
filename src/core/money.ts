/**
 * DocDue — Amounts in several currencies
 *
 * Each document can have its own currency (rent in EUR, bills in lei); older
 * documents use the app currency. Totals are kept per currency and shown side
 * by side — different currencies are never added together.
 */

import { CURRENCY_OPTIONS } from "./constants";
import type { CurrencyCode, LanguageCode, RawDocument } from "./constants";
import { formatMoney } from "./formatters";

export type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

const KNOWN = new Set<string>(CURRENCY_OPTIONS.map((c) => c.value));

/** The document's currency, or the app currency when it has none (or an unknown one) */
export function docCurrency(doc: Pick<RawDocument, "currency">, fallback: CurrencyCode): CurrencyCode {
  return doc.currency && KNOWN.has(doc.currency) ? doc.currency : fallback;
}

/** Amounts added up per currency (documents without an amount are skipped) */
export function sumByCurrency(docs: Pick<RawDocument, "amt" | "currency">[], fallback: CurrencyCode): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const doc of docs) {
    if (!doc.amt) continue;
    const code = docCurrency(doc, fallback);
    totals[code] = (totals[code] ?? 0) + doc.amt;
  }
  return totals;
}

/** "3.450 lei · 400 €" — in the app's currency order, empty when nothing to show */
export function formatTotals(totals: CurrencyTotals, lang: LanguageCode): string {
  return CURRENCY_OPTIONS
    .filter((c) => (totals[c.value] ?? 0) > 0)
    .map((c) => formatMoney(totals[c.value] as number, c.value, lang))
    .join(" · ");
}
