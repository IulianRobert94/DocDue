/**
 * DocDue — OCR Document Scanning Service
 *
 * Uses ML Kit on-device text recognition to extract data from photos.
 * Parses Romanian/English document text for dates, amounts, and document types.
 *
 * NOTE: Requires a dev build (npx expo prebuild). Does NOT work in Expo Go.
 */

import { CATEGORIES } from "../core/constants";
import type { CategoryId } from "../core/constants";
import { parseLocalDate, getTodayString } from "../core/dateUtils";
import { containsWords, normalizeText, TYPE_KEYWORDS } from "../core/smartDefaults";

// ─── Types ──────────────────────────────────────────────

export interface OcrResult {
  rawText: string;
  date: string | null;       // YYYY-MM-DD
  amount: number | null;
  category: CategoryId | null;
  type: string | null;        // Matched subtype
  title: string | null;       // Best guess for title
}

/** True when a scan produced at least one field the form can fill in. */
export function hasExtractedData(result: OcrResult): boolean {
  return !!(result.date || result.amount != null || result.type || result.title);
}

// ─── OCR Engine ─────────────────────────────────────────

let MlkitOcr: { detectFromUri: (uri: string) => Promise<{ text: string }[]> } | null = null;

/**
 * Check if the native OCR module is available.
 * Returns false in Expo Go (native module not linked).
 */
export function isOcrAvailable(): boolean {
  try {
    if (!MlkitOcr) {
      // Optional native module (absent in Expo Go) — loaded lazily so a missing module can't crash startup
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      MlkitOcr = require("react-native-mlkit-ocr").default;
    }
    return !!MlkitOcr;
  } catch {
    return false;
  }
}

/**
 * Run OCR on an image and extract structured data.
 */
export async function scanDocument(imageUri: string): Promise<OcrResult> {
  if (!isOcrAvailable()) {
    throw new Error("OCR not available. Requires a dev build.");
  }

  const blocks = await MlkitOcr!.detectFromUri(imageUri);
  const rawText = blocks.map((b) => b.text).join("\n");

  const date = extractDate(rawText);
  const amount = extractAmount(rawText);
  const { category, type } = matchDocumentType(rawText);
  const title = extractTitle(rawText, type);

  return { rawText, date, amount, category, type, title };
}

// ─── Date Extraction ────────────────────────────────────

// Words printed before an expiry or due date ("Valabilă până la", "Data scadenței")
const DUE_KEYWORDS = [
  "valabil", "valabilitate", "expira", "expirare", "expirarii", "scadent", "termen",
  "pana la", "valid until", "valid to", "expiry", "expires", "due date",
];

/**
 * Extract the most likely due/expiry date from OCR text.
 * Handles Romanian date formats: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
 */
export function extractDate(text: string): string | null {
  // Pattern: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dateRegex = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
  const matches: { date: string; flagged: boolean }[] = [];

  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    const [, dayStr, monthStr, yearStr] = match;
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    // Validate ranges
    const currentYear = new Date().getFullYear();
    // Validate day range per month (accounts for leap years)
    const maxDay = new Date(year, month, 0).getDate();
    if (month >= 1 && month <= 12 && day >= 1 && day <= maxDay && year >= currentYear - 5 && year <= currentYear + 30) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      // An expiry / due-date keyword a few words earlier on the same line
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const before = normalizeText(text.slice(Math.max(lineStart, match.index - 40), match.index));
      const flagged = DUE_KEYWORDS.some((keyword) => containsWords(before, keyword));
      matches.push({ date: `${year}-${mm}-${dd}`, flagged });
    }
  }

  if (matches.length === 0) return null;

  // 1. Dates printed after "valabil până la / expiră / scadență…": the latest of them
  const flagged = matches.filter((m) => m.flagged).map((m) => m.date).sort();
  if (flagged.length > 0) return flagged[flagged.length - 1];

  // 2. Otherwise the nearest date after today — today is usually the issue date
  const today = getTodayString();
  const ahead = matches.map((m) => m.date).filter((date) => date > today).sort();
  if (ahead.length > 0) return ahead[0];

  // 3. Only past dates: the latest, but only if within the last year
  // (older dates are likely irrelevant and would confuse the user)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const recentPast = matches.filter((m) => parseLocalDate(m.date) >= oneYearAgo);
  if (recentPast.length === 0) return null;
  recentPast.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
  return recentPast[0].date;
}

// ─── Amount Extraction ──────────────────────────────────

/**
 * Extract monetary amount from OCR text.
 * Looks for number patterns near currency indicators.
 */
export function extractAmount(text: string): number | null {
  // Patterns: 123.45, 1.234,56 (Romanian), 1,234.56 (English)
  // Near currency: RON, lei, EUR, €, USD, $
  const patterns = [
    // "123.45 RON" or "RON 123.45"
    /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:RON|lei|EUR|USD|€|\$)/gi,
    /(?:RON|lei|EUR|USD|€|\$)\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi,
    // "Total: 123.45" or "Suma: 123.45"
    /(?:total|suma|plat[aă]|amount|pret|preț|valoare)[:\s]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi,
    // Standalone large numbers (likely amounts)
    /\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/g,
  ];

  // Currency/keyword-anchored patterns are reliable — take the first such match.
  for (const pattern of patterns.slice(0, 3)) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return parseRomanianNumber(match[1]);
    }
  }

  // No anchored amount: among standalone 2-decimal numbers, pick the largest
  // plausible one (the total is usually the biggest figure) rather than the
  // first, which is often a rate, quantity, or serial fragment.
  const standalone = patterns[3];
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = standalone.exec(text)) !== null) {
    const val = parseRomanianNumber(m[1]);
    if (val !== null && (best === null || val > best)) best = val;
  }
  return best;
}

/**
 * Parse a number string that might use Romanian format (1.234,56)
 * or English format (1,234.56).
 */
export function parseRomanianNumber(str: string): number | null {
  // Romanian: 1.234,56 → replace dots, then comma to dot
  if (str.includes(",") && str.indexOf(",") > str.lastIndexOf(".")) {
    const cleaned = str.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  // English: 1,234.56 → remove commas
  const cleaned = str.replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// ─── Document Type Matching ─────────────────────────────

// Phrases printed on Romanian documents, checked before the type names
const DOCUMENT_PHRASES: readonly (readonly [string, CategoryId, string])[] = [
  ["polita rca", "vehicule", "RCA"],
  ["asigurare obligatorie", "vehicule", "RCA"],
  ["inspectie tehnica", "vehicule", "ITP"],
  ["permis de conducere", "personal", "Permis conducere"],
  ["energie electrica", "casa", "Curent electric"],
  ["energie activa", "casa", "Curent electric"],
  ["gaze naturale", "casa", "Gaz"],
  ["apa canal", "casa", "Apă"],
  ["impozit pe venit", "financiar", "Impozit venit"],
  ["proces verbal", "financiar", "Amendă"],
];

// Last resort: the category is clear, the exact kind may not be
const FALLBACK_PHRASES: readonly (readonly [string, CategoryId, string | null])[] = [
  ["credit", "financiar", "Rată credit"],
  ["impozit", "financiar", "Impozit ANAF"],
  ["factura", "casa", null],
];

// Type names, longest first ("Verificare gaze" before "Gaz")
const SUBTYPE_WORDS = Object.entries(CATEGORIES)
  .flatMap(([catId, cat]) => cat.subtypes
    .filter((subtype) => subtype !== "Altele")
    .map((subtype) => ({ cat: catId as CategoryId, subtype, words: normalizeText(subtype) })))
  .sort((a, b) => b.words.length - a.words.length);

/**
 * Match OCR text against known document categories and subtypes — whole words
 * only, so "TVA" on an invoice isn't a TV subscription.
 */
export function matchDocumentType(text: string): { category: CategoryId | null; type: string | null } {
  const normalized = normalizeText(text);
  if (!normalized) return { category: null, type: null };

  for (const [phrase, cat, type] of DOCUMENT_PHRASES) {
    if (containsWords(normalized, phrase)) return { category: cat, type };
  }
  for (const { cat, subtype, words } of SUBTYPE_WORDS) {
    if (containsWords(normalized, words)) return { category: cat, type: subtype };
  }
  for (const [keyword, cat, type] of TYPE_KEYWORDS) {
    if (containsWords(normalized, keyword)) return { category: cat, type };
  }
  for (const [phrase, cat, type] of FALLBACK_PHRASES) {
    if (containsWords(normalized, phrase)) return { category: cat, type };
  }
  return { category: null, type: null };
}

// ─── Title Extraction ───────────────────────────────────

/**
 * Extract a reasonable title from OCR text.
 * Uses the document type and the first meaningful line.
 */
export function extractTitle(text: string, detectedType: string | null): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 3 && l.length < 80);

  if (lines.length === 0) return detectedType || null;

  // If we detected a type, use first line that contains it or a nearby line
  if (detectedType) {
    const typeUpper = detectedType.toUpperCase();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toUpperCase().includes(typeUpper)) {
        return lines[i];
      }
    }
  }

  // Return the first substantial line (likely the document header)
  for (const line of lines) {
    // Skip lines that are just numbers or very short
    if (/^\d+$/.test(line)) continue;
    if (line.length < 5) continue;
    return line;
  }

  return detectedType || null;
}
