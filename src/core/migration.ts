/**
 * DocDue — Data Migration
 *
 * Migrează datele stocate de la versiuni mai vechi.
 * Apelată o singură dată la încărcarea aplicației.
 *
 * Când schimbăm structura documentelor (ex: adăugăm un câmp nou),
 * incrementăm DATA_VERSION și adăugăm un case aici care
 * transformă datele vechi în formatul nou.
 *
 * PORTAT 1:1 din v10 — nu se modifică logica.
 */

import type { RawDocument, RecurrenceValue } from "./constants";
import { CATEGORIES, VALID_RECURRENCE_VALUES } from "./constants";

interface StoredData {
  version?: number;
  documents?: RawDocument[];
}

/** Migrate legacy recurrence values removed in v12 simplification */
const RECURRENCE_MIGRATION: Record<string, RecurrenceValue> = {
  daily: "weekly",
};

const VALID_CATEGORY_IDS = new Set(Object.keys(CATEGORIES));
const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A stored entry is a usable document only if it has a string id, a YYYY-MM-DD
 * due date, and a category that is one of the 4 known ids. Mirrors the stricter
 * validation already done on backup-restore, so a corrupted/foreign record
 * (e.g. cat:"garbage") can't slip in and desync document lists vs category stats.
 */
function isValidStoredDoc(item: unknown): item is RawDocument {
  if (typeof item !== "object" || item === null) return false;
  const o = item as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.due === "string" && DUE_DATE_RE.test(o.due) &&
    typeof o.cat === "string" && VALID_CATEGORY_IDS.has(o.cat)
  );
}

function migrateRecurrence(doc: RawDocument): RawDocument {
  const mapped = RECURRENCE_MIGRATION[doc.rec];
  const next = mapped ? { ...doc, rec: mapped } : doc;
  // Normalize any unknown recurrence value to "none" (matches restore validation).
  if (!VALID_RECURRENCE_VALUES.has(next.rec)) {
    return { ...next, rec: "none" };
  }
  return next;
}

/**
 * Migrează datele stocate din versiuni mai vechi.
 *
 * Gestionează 3 cazuri:
 * 1. null/undefined → returnează null (= prima rulare, se vor încărca date demo)
 * 2. Array simplu → format v0 (fără câmp version), returnează direct
 * 3. Obiect cu version → returnează documents, cu migrări pe viitor
 */
export function migrateData(stored: StoredData | RawDocument[] | null): RawDocument[] | null {
  if (!stored) return null;

  // Format vechi: array simplu (v0, fără version field)
  if (Array.isArray(stored)) {
    // Empty array = user deleted all docs — preserve that state
    if (stored.length === 0) return stored;
    // Filter to only valid document objects (skip corrupted entries)
    const valid = stored.filter(isValidStoredDoc);
    return valid.map(migrateRecurrence);
  }

  // Must be an object at this point
  if (typeof stored !== "object") return null;

  // Viitor: aici adăugăm migrări
  // if (stored.version && stored.version < 2) { /* migrare v1 → v2 */ }

  if (Array.isArray(stored.documents)) {
    // Filter to only valid document objects
    const valid = stored.documents.filter(isValidStoredDoc);
    return valid.map(migrateRecurrence);
  }

  return null; // unrecognized format, treat as first launch
}
