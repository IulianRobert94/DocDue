/**
 * BiometricGate — Full-screen lock overlay
 *
 * When biometric lock is enabled in settings:
 * - Shows lock screen on app open
 * - Re-locks when app returns from background (after 5s away)
 * - Uses Face ID / Touch ID / fingerprint via expo-local-authentication
 *
 * NOTE: Face ID only works in production/dev builds.
 * In Expo Go, falls back to device passcode.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, AppState, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";

import { useSettingsStore, useTheme } from "../stores/useSettingsStore";
import { t } from "../core/i18n";
import { AnimatedPressable } from "./AnimatedUI";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATIONS = [30_000, 60_000, 300_000]; // 30s, 60s, 5min

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const biometricEnabled = useSettingsStore((s) => s.settings.biometricEnabled);
  const language = useSettingsStore((s) => s.settings.language);
  const theme = useTheme();
  const [locked, setLocked] = useState(biometricEnabled);
  const [failed, setFailed] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockoutRound = useRef(0);
  const backgroundTime = useRef<number>(0);
  const appState = useRef(AppState.currentState);

  const authenticate = useCallback(async () => {
    setFailed(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t(language, "biometric_unlock"),
        fallbackLabel: t(language, "biometric_use_passcode"),
        cancelLabel: t(language, "confirm_cancel"),
        // Allow device passcode as fallback on both platforms
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLocked(false);
        setFailed(false);
        setFailCount(0);
      } else {
        setFailed(true);
        setFailCount((c) => c + 1);
      }
    } catch {
      setFailed(true);
      setFailCount((c) => c + 1);
    }
  }, [language]);

  // Auto-authenticate on mount if locked
  useEffect(() => {
    if (locked) {
      // Small delay to let the UI render before showing the biometric prompt
      const timer = setTimeout(() => authenticate(), 300);
      return () => clearTimeout(timer);
    }
  }, [locked, authenticate]);

  // Re-lock on background → foreground (after 5 seconds away)
  useEffect(() => {
    if (!biometricEnabled) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current === "active" && nextState.match(/inactive|background/)) {
        backgroundTime.current = Date.now();
      }
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        const elapsed = Date.now() - backgroundTime.current;
        if (elapsed > 5000) {
          setLocked(true);
        }
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [biometricEnabled]);

  // Sync lock state when setting changes (including post-hydration)
  useEffect(() => {
    if (!biometricEnabled) {
      setLocked(false);
    } else {
      setLocked(true);
    }
  }, [biometricEnabled]);

  // Escalating lockout: 30s → 60s → 5min with visible countdown
  useEffect(() => {
    if (failCount >= MAX_ATTEMPTS) {
      const durationMs = LOCKOUT_DURATIONS[Math.min(lockoutRound.current, LOCKOUT_DURATIONS.length - 1)];
      lockoutRound.current++;
      setLockoutSeconds(Math.round(durationMs / 1000));

      // Countdown timer
      const interval = setInterval(() => {
        setLockoutSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setFailCount(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [failCount]);

  const formatLockoutTime = (seconds: number): string => {
    if (seconds >= 60) {
      const min = Math.ceil(seconds / 60);
      return `${min} min`;
    }
    return `${seconds}s`;
  };

  // Always render children to preserve navigation state.
  // Lock screen is an absolute overlay on top.
  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && (
        <View style={[styles.overlay, { backgroundColor: theme.background }]}>
          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: "rgba(0,122,255,0.15)" }]}>
              <Ionicons name="lock-closed" size={44} color="#007AFF" />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>
              DocDue
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t(language, "biometric_unlock")}
            </Text>
            {failed && failCount < MAX_ATTEMPTS && (
              <Text style={styles.failedText}>
                {t(language, "biometric_failed")}
              </Text>
            )}
            {failCount >= MAX_ATTEMPTS ? (
              <Text style={styles.failedText}>
                {t(language, "biometric_locked_out_dynamic", { time: formatLockoutTime(lockoutSeconds) })}
              </Text>
            ) : (
              <>
                <AnimatedPressable
                  style={styles.retryBtn}
                  onPress={authenticate}
                  hapticStyle="medium"
                  accessibilityLabel={t(language, "biometric_retry")}
                >
                  <Ionicons
                    name={Platform.OS === "ios" ? "scan" : "finger-print"}
                    size={20}
                    color="#FFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.retryText}>{t(language, "biometric_retry")}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.passcodeBtn}
                  onPress={async () => {
                    try {
                      const result = await LocalAuthentication.authenticateAsync({
                        promptMessage: t(language, "biometric_enter_passcode"),
                        fallbackLabel: "",
                        disableDeviceFallback: false,
                      });
                      if (result.success) {
                        setLocked(false);
                        setFailed(false);
                        setFailCount(0);
                      }
                    } catch {}
                  }}
                  haptic={false}
                  accessibilityLabel={t(language, "biometric_use_passcode")}
                >
                  <Text style={styles.passcodeText}>{t(language, "biometric_use_passcode")}</Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    marginBottom: 32,
  },
  failedText: {
    fontSize: 15,
    color: "#FF3B30",
    marginBottom: 16,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 22,
  },
  retryText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "600",
  },
  passcodeBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  passcodeText: {
    color: "#007AFF",
    fontSize: 15,
    fontWeight: "500",
  },
});
