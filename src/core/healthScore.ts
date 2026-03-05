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
 * Algorithm:
 * - Start at 100
 * - Each expired doc: -20 (capped so score doesn't go below 0)
 * - Each warning doc: -5 × urgency factor (closer to expiration = bigger penalty)
 * - All documents OK bonus: +5 (only if no expired/warning)
 * - Clamped to [0, 100]
 *
 * Returns 100 when there are no documents (clean slate).
 */
export function calculateHealthScore(
  docs: EnrichedDocument[],
): number {
  if (docs.length === 0) return 100;

  let score = 100;
  let hasIssues = false;

  for (const doc of docs) {
    if (doc._status === "expired") {
      score -= 20;
      hasIssues = true;
    } else if (doc._status === "warning") {
      const warningDays = getWarningDaysForRecurrence(doc.rec);
      // urgencyFactor: 1.0 when due today, 0.0 when at warningDays boundary
      const urgencyFactor = warningDays > 0
        ? Math.max(0, 1 - doc._daysUntil / warningDays)
        : 1;
      score -= 5 * urgencyFactor;
      hasIssues = true;
    }
  }

  // Bonus for perfect health
  if (!hasIssues) {
    score = Math.min(100, score + 5);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
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
