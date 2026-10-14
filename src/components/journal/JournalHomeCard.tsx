/**
 * Home screen entry to the maintenance journal: shows what needs attention
 * (an item to replace, or the next estimated replacement).
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme, useLanguage } from "../../stores/useSettingsStore";
import { useItemStore } from "../../stores/useItemStore";
import { useToday } from "../../stores/useClockStore";
import { t, tp } from "../../core/i18n";
import { daysBetween } from "../../core/dateUtils";
import { formatEstimateWhen, getItemStats } from "../../core/lifespan";
import { AnimatedPressable } from "../AnimatedUI";
import { fonts } from "../../theme/typography";

export function JournalHomeCard() {
  const theme = useTheme();
  const language = useLanguage();
  const router = useRouter();
  const items = useItemStore((s) => s.items);
  const today = useToday();

  const summary = useMemo(() => {
    let toReplace = 0;
    let next: { name: string; date: string } | null = null;
    for (const item of items) {
      const stats = getItemStats(item, today);
      if (!stats.isInUse && item.installs.length > 0) toReplace++;
      if (stats.estimatedNext && (!next || stats.estimatedNext < next.date)) {
        next = { name: item.name, date: stats.estimatedNext };
      }
    }
    return { toReplace, next };
  }, [items, today]);

  let subtitle: string;
  let subtitleColor = theme.textSecondary;
  if (items.length === 0) {
    subtitle = t(language, "journal_home_empty");
  } else if (summary.toReplace > 0) {
    subtitle = tp(language, "journal_home_broken", summary.toReplace);
    subtitleColor = "#FF3B30";
  } else if (summary.next) {
    const daysAway = daysBetween(today, summary.next.date);
    subtitle = t(language, "journal_home_next", { name: summary.next.name, when: formatEstimateWhen(daysAway, language) });
    if (daysAway <= 30) subtitleColor = daysAway < 0 ? "#FF3B30" : "#FF9500";
  } else {
    subtitle = tp(language, "journal_home_count", items.length);
  }

  return (
    <AnimatedPressable
      style={[s.card, { backgroundColor: theme.card }]}
      onPress={() => router.push("/items")}
      hapticStyle="light"
      accessibilityLabel={`${t(language, "journal_title")}, ${subtitle}`}
    >
      <View style={[s.icon, { backgroundColor: theme.primary + "1F" }]}>
        <Ionicons name="construct" size={20} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color: theme.text }]}>{t(language, "journal_title")}</Text>
        <Text style={[s.subtitle, { color: subtitleColor }]} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textDim} />
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "600", fontFamily: fonts.semiBold },
  subtitle: { fontSize: 13, fontFamily: fonts.regular, marginTop: 2, lineHeight: 18 },
});
