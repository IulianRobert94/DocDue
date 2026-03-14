/**
 * DocDue — App Store Review Prompt
 *
 * Triggers StoreKit review prompt after:
 * - At least 7 days since first open
 * - At least 3 documents added
 * - Not yet prompted
 *
 * Uses expo-store-review for the native StoreKit dialog.
 */

import * as StoreReview from "expo-store-review";
import { useSettingsStore } from "../stores/useSettingsStore";
import { getTodayString, calculateDaysUntil } from "../core/dateUtils";

const MIN_DAYS = 3;
const TRIGGER_COUNTS = [5, 10];

/**
 * Check conditions and show review prompt if appropriate.
 * Accepts documentCount to avoid importing useDocumentStore (prevents require cycle).
 * Safe to call multiple times — will only trigger once.
 *
 * Triggers at 5th or 10th document/markAsPaid, at least 3 days after first open.
 */
export async function maybeRequestReview(documentCount?: number): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  const docCount = documentCount ?? 0;

  // Already prompted — don't ask again
  if (settings.reviewPrompted) return;

  // Set firstOpenDate if not set
  if (!settings.firstOpenDate) {
    useSettingsStore.getState().updateSetting("firstOpenDate", getTodayString());
    return; // Wait until next launch
  }

  // Check document count hits one of the trigger points
  if (!TRIGGER_COUNTS.includes(docCount)) return;

  // Check minimum days since first open
  // calculateDaysUntil returns negative for past dates, so negate to get positive days elapsed
  const daysSinceOpen = -calculateDaysUntil(settings.firstOpenDate);
  if (daysSinceOpen < MIN_DAYS) return;

  // Check if StoreKit review is available
  const available = await StoreReview.isAvailableAsync();
  if (!available) return;

  // Request review and mark as prompted
  await StoreReview.requestReview();
  useSettingsStore.getState().updateSetting("reviewPrompted", true);
}
