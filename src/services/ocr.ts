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
import { parseLocalDate } from "../core/dateUtils";

// ─── Types ──────────────────────────────────────────────

export interface OcrResult {
  rawText: string;
  date: string | null;       // YYYY-MM-DD
  amount: number | null;
  category: CategoryId | null;
  type: string | null;        // Matched subtype
  title: string | null;       // Best guess for title
}

// ─── OCR Engine ─────────────────────────────────────────

let MlkitOcr: { detectFromUri: (uri: string) => Promise<Array<{ text: string }>> } | null = null;

/**
 * Check if the native OCR module is available.
 * Returns false in Expo Go (native module not linked).
 */
export function isOcrAvailable(): boolean {
  try {
    if (!MlkitOcr) {
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

/**
 * Extract the most likely due/expiry date from OCR text.
 * Handles Romanian date formats: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
 */
export function extractDate(text: string): string | null {
  // Pattern: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dateRegex = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
  const matches: { date: string; original: string }[] = [];

  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    const [, dayStr, monthStr, yearStr] = match;
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    // Validate ranges
    const currentYear = new Date().getFullYear();
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= currentYear - 5 && year <= currentYear + 30) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      matches.push({ date: `${year}-${mm}-${dd}`, original: match[0] });
    }
  }

  if (matches.length === 0) return null;

  // Prefer future dates, or the latest date found
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const futureDates = matches.filter((m) => parseLocalDate(m.date) >= now);

  if (futureDates.length > 0) {
    // Return the nearest future date
    futureDates.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
    return futureDates[0].date;
  }

  // No future dates — return the latest past date
  matches.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
  return matches[0].date;
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

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return parseRomanianNumber(match[1]);
    }
  }

  return null;
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

/**
 * Match OCR text against known document categories and subtypes.
 */
export function matchDocumentType(text: string): { category: CategoryId | null; type: string | null } {
  const upperText = text.toUpperCase();

  // Build a flat list of keywords → (category, subtype)
  const keywords: { keyword: string; cat: CategoryId; subtype: string }[] = [];

  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    for (const subtype of cat.subtypes) {
      keywords.push({
        keyword: subtype.toUpperCase(),
        cat: catId as CategoryId,
        subtype,
      });
    }
  }

  // Sort by keyword length descending (prefer longer matches)
  keywords.sort((a, b) => b.keyword.length - a.keyword.length);

  for (const { keyword, cat, subtype } of keywords) {
    if (upperText.includes(keyword)) {
      return { category: cat, type: subtype };
    }
  }

  // Try common abbreviations
  const ABBREVIATIONS: Record<string, { cat: CategoryId; type: string }> = {
    "POLITA RCA": { cat: "vehicule", type: "RCA" },
    "POLIȚA RCA": { cat: "vehicule", type: "RCA" },
    "ASIGURARE AUTO": { cat: "vehicule", type: "RCA" },
    "INSPECTIE TEHNICA": { cat: "vehicule", type: "ITP" },
    "INSPECȚIE TEHNICĂ": { cat: "vehicule", type: "ITP" },
    "FACTURA": { cat: "casa", type: "Factură" },
    "FACTURĂ": { cat: "casa", type: "Factură" },
    "CARTE DE IDENTITATE": { cat: "personal", type: "Carte de identitate" },
    "PASAPORT": { cat: "personal", type: "Pașaport" },
    "PAȘAPORT": { cat: "personal", type: "Pașaport" },
    "PERMIS DE CONDUCERE": { cat: "personal", type: "Permis conducere" },
    "LEASING": { cat: "financiar", type: "Rată leasing" },
    "CREDIT": { cat: "financiar", type: "Rată credit" },
    "IMPOZIT": { cat: "financiar", type: "Impozit ANAF" },
    "AMENDA": { cat: "financiar", type: "Amendă" },
    "AMENDĂ": { cat: "financiar", type: "Amendă" },
  };

  for (const [abbr, result] of Object.entries(ABBREVIATIONS)) {
    if (upperText.includes(abbr)) {
      return { category: result.cat, type: result.type };
    }
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
