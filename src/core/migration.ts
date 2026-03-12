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

interface StoredData {
  version?: number;
  documents?: RawDocument[];
}

/** Migrate legacy recurrence values removed in v12 simplification */
const RECURRENCE_MIGRATION: Record<string, RecurrenceValue> = {
  daily: "weekly",
  quarterly: "monthly",
  biannual: "annual",
};

function migrateRecurrence(doc: RawDocument): RawDocument {
  const mapped = RECURRENCE_MIGRATION[doc.rec];
  return mapped ? { ...doc, rec: mapped } : doc;
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
    const valid = stored.filter(
      (item): item is RawDocument =>
        typeof item === "object" && item !== null && "id" in item && "due" in item && "cat" in item
    );
    return valid.map(migrateRecurrence);
  }

  // Must be an object at this point
  if (typeof stored !== "object") return null;

  // Viitor: aici adăugăm migrări
  // if (stored.version && stored.version < 2) { /* migrare v1 → v2 */ }

  if (Array.isArray(stored.documents)) {
    // Filter to only valid document objects
    const valid = stored.documents.filter(
      (item): item is RawDocument =>
        typeof item === "object" && item !== null && "id" in item && "due" in item && "cat" in item
    );
    return valid.map(migrateRecurrence);
  }

  return null; // unrecognized format, treat as first launch
}
