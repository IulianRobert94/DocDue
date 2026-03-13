/**
 * DocDue — Settings Store (Zustand + AsyncStorage)
 *
 * Preferințele utilizatorului: temă, limbă, monedă, praguri alerte.
 * Persistența prin AsyncStorage.
 */

import { useMemo } from "react";
import { create } from "zustand";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS, STORAGE_KEY_SETTINGS_LEGACY } from "../core/constants";
import { createTheme } from "../theme/colors";
import { t } from "../core/i18n";
import type { AppSettings, CurrencyCode, LanguageCode } from "../core/constants";
import type { AppTheme } from "../theme/colors";

// ─── Types ──────────────────────────────────────────────

interface SettingsState {
  settings: AppSettings;
  _hydrated: boolean;

  // Actions
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  _hydrate: () => Promise<void>;
}

// ─── Persist helper ─────────────────────────────────────

function persistSettings(settings: AppSettings) {
  const lang = settings?.language || "en";
  AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)).catch(
    (e) => {
      if (__DEV__) console.warn("DocDue: settings persist error", e);
      Alert.alert(t(lang, "save_error_title"), t(lang, "save_error_msg"));
    }
  );
}

// ─── Store ──────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  _hydrated: false,

  _hydrate: async () => {
    if (get()._hydrated) return;
    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
    try {
      let raw = await withTimeout(AsyncStorage.getItem(STORAGE_KEY_SETTINGS), 5000);
      // Migrate from legacy key if needed
      if (!raw) {
        raw = await withTimeout(AsyncStorage.getItem(STORAGE_KEY_SETTINGS_LEGACY), 5000);
        if (raw) {
          await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, raw);
          await AsyncStorage.removeItem(STORAGE_KEY_SETTINGS_LEGACY);
        }
      }
      if (raw) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          if (__DEV__) console.warn("DocDue: corrupted settings JSON, resetting to defaults");
          parsed = null;
        }
        if (parsed && typeof parsed === "object") {
          // Only pick keys that exist in DEFAULT_SETTINGS to prevent unknown field injection
          const validKeys = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];
          const obj = parsed as Record<string, unknown>;
          const cleaned = {} as Record<string, unknown>;
          for (const key of validKeys) {
            if (key in obj) cleaned[key] = obj[key];
          }
          set({ settings: { ...DEFAULT_SETTINGS, ...cleaned } as AppSettings, _hydrated: true });
          return;
        }
      }
      set({ _hydrated: true });
    } catch (e) {
      if (__DEV__) console.warn("DocDue: settings hydrate error", e);
      set({ _hydrated: true });
    }
  },

  updateSetting: (key, value) =>
    set((state) => {
      const newSettings = { ...state.settings, [key]: value };
      persistSettings(newSettings);
      return { settings: newSettings };
    }),
}));

// ─── Derived Selectors ──────────────────────────────────

export function useTheme(): AppTheme {
  return useMemo(() => createTheme("dark"), []);
}

export function useLanguage(): LanguageCode {
  return useSettingsStore((s) => s.settings.language);
}

export function useCurrency(): CurrencyCode {
  return useSettingsStore((s) => s.settings.currency);
}
