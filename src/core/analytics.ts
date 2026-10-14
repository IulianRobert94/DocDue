/**
 * DocDue — Spending analytics
 *
 * Pure computation behind the Analytics screen: payment history totals,
 * the 30-day forecast, category split and monthly bars.
 */

import { CATEGORIES } from "./constants";
import type { CategoryId, Category, EnrichedDocument, LanguageCode, RawDocument } from "./constants";
import { addDaysToDate, toDateString } from "./dateUtils";
import { t } from "./i18n";
import { isDemoDocument } from "./helpers";
import { planPayment, projectOccurrences } from "./payment";

export interface CategoryBar {
  id: CategoryId;
  cat: Category;
  amount: number;
  ratio: number;
  pct: number;
}

export interface MonthAmount {
  label: string;
  amount: number;
}

export interface Analytics {
  totalPaid: number;
  totalPayments: number;
  /** Paid per month, over every month since the first payment */
  avgMonthly: number;
  /** Months since the first payment (0 = no payments yet) */
  monthCount: number;
  /** Due from today to 30 days ahead, repeats included */
  total30: number;
  count30: number;
  /** Unpaid and late, every missed period included */
  overdueTotal: number;
  overdueCount: number;
  /** Everything due in this month and the next 11 */
  forecastTotal: number;
  /** The 12-month forecast by category */
  catBars: CategoryBar[];
  /** The 12-month forecast, month by month */
  monthBars: (MonthAmount & { ratio: number })[];
  trendMonths: MonthAmount[];
}

const monthKeyOf = (date: string) => date.slice(0, 7);

/** Whole months from `fromKey` to `toKey` ("YYYY-MM"), both included */
function monthsSpanned(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

/**
 * @param active   Enriched, non-archived documents (forecast + categories)
 * @param allDocs  Every stored document — history includes archived one-time
 *                 documents, whose payments are part of what was spent
 * Example documents are left out everywhere.
 */
export function computeAnalytics(
  active: EnrichedDocument[],
  allDocs: RawDocument[],
  language: LanguageCode,
  now: Date = new Date(),
): Analytics {
  const today = toDateString(now);
  const in30 = addDaysToDate(today, 30);
  const monthLabel = (key: string) => t(language, `month_short_${parseInt(key.split("-")[1], 10)}`);

  // ── Historical totals from paymentHistory ──
  let totalPaid = 0;
  let totalPayments = 0;
  const historyMonthMap = new Map<string, number>();
  for (const doc of allDocs) {
    if (isDemoDocument(doc)) continue;
    for (const p of doc.paymentHistory || []) {
      if (p.amt == null) continue;
      totalPaid += p.amt;
      totalPayments++;
      const key = monthKeyOf(p.date);
      historyMonthMap.set(key, (historyMonthMap.get(key) || 0) + p.amt);
    }
  }
  const firstMonth = [...historyMonthMap.keys()].sort()[0];
  const monthCount = firstMonth ? monthsSpanned(firstMonth, monthKeyOf(today)) : 0;
  const avgMonthly = monthCount > 0 ? totalPaid / monthCount : 0;

  // ── Forward-looking: this month and the next 11 ──
  const monthKeys = Array.from({ length: 12 }, (_, i) => toDateString(new Date(now.getFullYear(), now.getMonth() + i, 1)).slice(0, 7));
  const forecastEnd = toDateString(new Date(now.getFullYear(), now.getMonth() + 12, 0));
  const monthMap = new Map<string, number>(monthKeys.map((key) => [key, 0]));
  const catTotals: Record<CategoryId, number> = { vehicule: 0, casa: 0, personal: 0, financiar: 0 };
  let total30 = 0;
  let count30 = 0;
  let overdueTotal = 0;
  let overdueCount = 0;
  let forecastTotal = 0;

  for (const doc of active) {
    if (isDemoDocument(doc) || !doc.amt) continue;
    const amt = doc.amt;

    if (doc.due < today) {
      // A late bill owes every missed period (all before today — the one
      // falling today is due now); a lapsed policy or a one-time document, once
      const plan = planPayment(doc, today);
      const missed = plan.recurring && !plan.renewal ? plan.periodsAll : 1;
      overdueTotal += amt * missed;
      overdueCount++;
    }

    for (const due of projectOccurrences(doc, today, forecastEnd)) {
      if (due <= in30) { total30 += amt; count30++; }
      const key = monthKeyOf(due);
      monthMap.set(key, (monthMap.get(key) || 0) + amt);
      catTotals[doc.cat] += amt;
      forecastTotal += amt;
    }
  }

  // Category bars
  const totalCatSum = Object.values(catTotals).reduce((a, b) => a + b, 0);
  const maxCatTotal = Math.max(...Object.values(catTotals), 1);
  const catBars = (Object.keys(CATEGORIES) as CategoryId[])
    .map((catId) => ({
      id: catId,
      cat: CATEGORIES[catId],
      amount: catTotals[catId],
      ratio: catTotals[catId] / maxCatTotal,
      pct: totalCatSum > 0 ? Math.round((catTotals[catId] / totalCatSum) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Monthly forecast: 12 bars, empty months included
  const maxMonth = Math.max(...monthKeys.map((key) => monthMap.get(key) || 0), 1);
  const monthBars = monthKeys.map((key) => {
    const amount = monthMap.get(key) || 0;
    return { label: monthLabel(key), amount, ratio: amount / maxMonth };
  });

  // Historical monthly totals for the trend line (last 6 months)
  const trendMonths = [...historyMonthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([key, amount]) => ({ label: monthLabel(key), amount }));

  return {
    totalPaid, totalPayments, avgMonthly, monthCount, total30, count30,
    overdueTotal, overdueCount, forecastTotal, catBars, monthBars, trendMonths,
  };
}
