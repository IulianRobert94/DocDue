/**
 * Root Layout — Apple HIG 2025
 * Hydrates stores, checks onboarding, manages navigation stack
 */

import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Platform, StatusBar as RNStatusBar, AppState } from "react-native";
import * as Sentry from "@sentry/react-native";
import * as NavigationBar from "expo-navigation-bar";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDocumentStore } from "../src/stores/useDocumentStore";
import { useTheme, useSettingsStore } from "../src/stores/useSettingsStore";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { Toast } from "../src/components/Toast";
import { BiometricGate } from "../src/components/BiometricGate";
import * as QuickActions from "expo-quick-actions";
import { FREE_DOCUMENT_LIMIT, STORAGE_KEY_ONBOARDED } from "../src/core/constants";
import {
  configureNotifications,
  rescheduleAllNotifications,
  getDocumentIdFromNotification,
  setupNotificationCategories,
  snoozeNotification,
  scheduleMorningDigest,
  scheduleWeeklySummary,
} from "../src/services/notifications";
import { initializeIAP, checkPremiumStatus, isIAPConfigured } from "../src/services/iap";
import { enrichDocument, getActiveDocuments } from "../src/core/enrichment";
import { getTodayString } from "../src/core/dateUtils";
import { updateWidgetData } from "../src/services/widgetService";
import { t } from "../src/core/i18n";
import { evaluateStreak } from "../src/core/streak";

SplashScreen.preventAutoHideAsync();

// Initialize Sentry for production error tracking
// Set EXPO_PUBLIC_SENTRY_DSN in EAS secrets or .env to enable
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (!__DEV__ && SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    attachScreenshot: true,
  });
}

// Force dark system bars on Android immediately (before component renders)
if (Platform.OS === "android") {
  RNStatusBar.setBackgroundColor("#0A0E17", false);
  RNStatusBar.setBarStyle("light-content", false);
  NavigationBar.setBackgroundColorAsync("#0A0E17").catch(() => {});
  NavigationBar.setButtonStyleAsync("light").catch(() => {});
}

// Configure notification behavior before component renders
configureNotifications();

// Track processed notification responses to avoid handling the same tap twice
// (cold-start bootstrap + live listener can both fire for the same response)
const _processedNotifIds = new Set<string>();

function RootLayout() {
  const theme = useTheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const responseListener = useRef<Notifications.EventSubscription>(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Retry setting Android navigation bar after mount (module-level call may be too early in Expo Go)
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync("#0A0E17").catch(() => {});
      NavigationBar.setButtonStyleAsync("light").catch(() => {});
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        await Promise.all([
          useDocumentStore.getState()._hydrate(),
          useSettingsStore.getState()._hydrate(),
          initializeIAP(),
        ]);
        const onboarded = await AsyncStorage.getItem(STORAGE_KEY_ONBOARDED);
        setShowOnboarding(!onboarded);

        // Reschedule notifications and update widget after hydration
        const settings = useSettingsStore.getState().settings;
        const documents = useDocumentStore.getState().documents;
        // Set up notification action buttons (Renewed / Tomorrow)
        setupNotificationCategories(settings.language)
          .catch((e) => { if (__DEV__) console.warn("DocDue: notification category error", e); });

        if (settings.notificationsEnabled) {
          rescheduleAllNotifications(documents, settings.reminderDays, settings.language)
            .catch((e) => { if (__DEV__) console.warn("DocDue: notification schedule error", e); });
          scheduleMorningDigest(documents, settings.language)
            .catch((e) => { if (__DEV__) console.warn("DocDue: morning digest error", e); });
          scheduleWeeklySummary(documents, settings.language)
            .catch((e) => { if (__DEV__) console.warn("DocDue: weekly summary error", e); });
        }

        // Sync premium status from store if configured
        if (isIAPConfigured()) {
          checkPremiumStatus().then((isPro) => {
            if (isPro !== settings.isPremium) {
              useSettingsStore.getState().updateSetting('isPremium', isPro);
            }
          }).catch(() => {});
        }
        updateWidgetData(documents);

        // Evaluate streak (only active / non-resolved docs)
        const enrichedDocs = getActiveDocuments(documents).map(enrichDocument);
        const streakResult = evaluateStreak(
          enrichedDocs,
          settings.streakDays ?? 0,
          settings.bestStreak ?? 0,
          settings.lastStreakCheck ?? null,
        );
        if (streakResult.isNew || streakResult.streakDays !== (settings.streakDays ?? 0)) {
          const today = getTodayString();
          useSettingsStore.getState().updateSetting('streakDays', streakResult.streakDays);
          useSettingsStore.getState().updateSetting('bestStreak', streakResult.bestStreak);
          useSettingsStore.getState().updateSetting('lastStreakCheck', today);
        }

        // Cold-start notification: handle tap that launched the app from killed state
        Notifications.getLastNotificationResponseAsync().then((response) => {
          if (response) handleNotificationResponse(response);
        }).catch(() => {});

        // Set up Quick Actions (3D Touch / long press on app icon)
        try {
          QuickActions.setItems([
            {
              id: "add_document",
              title: t(settings.language, 'quick_action_add'),
              icon: "add",
            },
            {
              id: "view_alerts",
              title: t(settings.language, 'quick_action_alerts'),
              icon: "alarm",
            },
            {
              id: "search",
              title: t(settings.language, 'quick_action_search'),
              icon: "search",
            },
          ]);
        } catch {
          // Quick Actions not available in Expo Go
        }
      } catch (e) {
        if (__DEV__) console.warn("DocDue: init error", e);
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    }
    // Safety net: hide splash after 8s even if init stalls
    const splashTimeout = setTimeout(() => {
      setReady(true);
      SplashScreen.hideAsync();
    }, 8000);
    init().finally(() => clearTimeout(splashTimeout));
  }, []);

  // Shared handler for notification taps (used by both live listener and cold-start bootstrap)
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    // Dedup: don't process the same notification response twice
    const responseId = response.notification.request.identifier;
    if (_processedNotifIds.has(responseId)) return;
    _processedNotifIds.add(responseId);

    const docId = getDocumentIdFromNotification(response);
    if (!docId) return;

    const actionId = response.actionIdentifier;
    const content = response.notification.request.content;

    if (actionId === "MARK_PAID") {
      const raw = useDocumentStore.getState().documents.find((d) => d.id === docId);
      if (raw) {
        useDocumentStore.getState().markAsPaid(enrichDocument(raw));
      }
    } else if (actionId === "SNOOZE_1DAY") {
      const notifId = response.notification.request.identifier;
      snoozeNotification(docId, notifId, content.title || "", content.body || "")
        .catch((e) => { if (__DEV__) console.warn("DocDue: snooze error", e); });
    } else {
      // Default tap — open document detail (verify doc still exists)
      const exists = useDocumentStore.getState().documents.some((d) => d.id === docId);
      if (exists) {
        setTimeout(() => router.push(`/document/${docId}`), 100);
      }
    }
  };

  // Live listener for notification taps while app is running
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => {
      responseListener.current?.remove();
    };
  }, [router]);

  // Quick Actions listener (3D Touch / long press on app icon)
  useEffect(() => {
    try {
      const sub = QuickActions.addListener((action) => {
        setTimeout(() => {
          if (action.id === "add_document") {
            const settings = useSettingsStore.getState().settings;
            const docCount = useDocumentStore.getState().documents.length;
            if (!settings.isPremium && docCount >= FREE_DOCUMENT_LIMIT) {
              router.push("/premium");
            } else {
              router.push("/form");
            }
          } else if (action.id === "view_alerts") {
            router.push("/(tabs)/alerts");
          } else if (action.id === "search") {
            router.push("/(tabs)/search");
          }
        }, 100);
      });
      return () => sub.remove();
    } catch {
      // Quick Actions not available in Expo Go
    }
  }, [router]);

  // Re-schedule notifications when app returns from background (debounced — skip if <60s)
  const lastRescheduleRef = useRef(0);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        const now = Date.now();
        if (now - lastRescheduleRef.current < 60000) return;
        lastRescheduleRef.current = now;
        const settings = useSettingsStore.getState().settings;
        const documents = useDocumentStore.getState().documents;
        if (settings.notificationsEnabled && documents.length > 0) {
          rescheduleAllNotifications(documents, settings.reminderDays, settings.language).catch(() => {});
          scheduleMorningDigest(documents, settings.language).catch(() => {});
          scheduleWeeklySummary(documents, settings.language).catch(() => {});
        }
      }
    });
    return () => subscription.remove();
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0A0E17" }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
        <BiometricGate>
          <SafeAreaProvider style={{ backgroundColor: theme.background }}>
            <StatusBar style="light" backgroundColor="#0A0E17" />
            <Stack
              screenOptions={{ headerShown: false }}
              initialRouteName={showOnboarding ? "onboarding" : "(tabs)"}
            >
              <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="category/[id]" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="document/[id]" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
              <Stack.Screen name="analytics" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
              <Stack.Screen name="premium" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
              <Stack.Screen name="form" options={{ animation: "slide_from_bottom", presentation: "modal", gestureEnabled: false }} />
              <Stack.Screen name="privacy" options={{ animation: "slide_from_right" }} />
            </Stack>
          </SafeAreaProvider>
        </BiometricGate>
        <Toast />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
