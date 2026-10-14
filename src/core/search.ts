/**
 * DocDue — Search matching
 *
 * The way people type: without diacritics or in another spelling ("rovinieta"),
 * with everyday words ("buletin" for the ID card), plates with or without
 * dashes ("b99abc"), several words in any order ("dacia rca").
 */

import type { RawDocument } from "./constants";
import { translateSubtype } from "./i18n";
import { TYPE_KEYWORDS, normalizeText } from "./smartDefaults";

// Everyday words for each type ("buletin" → Carte de identitate)
const SYNONYMS_BY_TYPE = new Map<string, string[]>();
for (const [keyword, , type] of TYPE_KEYWORDS) {
  SYNONYMS_BY_TYPE.set(type, [...(SYNONYMS_BY_TYPE.get(type) ?? []), keyword]);
}

/** Everything a search can match for a document, normalized */
function searchableText(doc: Pick<RawDocument, "title" | "type" | "asset" | "notes">): string {
  const asset = doc.asset ?? "";
  return normalizeText([
    doc.title,
    doc.type,
    translateSubtype(doc.type, "ro"),
    translateSubtype(doc.type, "en"),
    asset,
    asset.replace(/[\s-]+/g, ""), // the plate without dashes: "B-99-ABC" → "B99ABC"
    doc.notes ?? "",
    ...(SYNONYMS_BY_TYPE.get(doc.type) ?? []),
  ].join(" "));
}

/** Every word of the query has to appear somewhere in the document */
export function matchesSearch(doc: Pick<RawDocument, "title" | "type" | "asset" | "notes">, query: string): boolean {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = searchableText(doc);
  return words.every((word) => text.includes(word));
}
