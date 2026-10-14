/**
 * DocDue — Excel import row parser
 *
 * Maps spreadsheet rows (RO/EN headers) to document drafts. A row without a
 * real calendar due date is SKIPPED and counted — never silently converted
 * to "today" — so the user can be told exactly how many rows were dropped.
 */

import { CATEGORIES, CURRENCY_OPTIONS, VALID_RECURRENCE_VALUES } from "./constants";
import type { CategoryId, CurrencyCode, LanguageCode, RawDocument, RecurrenceValue } from "./constants";
import { t } from "./i18n";
import { parseImportedDate } from "./dateUtils";

export interface ParsedImportResult {
  docs: Omit<RawDocument, "id">[];
  /** Titled rows dropped because their due date was missing or invalid */
  invalidDates: number;
}

export function parseImportedRows(
  rows: Record<string, unknown>[],
  language: LanguageCode,
): ParsedImportResult {
  const validCats = Object.keys(CATEGORIES) as CategoryId[];
  const docs: Omit<RawDocument, "id">[] = [];
  let invalidDates = 0;

  for (const row of rows) {
    const title = String(row.Title || row.title || row.Titlu || row.name || row.Name || "");
    if (title.trim().length === 0) continue; // no document without a title

    const rawDue = row["Due date"] || row["Data scadentă"] || row["Data scadenta"] || row.due || row.Due || row.Scadenta || row["Scadență"] || "";
    const due = parseImportedDate(rawDue);
    if (!due) {
      invalidDates++;
      continue;
    }

    let cat: CategoryId = "vehicule";
    for (const catId of validCats) {
      const catLabel = t("ro", CATEGORIES[catId].labelKey).toLowerCase();
      const catLabelEn = t("en", CATEGORIES[catId].labelKey).toLowerCase();
      const rowCat = String(row.Category || row.category || row.Categorie || row.cat || "").toLowerCase();
      if (rowCat === catId || rowCat.includes(catLabel) || rowCat.includes(catLabelEn)) {
        cat = catId;
        break;
      }
    }
    const type = String(row.Type || row.type || row.Tip || "");
    // "Pentru" / "For" is what DocDue exports now; the rest are older exports
    const asset = String(row.Pentru || row.For || row["Associated with"] || row.asset || row.Asset || row.Asociat || row["Asociat cu"] || "");
    const rawCurrency = String(row["Monedă"] || row.Moneda || row.Currency || row.currency || "").toUpperCase();
    const currency = CURRENCY_OPTIONS.some((c) => c.value === rawCurrency) ? (rawCurrency as CurrencyCode) : undefined;
    const rawAmt = row.Amount ?? row.amount ?? row.Suma ?? row["Sumă"] ?? row["Suma"];
    const amt = rawAmt !== undefined && rawAmt !== null && rawAmt !== "" ? Number(rawAmt) : null;
    const rec = String(row.Recurrence || row.recurrence || row.rec || row.Recurenta || row["Recurență"] || "none") as RecurrenceValue;
    const notes = String(row.Notes || row.notes || row.Note || row["Notițe"] || "");

    docs.push({
      cat,
      type: type || (language === "en" ? "Other" : "Altele"),
      title,
      asset: asset || undefined,
      due,
      amt: amt !== null && !isNaN(amt) ? amt : null,
      currency,
      rec: VALID_RECURRENCE_VALUES.has(rec) ? rec : "none",
      notes: notes || undefined,
    });
  }

  return { docs, invalidDates };
}
