/**
 * Streak System — Tracks consecutive days without expired documents
 */

import type { EnrichedDocument } from "./constants";
import { getTodayString } from "./dateUtils";

interface StreakResult {
  streakDays: number;
  bestStreak: number;
  isNew: boolean; // true if streak was just incremented
}

export function evaluateStreak(
  enriched: EnrichedDocument[],
  currentStreak: number,
  bestStreak: number,
  lastCheck: string | null,
): StreakResult {
  const today = getTodayString();

  // Already checked today
  if (lastCheck === today) {
    return { streakDays: currentStreak, bestStreak, isNew: false };
  }

  // Check if any documents are expired
  const hasExpired = enriched.some((d) => d._status === "expired");

  if (hasExpired) {
    // Streak broken
    return { streakDays: 0, bestStreak, isNew: false };
  }

  // No expired docs — increment streak
  // But only if we have documents (empty app doesn't count)
  if (enriched.length === 0) {
    return { streakDays: currentStreak, bestStreak, isNew: false };
  }

  const newStreak = currentStreak + 1;
  const newBest = Math.max(newStreak, bestStreak);

  return { streakDays: newStreak, bestStreak: newBest, isNew: true };
}
