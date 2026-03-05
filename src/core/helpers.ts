/**
 * DocDue — Helper Utilities
 *
 * Funcții utilitare mici, folosite în mai multe locuri.
 */

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
