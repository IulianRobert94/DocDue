/**
 * DocDue — Safe AsyncStorage reads
 *
 * Distinguishes "nothing saved" from "couldn't read". Treating a slow or
 * failing read as empty storage made the app believe it was a first launch
 * and write example data over the user's real data.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const TIMED_OUT = Symbol("timed-out");

export type StorageRead = { ok: true; value: string | null } | { ok: false };

/**
 * Read a key with a timeout, retrying once with a longer timeout.
 * `{ ok: true, value: null }` means the key is genuinely empty;
 * `{ ok: false }` means storage didn't answer or threw.
 */
export async function readStorageKey(key: string, timeoutsMs: number[] = [5000, 15000]): Promise<StorageRead> {
  for (const ms of timeoutsMs) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        AsyncStorage.getItem(key),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), ms);
        }),
      ]);
      if (value !== TIMED_OUT) return { ok: true, value };
    } catch {
      // fall through to the next attempt
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { ok: false };
}
