/**
 * DocDue — Spending analytics
 *
 * Pure computation behind the Analytics screen: payment history totals,
 * the 30-day forecast, category split and monthly bars.
 */

import { CATEGORIES } from "./constants";
import type { CategoryId, Category, EnrichedDocument, LanguageCode, RawDocument } from "./constants";
import { parseLocalDate } from "./dateUtils";
import { t } from "./i18n";

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
  avgMonthly: number;
  monthCount: number;
  total30: number;
  count30: number;
  catBars: CategoryBar[];
  monthBars: (MonthAmount & { ratio: number })[];
  trendMonths: MonthAmount[];
}

/**
 * @param active   Enriched, non-archived documents (forecast + categories)
 * @param allDocs  Every stored document — history includes archived one-time
 *                 documents, whose payments are part of what was spent
 */
export function computeAnalytics(
  active: EnrichedDocument[],
  allDocs: RawDocument[],
  language: LanguageCode,
  now: Date = new Date(),
): Analytics {
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const in90 = new Date(now.getTime() + 90 * 86_400_000);
  const monthLabel = (key: string) => t(language, `month_short_${parseInt(key.split("-")[1], 10)}`);

  // ── Historical totals from paymentHistory ──
  let totalPaid = 0;
  let totalPayments = 0;
  const historyMonthMap = new Map<string, number>();
  for (const doc of allDocs) {
    for (const p of doc.paymentHistory || []) {
      if (p.amt == null) continue;
      totalPaid += p.amt;
      totalPayments++;
      const key = p.date.substring(0, 7);
      historyMonthMap.set(key, (historyMonthMap.get(key) || 0) + p.amt);
    }
  }
  const monthCount = historyMonthMap.size;
  const avgMonthly = monthCount > 0 ? totalPaid / monthCount : 0;

  // ── Forward-looking ──
  let total30 = 0;
  let count30 = 0;
  const catTotals: Record<CategoryId, number> = {
    vehicule: 0, casa: 0, personal: 0, financiar: 0,
  };
  const monthMap = new Map<string, number>();

  for (const doc of active) {
    const dueDate = parseLocalDate(doc.due);

    if (doc._daysUntil >= 0 && doc.amt) {
      catTotals[doc.cat] += doc.amt;
    }

    if (dueDate >= now && dueDate <= in30 && doc.amt) {
      total30 += doc.amt;
      count30++;
    }

    if (dueDate >= now && dueDate <= in90 && doc.amt) {
      const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + doc.amt);
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

  // Monthly forecast (max 3 months)
  const monthBarsData = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key, amount]) => ({ label: monthLabel(key), amount }));
  const maxMonth = Math.max(...monthBarsData.map((m) => m.amount), 1);
  const monthBars = monthBarsData.map((m) => ({ ...m, ratio: m.amount / maxMonth }));

  // Historical monthly totals for the trend line (last 6 months)
  const trendMonths = [...historyMonthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([key, amount]) => ({ label: monthLabel(key), amount }));

  return {
    totalPaid, totalPayments, avgMonthly, monthCount, total30, count30,
    catBars, monthBars, trendMonths,
  };
}
