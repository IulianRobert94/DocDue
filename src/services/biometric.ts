/**
 * DocDue — Biometric prompt options
 */

import { Platform } from "react-native";

/**
 * Android 11+ (API 30) accepts only Class 3 biometrics (fingerprint, 3D face)
 * — camera-only face unlock is too easy to fool for an app that guards ID
 * scans; the device PIN still works as a fallback. Android 9–10 can't
 * combine Class 3 biometrics with the PIN fallback (the prompt would fail),
 * so they keep the default. Ignored on iOS.
 */
export function biometricSecurityLevel(): "strong" | "weak" {
  return Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version >= 30
    ? "strong"
    : "weak";
}
