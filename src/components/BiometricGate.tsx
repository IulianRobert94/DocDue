/**
 * BiometricGate — Full-screen lock overlay
 *
 * When biometric lock is enabled in settings:
 * - Shows lock screen on app open
 * - Re-locks when app returns from background (after 5s away)
 * - Uses Face ID / Touch ID / fingerprint via expo-local-authentication
 * - "Use Passcode" button: triggers auth → Face ID first, then iOS shows passcode option
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, AppState, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";

import { LinearGradient } from "expo-linear-gradient";
import { useSettingsStore, useTheme } from "../stores/useSettingsStore";
import { t } from "../core/i18n";
import { AnimatedPressable } from "./AnimatedUI";
import { fonts } from "../theme/typography";

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
  const authInProgress = useRef(false);
  const justUnlocked = useRef(false);

  const authenticate = useCallback(async () => {
    if (authInProgress.current) return;
    authInProgress.current = true;
    setFailed(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t(language, "biometric_unlock"),
        fallbackLabel: t(language, "biometric_use_passcode"),
        disableDeviceFallback: false,
      });
      if (result.success) {
        justUnlocked.current = true;
        setLocked(false);
        setFailed(false);
        setFailCount(0);
        setTimeout(() => { justUnlocked.current = false; }, 3000);
      } else {
        setFailed(true);
        setFailCount((c) => c + 1);
      }
    } catch {
      setFailed(true);
      setFailCount((c) => c + 1);
    } finally {
      authInProgress.current = false;
    }
  }, [language]);

  // Auto-authenticate on mount if locked
  useEffect(() => {
    if (locked) {
      const timer = setTimeout(() => authenticate(), 500);
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
        if (elapsed > 5000 && !authInProgress.current && !justUnlocked.current) {
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

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && (
        <View style={[styles.overlay, { backgroundColor: theme.background }]}>
          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: theme.primary + '26' }]}>
              <Ionicons name="lock-closed" size={44} color={theme.primary} />
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
                  style={[styles.retryBtn, { overflow: 'hidden' }]}
                  onPress={authenticate}
                  hapticStyle="medium"
                  accessibilityLabel={t(language, "biometric_retry")}
                >
                  <LinearGradient
                    colors={['#0E8BFF', '#0A79F1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 }}
                  >
                    <Ionicons
                      name={Platform.OS === "ios" ? "scan" : "finger-print"}
                      size={20}
                      color="#FFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.retryText}>{t(language, "biometric_retry")}</Text>
                  </LinearGradient>
                </AnimatedPressable>
                <Text style={[styles.passcodeHint, { color: theme.textDim }]}>
                  {Platform.OS === "ios"
                    ? t(language, "biometric_passcode_hint_ios")
                    : t(language, "biometric_passcode_hint_android")}
                </Text>
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
    fontFamily: fonts.bold,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    fontFamily: fonts.regular,
    marginBottom: 32,
  },
  failedText: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: "#FF3B30",
    marginBottom: 16,
  },
  retryBtn: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  passcodeHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 16,
  },
  retryText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "600",
    fontFamily: fonts.semiBold,
  },
});
