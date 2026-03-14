/**
 * DailyInsight — Rotating daily tip/stat on Home screen
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useLanguage, useCurrency, useSettingsStore } from "../stores/useSettingsStore";
import { useEnrichedDocuments, useGlobalStats } from "../stores/useDocumentStore";
import { t } from "../core/i18n";
import { formatMoney } from "../core/formatters";
import { fonts } from "../theme/typography";

import type { IconName } from "../types";

export function DailyInsight() {
  const theme = useTheme();
  const lang = useLanguage();
  const currency = useCurrency();
  const enriched = useEnrichedDocuments();
  const stats = useGlobalStats(enriched);
  const streakDays = useSettingsStore((s) => s.settings.streakDays ?? 0);

  if (enriched.length === 0) return null;

  // Generate insights
  const insights: Array<{ icon: IconName; color: string; text: string }> = [];

  // Expiring this week
  const expiringThisWeek = enriched.filter((d) => d._daysUntil >= 0 && d._daysUntil <= 7).length;
  if (expiringThisWeek > 0) {
    insights.push({
      icon: "calendar",
      color: "#FF9500",
      text: lang === 'ro'
        ? `${expiringThisWeek} ${expiringThisWeek === 1 ? 'document expiră' : (expiringThisWeek < 20 ? 'documente expiră' : 'de documente expiră')} săptămâna asta`
        : `${expiringThisWeek} ${expiringThisWeek === 1 ? 'document expires' : 'documents expire'} this week`,
    });
  }

  // All clear
  if (stats.expired === 0 && stats.warning === 0 && enriched.length > 0) {
    insights.push({
      icon: "checkmark-circle",
      color: "#34C759",
      text: t(lang, 'insight_all_clear'),
    });
  }

  // Streak
  if (streakDays >= 3) {
    insights.push({
      icon: "flame",
      color: "#FF9500",
      text: lang === 'ro'
        ? `${streakDays} zile consecutive fără documente expirate!`
        : `${streakDays} consecutive days with no expired documents!`,
    });
  }

  // OK percentage
  const okPct = enriched.length > 0 ? Math.round((stats.ok / enriched.length) * 100) : 0;
  if (okPct > 0 && okPct < 100) {
    insights.push({
      icon: "shield-checkmark",
      color: "#0A79F1",
      text: lang === 'ro'
        ? `${okPct}% din documentele tale sunt la zi`
        : `${okPct}% of your documents are up to date`,
    });
  }

  if (insights.length === 0) return null;

  // Rotate daily based on day of month
  const dayIndex = new Date().getDate() % insights.length;
  const insight = insights[dayIndex];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }]}>
      <Ionicons name={insight.icon} size={16} color={insight.color} />
      <Text style={[styles.text, { color: theme.textSecondary }]} numberOfLines={2}>
        {insight.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    fontFamily: fonts.medium,
    lineHeight: 20,
  },
});
