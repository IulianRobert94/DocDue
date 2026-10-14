/**
 * DocDue — Paying / renewing a document
 *
 * The rules behind the "Plătit / Reînnoit" sheet: where the due date moves,
 * how many periods a payment covers, and the updated document. Pure — the
 * store applies the result and keeps the previous version for Undo.
 */

import type { CategoryId, PaymentRecord, RawDocument, RecurrenceValue } from "./constants";
import { addDaysToDate, addMonthsKeepingDay } from "./dateUtils";
import { getRecurrenceDays } from "./formatters";
import { isDemoDocument } from "./helpers";

const MONTHS: Partial<Record<RecurrenceValue, number>> = {
  monthly: 1, quarterly: 3, biannual: 6, annual: 12,
  "2years": 24, "5years": 60, "10years": 120,
};

// Types whose validity restarts when renewed (insurance, inspections, permits,
// IDs). Bills, rent, taxes and subscriptions keep a fixed calendar instead.
const CASA_RENEWALS = new Set(["Asigurare PAD", "Asigurare facultativă", "Revizie centrală", "Verificare gaze"]);
const FINANCIAR_RENEWALS = new Set([
  "Asigurare profesională", "Autorizație", "Certificat înregistrare", "Licență transport", "Certificat competență",
]);
const RENEWAL_BY_CATEGORY: Record<CategoryId, (type: string) => boolean> = {
  personal: () => true,
  vehicule: (type) => type !== "Impozit auto",
  casa: (type) => CASA_RENEWALS.has(type),
  financiar: (type) => FINANCIAR_RENEWALS.has(type),
};

/** Documents that simply end (nothing to pay or renew) */
const ENDING_TYPES = new Set(["Garanție produs"]);

/** IDs are renewed for 10 years; other one-time documents get a year by default */
const TEN_YEAR_TYPES = new Set(["Carte de identitate", "Pașaport", "Permis conducere"]);

export function isRenewal(doc: Pick<RawDocument, "cat" | "type">): boolean {
  return RENEWAL_BY_CATEGORY[doc.cat]?.(doc.type) ?? false;
}

export type PayKind = "bill" | "renewal" | "ending";

/** Which word fits the action: "Plătit" (bill), "Reînnoit" (renewal) or "Încheiat" */
export function payKind(doc: Pick<RawDocument, "cat" | "type">): PayKind {
  if (ENDING_TYPES.has(doc.type)) return "ending";
  return isRenewal(doc) ? "renewal" : "bill";
}

export interface PaymentPlan {
  renewal: boolean;
  recurring: boolean;
  overdue: boolean;
  /** Next due date after paying one period (a lapsed renewal restarts today) */
  nextOne: string | null;
  /** Next due date still ahead after paying every missed period */
  nextAll: string | null;
  /** How many periods `nextAll` covers (1 when nothing was missed) */
  periodsAll: number;
  /** One-time documents: suggested new expiry when renewed */
  renewSuggestion: string | null;
}

const dayOf = (date: string) => Number(date.slice(8, 10));

function anchorDayOf(doc: RawDocument): number {
  return Number.isInteger(doc.dueDay) ? (doc.dueDay as number) : dayOf(doc.due);
}

/** One recurrence period after `from`; month-based ones land on `day` (clamped) */
function advance(rec: RecurrenceValue, from: string, day: number): string {
  const months = MONTHS[rec];
  return months ? addMonthsKeepingDay(from, months, day) : addDaysToDate(from, getRecurrenceDays(rec));
}

export function planPayment(doc: RawDocument, today: string): PaymentPlan {
  const renewal = isRenewal(doc);
  const overdue = doc.due < today; // ISO dates compare correctly as strings
  const recurring = getRecurrenceDays(doc.rec) > 0;

  if (!recurring) {
    const months = TEN_YEAR_TYPES.has(doc.type) ? 120 : 12;
    return {
      renewal, recurring, overdue, nextOne: null, nextAll: null, periodsAll: 1,
      renewSuggestion: addMonthsKeepingDay(today, months, dayOf(today)),
    };
  }

  if (renewal) {
    // A lapsed policy or inspection starts over the day it's renewed — the
    // months without cover were never paid for, so there's nothing to catch up
    const next = overdue ? advance(doc.rec, today, dayOf(today)) : advance(doc.rec, doc.due, anchorDayOf(doc));
    return { renewal, recurring, overdue, nextOne: next, nextAll: next, periodsAll: 1, renewSuggestion: null };
  }

  const day = anchorDayOf(doc);
  const nextOne = advance(doc.rec, doc.due, day);
  let nextAll = nextOne;
  let periodsAll = 1;
  while (nextAll < today && periodsAll < 1000) {
    nextAll = advance(doc.rec, nextAll, day);
    periodsAll++;
  }
  return { renewal, recurring, overdue, nextOne, nextAll, periodsAll, renewSuggestion: null };
}

export type PayAction =
  /** Recurring: move to `nextDue`, recording one payment per period covered */
  | { kind: "pay"; nextDue: string; amount: number | null; periods: number }
  /** One-time document renewed: stays active with its new expiry */
  | { kind: "renew"; nextDue: string; amount: number | null }
  /** Done with it: archived, with a payment record only if an amount was paid */
  | { kind: "close"; amount: number | null };

export function applyPayAction(doc: RawDocument, action: PayAction, today: string): RawDocument {
  // Paying an example makes it the user's; its sample payments aren't theirs
  const example = isDemoDocument(doc);
  const history: PaymentRecord[] = example ? [] : [...(doc.paymentHistory ?? [])];
  const base: RawDocument = example ? { ...doc, userEdited: true } : { ...doc };
  const record = (dueDate: string): PaymentRecord => ({ date: today, dueDate, amt: action.amount });
  // The amount actually paid becomes the expected one for next time
  const amount = action.amount != null ? { amt: action.amount } : {};

  if (action.kind === "close") {
    if (action.amount != null) history.push(record(doc.due));
    return { ...base, paymentHistory: history, resolved: today };
  }

  if (action.kind === "renew") {
    history.push(record(doc.due));
    return { ...base, ...amount, due: action.nextDue, paymentHistory: history, resolved: undefined };
  }

  const day = anchorDayOf(doc);
  let periodDue = doc.due;
  for (let i = 0; i < Math.max(1, action.periods); i++) {
    history.push(record(periodDue));
    periodDue = advance(doc.rec, periodDue, day);
  }
  if (!MONTHS[doc.rec]) return { ...base, ...amount, due: action.nextDue, paymentHistory: history };

  // The suggested date keeps the chosen day of month (the 31st survives
  // February); a date the user picked becomes the new one; a lapsed renewal
  // restarts from today
  const plan = planPayment(doc, today);
  const suggested = action.nextDue === plan.nextOne || action.nextDue === plan.nextAll;
  const dueDay = !suggested ? dayOf(action.nextDue) : plan.renewal && plan.overdue ? dayOf(today) : day;
  return { ...base, ...amount, due: action.nextDue, dueDay, paymentHistory: history };
}

/**
 * What a single tap does when there's no sheet to ask (one-tap actions):
 * catch up to the next date ahead with one payment record, or close a one-time
 * document with its planned amount.
 */
export function defaultPayAction(doc: RawDocument, today: string): PayAction {
  const plan = planPayment(doc, today);
  if (!plan.recurring || !plan.nextAll) return { kind: "close", amount: doc.amt };
  return { kind: "pay", nextDue: plan.nextAll, amount: doc.amt, periods: 1 };
}
