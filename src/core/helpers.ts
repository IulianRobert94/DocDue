/**
 * DocDue — Helper Utilities
 *
 * Funcții utilitare mici, folosite în mai multe locuri.
 */

import type { RawDocument, CategoryId } from "./constants";

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
