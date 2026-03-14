/**
 * Tab Layout — iOS Native Tab Bar v12.1
 * Acasă | Alerte | [+] | Caută | Setări
 * Center tab opens form modal (like Instagram)
 */

import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme, useLanguage, useSettingsStore } from "../../src/stores/useSettingsStore";
import { useGlobalStats, useDocumentStore } from "../../src/stores/useDocumentStore";
import { t } from "../../src/core/i18n";
import { FREE_DOCUMENT_LIMIT } from "../../src/core/constants";
import { fonts } from "../../src/theme/typography";

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
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: 'rgba(100,140,200,0.06)',
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: fonts.medium,
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
          tabBarBadgeStyle: { backgroundColor: '#FF3B30', fontSize: 11, fontFamily: fonts.bold },
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
          tabBarIcon: () => {
            const atLimit = !isPremium && docCount >= FREE_DOCUMENT_LIMIT;
            return (
              <View>
                <LinearGradient
                  colors={atLimit ? ['#3A3A3C', '#2C2C2E'] : ['#0E8BFF', '#0A79F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[addStyles.addBtn, { shadowColor: atLimit ? '#000' : theme.primary }]}
                  accessibilityLabel={t(lang, "a11y_add_document")}
                >
                  <Ionicons name={atLimit ? "lock-closed" : "add"} size={atLimit ? 22 : 26} color="#FFFFFF" />
                </LinearGradient>
              </View>
            );
          },
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
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 4,
  },
});
