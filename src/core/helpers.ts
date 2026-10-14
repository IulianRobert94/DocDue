/**
 * DocDue — Helper Utilities
 *
 * Funcții utilitare mici, folosite în mai multe locuri.
 */

import type { RawDocument, CategoryId } from "./constants";
import { DEMO_ID_PREFIX, FREE_DOCUMENT_LIMIT } from "./constants";
import { DEMO_TITLES } from "./demo";

export { generateId } from "./id";

/**
 * Find a duplicate document by matching category, type, and title.
 * Returns the first matching document or null.
 */
export function findDuplicate(
  documents: RawDocument[],
  cat: CategoryId,
  type: string,
  title: string,
  editId?: string
): RawDocument | null {
  if (!title.trim() || !type) return null;
  const normalTitle = title.trim().toLowerCase();
  return documents.find((d) => {
    if (editId && d.id === editId) return false;
    return d.cat === cat && d.type === type && d.title.toLowerCase() === normalTitle;
  }) || null;
}

/**
 * Free-tier gate: true when a non-PRO user has reached the document cap.
 *
 * Single source of truth so every "add" entry point (center tab button,
 * form save, Duplicate, category-add) enforces the limit identically. The
 * limit must be checked at the data/save layer — gating only the tab button
 * lets Duplicate/category-add routes bypass it.
 */
export function isAtFreeLimit(docCount: number, isPremium: boolean): boolean {
  return !isPremium && docCount >= FREE_DOCUMENT_LIMIT;
}

/**
 * True for the example documents seeded on first launch — but not once the
 * user made one their own (edited or paid it, or renamed it before this was
 * tracked): those notify and count like any other document.
 */
export function isDemoDocument(doc: Pick<RawDocument, "id" | "title" | "userEdited">): boolean {
  return doc.id.startsWith(DEMO_ID_PREFIX) && !doc.userEdited && DEMO_TITLES.has(doc.title);
}

/**
 * How many documents count toward the free-tier cap: the user's own active
 * documents. Example documents and resolved (archived) ones are free —
 * otherwise a new user hits the paywall after 2 real documents.
 */
export function countTowardFreeLimit(docs: RawDocument[]): number {
  return docs.filter((d) => !d.resolved && !isDemoDocument(d)).length;
}
