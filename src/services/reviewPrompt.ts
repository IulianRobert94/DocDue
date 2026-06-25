/**
 * DocDue — App Store Review Prompt
 *
 * Triggers StoreKit review prompt after:
 * - At least 3 days since first open
 * - At least 5 documents present
 * - Not yet prompted (one-shot)
 *
 * Uses expo-store-review for the native StoreKit dialog.
 */

import * as StoreReview from "expo-store-review";
import { useSettingsStore } from "../stores/useSettingsStore";
import { getTodayString, calculateDaysUntil } from "../core/dateUtils";

const MIN_DAYS = 3;
const MIN_DOCUMENTS = 5;

/**
 * Check conditions and show review prompt if appropriate.
 * Accepts documentCount to avoid importing useDocumentStore (prevents require cycle).
 * Safe to call multiple times — will only trigger once.
 *
 * Triggers once the user has >= 5 documents, at least 3 days after first open.
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

  // Threshold (>=) so a bulk import that skips the exact value still qualifies;
  // the reviewPrompted latch above guarantees this only ever fires once.
  if (docCount < MIN_DOCUMENTS) return;

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
