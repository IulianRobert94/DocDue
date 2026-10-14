/**
 * DocDue — Smart Defaults
 *
 * When a user selects a document subtype, suggest default recurrence.
 * This reduces friction when adding documents.
 */

import { CATEGORIES } from "./constants";
import type { RecurrenceValue, CategoryId } from "./constants";

interface SmartDefault {
  recurrence: RecurrenceValue;
}

/**
 * Map of subtype → smart defaults.
 * Keys are Romanian subtypes (as stored in CATEGORIES).
 */
const SUBTYPE_DEFAULTS: Record<string, SmartDefault> = {
  // Vehicule — mostly annual
  "RCA": { recurrence: "annual" },
  "CASCO": { recurrence: "annual" },
  "ITP": { recurrence: "annual" },
  "Rovignetă": { recurrence: "annual" },
  "Impozit auto": { recurrence: "annual" },
  "Revizie service": { recurrence: "annual" },
  "Tahograf calibrare": { recurrence: "annual" },
  "Copie conformă": { recurrence: "annual" },
  "Verificare ADR": { recurrence: "annual" },
  "Asigurare CMR": { recurrence: "annual" },
  "Carte verde": { recurrence: "annual" },
  // Required in the car: the kit has an expiry date, the extinguisher a yearly check
  "Trusă medicală": { recurrence: "none" },
  "Extinctor": { recurrence: "annual" },

  // Personal — IDs are renewed for 10 years; "10years" also starts the warning
  // 6 months ahead, enough time to book an appointment
  "Permis conducere": { recurrence: "10years" },
  "Carte de identitate": { recurrence: "10years" },
  "Pașaport": { recurrence: "10years" },
  "Atestat profesional": { recurrence: "annual" },
  "Card tahograf": { recurrence: "5years" },
  "Fișă medicală": { recurrence: "annual" },
  "Certificat ADR": { recurrence: "5years" },
  "Aviz psihologic": { recurrence: "annual" },
  "Contract de muncă": { recurrence: "annual" },
  "Asigurare viață": { recurrence: "annual" },
  "Asigurare sănătate": { recurrence: "annual" },

  // Casa — mostly monthly
  "Curent electric": { recurrence: "monthly" },
  "Gaz": { recurrence: "monthly" },
  "Apă": { recurrence: "monthly" },
  "Internet": { recurrence: "monthly" },
  "TV": { recurrence: "monthly" },
  "Telefon fix": { recurrence: "monthly" },
  "Gunoi": { recurrence: "monthly" },
  "Întreținere": { recurrence: "monthly" },
  "Asigurare PAD": { recurrence: "annual" },
  "Asigurare facultativă": { recurrence: "annual" },
  "Contract chirie": { recurrence: "monthly" },
  "Impozit locuință": { recurrence: "annual" },
  "Revizie centrală": { recurrence: "annual" },
  "Verificare gaze": { recurrence: "annual" },
  "Telefonie mobilă": { recurrence: "monthly" },
  "Streaming video": { recurrence: "monthly" },
  "Streaming muzică": { recurrence: "monthly" },
  "Cloud storage": { recurrence: "monthly" },
  "Domeniu web": { recurrence: "annual" },
  "Hosting": { recurrence: "monthly" },
  "Licență software": { recurrence: "annual" },
  // A warranty ends once — no recurrence
  "Garanție produs": { recurrence: "none" },

  // Financiar
  "Certificat înregistrare": { recurrence: "none" },
  "Licență transport": { recurrence: "annual" },
  "Certificat competență": { recurrence: "none" },
  "Card bancar": { recurrence: "none" },
  "Autorizație": { recurrence: "annual" },
  "Asigurare profesională": { recurrence: "annual" },
  "Contract client": { recurrence: "annual" },
  "Contract furnizor": { recurrence: "annual" },
  "Rată credit": { recurrence: "monthly" },
  "Rată leasing": { recurrence: "monthly" },
  "Impozit ANAF": { recurrence: "monthly" },
  "Amendă": { recurrence: "none" },
  "CAS/CASS": { recurrence: "monthly" },
  "Impozit venit": { recurrence: "annual" },
  "Declarație unică": { recurrence: "annual" },
};

/**
 * Get smart default recurrence for a document subtype.
 * Returns null if no default is found.
 */
export function getSmartDefaults(subtype: string): SmartDefault | null {
  return SUBTYPE_DEFAULTS[subtype] || null;
}

/**
 * Recurrence to use when the form's document type changes — whether the user
 * picked it, or it was pre-filled (category default, title detection, scan).
 * The type's smart default applies unless the user chose a recurrence
 * themselves; types without a default keep the current value.
 */
export function resolveRecurrenceForType(
  type: string,
  currentRec: RecurrenceValue,
  userChoseRec: boolean,
): RecurrenceValue {
  if (userChoseRec) return currentRec;
  return getSmartDefaults(type)?.recurrence ?? currentRec;
}

/** Lowercase, no diacritics, punctuation as spaces: "Factură apă!" → "factura apa" */
export function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// Romanian endings, so "curentul", "chiria", "rovinietei" still match their
// keyword — but a different word that merely starts the same ("rataxat") doesn't
const SHORT_ENDINGS = ["", "ul", "ului"];
const LONG_ENDINGS = ["", "ul", "ului", "a", "ei", "ele", "e", "i", "ii", "le", "lor", "uri", "urile"];

function wordMatches(token: string, word: string): boolean {
  if (word.length <= 3) return SHORT_ENDINGS.some((end) => token === word + end);
  const stems = /[aei]$/.test(word) ? [word, word.slice(0, -1)] : [word];
  return stems.some((stem) => LONG_ENDINGS.some((end) => token === stem + end));
}

/** True when `phrase` (normalized words) appears as whole words in the normalized text */
export function containsWords(normalized: string, phrase: string): boolean {
  const tokens = normalized.split(" ");
  const words = phrase.split(" ");
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((word, j) => wordMatches(tokens[i + j], word))) return true;
  }
  return false;
}

/**
 * Words people use for a type, diacritics-free — checked before the type names
 * themselves. Order matters: the first match wins ("Garanție apartament" is a
 * warranty; "Impozit casă" is the property tax, not CAS).
 */
export const TYPE_KEYWORDS: readonly (readonly [string, CategoryId, string])[] = [
  ["garantie", "casa", "Garanție produs"],
  ["warranty", "casa", "Garanție produs"],
  ["impozit casa", "casa", "Impozit locuință"],
  ["impozit locuinta", "casa", "Impozit locuință"],
  ["impozit cladire", "casa", "Impozit locuință"],
  ["impozit apartament", "casa", "Impozit locuință"],
  ["impozit masina", "vehicule", "Impozit auto"],
  ["impozit auto", "vehicule", "Impozit auto"],
  ["asigurare casa", "casa", "Asigurare facultativă"],
  ["asigurare locuinta", "casa", "Asigurare facultativă"],
  ["asigurare apartament", "casa", "Asigurare facultativă"],
  ["pad", "casa", "Asigurare PAD"],
  ["rca", "vehicule", "RCA"],
  ["itp", "vehicule", "ITP"],
  ["casco", "vehicule", "CASCO"],
  ["rovigneta", "vehicule", "Rovignetă"],
  ["rovinieta", "vehicule", "Rovignetă"],
  ["vigneta", "vehicule", "Rovignetă"],
  ["carte verde", "vehicule", "Carte verde"],
  ["tahograf", "vehicule", "Tahograf calibrare"],
  ["curent", "casa", "Curent electric"],
  ["gaz", "casa", "Gaz"],
  ["apa", "casa", "Apă"],
  ["internet", "casa", "Internet"],
  ["chirie", "casa", "Contract chirie"],
  ["intretinere", "casa", "Întreținere"],
  ["pasaport", "personal", "Pașaport"],
  ["buletin", "personal", "Carte de identitate"],
  ["permis", "personal", "Permis conducere"],
  ["amenda", "financiar", "Amendă"],
  ["rata", "financiar", "Rată credit"],
  ["leasing", "financiar", "Rată leasing"],
  ["anaf", "financiar", "Impozit ANAF"],
  ["cas", "financiar", "CAS/CASS"],
  ["cass", "financiar", "CAS/CASS"],
];

/**
 * Auto-detect category and type from a document title, matching whole words.
 * Example: "RCA Ford Focus" → { cat: 'vehicule', type: 'RCA' }
 */
export function autoCategorize(title: string): { cat?: CategoryId; type?: string } | null {
  if (!title || title.length < 2) return null;
  const normalized = normalizeText(title);
  if (!normalized) return null;

  for (const [keyword, cat, type] of TYPE_KEYWORDS) {
    if (containsWords(normalized, keyword)) return { cat, type };
  }

  // Then the type names themselves ("Verificare gaze", "Revizie centrală"…)
  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    for (const subtype of cat.subtypes) {
      if (subtype === "Altele") continue;
      if (containsWords(normalized, normalizeText(subtype))) {
        return { cat: catId as CategoryId, type: subtype };
      }
    }
  }

  return null;
}
