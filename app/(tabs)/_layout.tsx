/**
 * Tab Layout — iOS Native Tab Bar v12.1
 * Acasă | Alerte | [+] | Caută | Setări
 * Center tab opens form modal (like Instagram)
 */

import { View, StyleSheet } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, useLanguage, useSettingsStore } from "../../src/stores/useSettingsStore";
import { useGlobalStats, useDocumentStore } from "../../src/stores/useDocumentStore";
import { t } from "../../src/core/i18n";
import { FREE_DOCUMENT_LIMIT } from "../../src/core/constants";

export default function TabLayout() {
  const theme = useTheme();
  const lang = useLanguage();
  const router = useRouter();
  const stats = useGlobalStats();
  const docCount = useDocumentStore((s) => s.documents.length);
  const isPremium = useSettingsStore((s) => s.settings.isPremium);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.barBackground,
          borderTopColor: 'rgba(100,140,200,0.08)',
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: 6,
        },
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        listeners={{ tabPress: () => Haptics.selectionAsync().catch(() => {}) }}
        options={{
          title: t(lang, "nav_home"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        listeners={{ tabPress: () => Haptics.selectionAsync().catch(() => {}) }}
        options={{
          title: t(lang, "nav_alerts"),
          tabBarBadge: stats.urgentCount > 0 ? stats.urgentCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FF3B30', fontSize: 11 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "notifications" : "notifications-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            if (!isPremium && docCount >= FREE_DOCUMENT_LIMIT) {
              router.push('/premium');
            } else {
              router.push('/form');
            }
          },
        }}
        options={{
          title: "",
          tabBarAccessibilityLabel: t(lang, "a11y_add_document"),
          tabBarIcon: () => (
            <View style={addStyles.addBtn} accessibilityLabel={t(lang, "a11y_add_document")}>
              <Ionicons name="add" size={26} color="#FFFFFF" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        listeners={{ tabPress: () => Haptics.selectionAsync().catch(() => {}) }}
        options={{
          title: t(lang, "nav_search"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        listeners={{ tabPress: () => Haptics.selectionAsync().catch(() => {}) }}
        options={{
          title: t(lang, "nav_settings"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "cog" : "cog-outline"} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const addStyles = StyleSheet.create({
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
