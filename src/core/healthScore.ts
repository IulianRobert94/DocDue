/**
 * DocDue — Document Health Score
 *
 * Calculates a 0-100 score representing the overall health of documents.
 * Higher = more documents are valid and far from expiration.
 */

import type { EnrichedDocument } from "./constants";
import { getWarningDaysForRecurrence } from "./enrichment";

/**
 * Calculate health score from enriched documents.
 *
 * The share of the user's documents that are in order: an ok document counts
 * 1, one in its warning window between 1 (far away) and 0.5 (due today), an
 * expired one 0. Anything expired caps the score at 69, so it can't look
 * green while a document has lapsed — and one forgotten item among 40 doesn't
 * drop it to zero either.
 *
 * Returns 100 when there are no documents (clean slate).
 */
export function calculateHealthScore(
  docs: EnrichedDocument[],
): number {
  if (docs.length === 0) return 100;

  let points = 0;
  let anyExpired = false;

  for (const doc of docs) {
    if (doc._status === "expired") {
      anyExpired = true;
    } else if (doc._status === "warning") {
      const warningDays = getWarningDaysForRecurrence(doc.rec);
      // urgency: 0 at the start of the warning window, 1 on the due day
      const urgency = warningDays > 0
        ? Math.min(1, Math.max(0, 1 - doc._daysUntil / warningDays))
        : 1;
      points += 1 - 0.5 * urgency;
    } else {
      points += 1;
    }
  }

  const score = Math.round((100 * points) / docs.length);
  return anyExpired ? Math.min(score, 69) : score;
}

/**
 * Get a color for the health score.
 * Red (0-40), Orange (41-70), Green (71-100)
 */
export function getHealthScoreColor(score: number): string {
  if (score <= 40) return "#FF3B30";
  if (score <= 70) return "#FF9500";
  return "#34C759";
}

/**
 * Get a label key for the health score range.
 */
export function getHealthScoreLabel(score: number): string {
  if (score <= 40) return "health_critical";
  if (score <= 70) return "health_attention";
  return "health_good";
}
