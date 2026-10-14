/**
 * DocDue — Biometric lock state + deferred actions
 *
 * The BiometricGate overlay only hides the UI — data mutations triggered from
 * outside the UI (e.g. the "Mark paid" notification action) would otherwise
 * run behind the lock screen. This module lets the gate report its lock state
 * and lets handlers defer mutations until after a successful unlock.
 *
 * Starts as "unknown" and is treated as locked until the gate reports —
 * so a cold-start notification action can never slip through before the
 * gate has mounted.
 */

let _locked: boolean | null = null; // null = gate hasn't reported yet
let _deferred: Array<() => void> = [];
const _listeners = new Set<(locked: boolean) => void>();

/**
 * Report the gate's lock state. Unlocking (false) runs all deferred actions.
 * Called by BiometricGate — including with `false` when biometrics are off.
 */
export function setAppLocked(locked: boolean): void {
  _locked = locked;
  for (const listener of _listeners) {
    try {
      listener(locked);
    } catch {
      // One failing listener must not block the rest
    }
  }
  if (!locked) flushDeferredActions();
}

/**
 * Get told when the app locks or unlocks — e.g. a full-screen photo viewer
 * (its own native window, above the lock overlay) closes itself on lock.
 * Returns an unsubscribe function.
 */
export function subscribeLockState(listener: (locked: boolean) => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/** True while the gate is locked or hasn't reported yet (cold start). */
export function isAppLocked(): boolean {
  return _locked !== false;
}

/** Queue a data-mutating action to run after the next successful unlock. */
export function deferUntilUnlock(action: () => void): void {
  _deferred.push(action);
}

function flushDeferredActions(): void {
  const actions = _deferred;
  _deferred = [];
  for (const action of actions) {
    try {
      action();
    } catch {
      // One failing action must not block the rest
    }
  }
}
