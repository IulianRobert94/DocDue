/**
 * DocDue — Document Enrichment & Sorting
 *
 * "Enrichment" = adaugă câmpuri calculate la un document brut.
 * Documentele sunt stocate simplu (doar datele de bază).
 * La afișare, le "îmbogățim" cu câmpuri calculate:
 *   _daysUntil = câte zile mai sunt până la scadență
 *   _status = "expired" | "warning" | "ok"
 */

import type { RawDocument, EnrichedDocument, RecurrenceValue, LanguageCode, SortField, SortDirection } from "./constants";
import { calculateDaysUntil, getDocumentStatus } from "./dateUtils";

/**
 * Returns the automatic warning threshold based on document recurrence.
 */
export function getWarningDaysForRecurrence(rec: RecurrenceValue): number {
  switch (rec) {
    case "weekly":    return 3;
    case "biweekly":  return 5;
    case "monthly":   return 7;
    case "quarterly": return 14;
    case "biannual":  return 21;
    case "annual":    return 30;
    case "2years":    return 60;
    case "5years":    return 90;
    case "10years":   return 180;
    case "none":      return 30;
    default:          return 30;
  }
}

/**
 * Returns auto-computed reminder days based on recurrence.
 * Used when document has no custom reminderDays override.
 */
export function getAutoReminderDays(rec: RecurrenceValue): number[] {
  switch (rec) {
    case "weekly":    return [1, 3];
    case "biweekly":  return [1, 3, 7];
    case "monthly":   return [1, 3, 7];
    case "quarterly": return [1, 7, 14];
    case "biannual":  return [1, 7, 14, 30];
    case "annual":    return [1, 7, 30];
    case "2years":    return [1, 7, 30, 60];
    case "5years":    return [1, 7, 30, 60, 90];
    case "10years":   return [1, 7, 30, 60, 90];
    case "none":      return [1, 7, 30];
    default:          return [1, 7, 30];
  }
}

/**
 * Returns the effective reminder days for a document.
 * Uses custom override if set, otherwise auto-computed from recurrence.
 */
export function getEffectiveReminderDays(doc: RawDocument): number[] {
  return doc.reminderDays && doc.reminderDays.length > 0
    ? doc.reminderDays
    : getAutoReminderDays(doc.rec);
}

/**
 * Îmbogățește un document brut cu câmpuri calculate.
 * Warning threshold is computed automatically from the document's recurrence.
 */
export function enrichDocument(doc: RawDocument): EnrichedDocument {
  const warningDays = getWarningDaysForRecurrence(doc.rec);
  return {
    ...doc,
    _daysUntil: calculateDaysUntil(doc.due),
    _status: getDocumentStatus(doc.due, warningDays),
  };
}

/**
 * Elimină câmpurile calculate înainte de salvare în storage.
 */
export function stripEnrichedFields(doc: EnrichedDocument | RawDocument): RawDocument {
  const { _daysUntil, _status, ...clean } = doc as EnrichedDocument;
  return clean as RawDocument;
}

/**
 * Sortează documente folosind field + direction.
 * Aceasta e noua funcție principală.
 */
export function sortDocumentsByField(
  documents: EnrichedDocument[],
  field: SortField,
  direction: SortDirection,
  lang: LanguageCode = "ro"
): EnrichedDocument[] {
  const sorted = [...documents];
  const dir = direction === "asc" ? 1 : -1;

  switch (field) {
    case "urgency":
      // Urgency: expired first (group by status), then by days within group
      return sorted.sort((a, b) => {
        const statusOrder = { expired: 0, warning: 1, ok: 2 };
        const sa = statusOrder[a._status] ?? 2;
        const sb = statusOrder[b._status] ?? 2;
        if (sa !== sb) return dir * (sa - sb);
        return dir * (a._daysUntil - b._daysUntil);
      });
    case "date":
      return sorted.sort((a, b) => dir * (a._daysUntil - b._daysUntil));
    case "amount":
      return sorted.sort((a, b) => dir * ((a.amt ?? 0) - (b.amt ?? 0)));
    case "name":
      return sorted.sort((a, b) => dir * (a.title || "").localeCompare(b.title || "", lang));
    default:
      return sorted.sort((a, b) => dir * (a._daysUntil - b._daysUntil));
  }
}

