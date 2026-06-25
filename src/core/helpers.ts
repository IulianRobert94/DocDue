/**
 * DocDue — Helper Utilities
 *
 * Funcții utilitare mici, folosite în mai multe locuri.
 */

import type { RawDocument, CategoryId } from "./constants";
import { FREE_DOCUMENT_LIMIT } from "./constants";

/**
 * Generează un ID unic, rezistent la coliziuni.
 *
 * Folosește crypto.randomUUID() dacă e disponibil (modern),
 * altfel un fallback bazat pe timestamp + random.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback pentru medii mai vechi
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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
