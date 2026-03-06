/**
 * DocDue — Document Validation
 *
 * Validează un document înainte de salvare.
 * Returnează un array de erori (gol = totul e OK).
 */

import type { LanguageCode, RawDocument } from "./constants";
import { CATEGORIES } from "./constants";
import { parseLocalDate } from "./dateUtils";
import { t } from "./i18n";

/**
 * Validează un document înainte de salvare.
 *
 * Reguli:
 * 1. Titlul e obligatoriu
 * 2. Data scadenței e obligatorie și trebuie să fie validă
 * 3. Suma (dacă există) trebuie să fie un număr pozitiv
 * 4. Categoria e obligatorie și trebuie să fie validă
 *
 * Returnează un array de mesaje de eroare.
 * Array gol = documentul e valid.
 */
export function validateDocument(doc: Partial<RawDocument>, lang: LanguageCode = "ro"): string[] {
  const errors: string[] = [];

  if (!doc.title?.trim()) {
    errors.push(t(lang, "val_title_required"));
  }

  if (!doc.due) {
    errors.push(t(lang, "val_date_required"));
  } else {
    const parsed = parseLocalDate(doc.due);
    if (isNaN(parsed.getTime())) {
      errors.push(t(lang, "val_date_invalid"));
    }
  }

  // Amount validation — convert empty string to null at boundary (form may pass "" before conversion)
  const amtValue = doc.amt === (("" as unknown) as number) ? null : doc.amt;
  if (
    amtValue !== null &&
    amtValue !== undefined &&
    (isNaN(+(amtValue)) || +(amtValue) < 0 || +(amtValue) > 999_999_999)
  ) {
    errors.push(t(lang, "val_amount_positive"));
  }

  // Category validation — required and must be a known category
  if (!doc.cat) {
    errors.push(t(lang, "val_category_invalid"));
  } else if (!CATEGORIES[doc.cat]) {
    errors.push(t(lang, "val_category_invalid"));
  }

  return errors;
}
