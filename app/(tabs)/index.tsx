/**
 * Home Screen — Apple HIG 2025 v12.1
 *
 * - Large Title with scroll-driven collapse into compact header
 * - Compact header: transparent initially, fades in on scroll
 * - Status pills with SF-style icons
 * - Category grid 2x2
 * - Compact urgent docs list
 * - "+" button moved to center tab (not in header)
 */

import React, { useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, useLanguage } from "../../src/stores/useSettingsStore";
import {
  useEnrichedDocuments,
  useGlobalStats,
  useCategoryStats,
} from "../../src/stores/useDocumentStore";
import { t } from "../../src/core/i18n";
import { CATEGORIES, QUICK_PREVIEW_LIMIT } from "../../src/core/constants";
import type { CategoryId, IconName } from "../../src/core/constants";
import { formatDaysRemaining, getCategoryLabel } from "../../src/core/formatters";
import { AnimatedPressable, AnimatedSection } from "../../src/components/AnimatedUI";
import { calculateHealthScore, getHealthScoreColor } from "../../src/core/healthScore";

const COLLAPSE_START = 30;
const COLLAPSE_END = 60;
const COMPACT_H = 44;

export default function HomeScreen() {
  const theme = useTheme();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const CARD_GAP = 12;
  const CARD_PADDING = 16;
  const CARD_WIDTH = (screenWidth - CARD_PADDING * 2 - CARD_GAP) / 2;

  const enriched = useEnrichedDocuments();
  const stats = useGlobalStats();
  const catStats = useCategoryStats();
  const urgentDocs = useMemo(
    () => enriched.filter((d) => d._status === "expired" || d._status === "warning"),
    [enriched]
  );

  // Health Score
  const healthScore = useMemo(
    () => calculateHealthScore(enriched),
    [enriched]
  );

  // ─── Scroll-driven collapse ────────────────────────
  const scrollY = useRef(new RNAnimated.Value(0)).current;

  const largeTitleOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_END],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const largeTitleTranslateY = scrollY.interpolate({
    inputRange: [0, COLLAPSE_END],
    outputRange: [0, -10],
    extrapolate: "clamp",
  });
  const compactOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_START, COLLAPSE_END],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* ─── Compact header (transparent → opaque on scroll) */}
      <View
        style={[styles.compactBar, { paddingTop: insets.top, height: insets.top + COMPACT_H }]}
        pointerEvents="box-none"
      >
        {/* Animated background */}
        <RNAnimated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.background, opacity: compactOpacity },
          ]}
          pointerEvents="none"
        />
        {/* Animated title */}
        <RNAnimated.View style={[styles.compactInner, { opacity: compactOpacity }]}>
          <Text style={[styles.compactTitle, { color: theme.text }]}>DocDue</Text>
        </RNAnimated.View>
        {/* Animated border */}
        <RNAnimated.View
          style={[styles.compactBorder, { backgroundColor: theme.divider, opacity: compactOpacity }]}
        />
      </View>

      {/* ─── Scrollable content ─────────────────────── */}
      <RNAnimated.ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* ─── Large Title ──────────────────────────── */}
        <RNAnimated.View
          style={[
            styles.header,
            { opacity: largeTitleOpacity, transform: [{ translateY: largeTitleTranslateY }] },
          ]}
        >
          <View>
            <Text style={[styles.largeTitle, { color: theme.text }]} accessibilityRole="header">
              DocDue
            </Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {enriched.length} {enriched.length !== 1 ? t(lang, "doc_plural") : t(lang, "doc_singular")}
            </Text>
          </View>
        </RNAnimated.View>

        {/* ─── Status Summary ───────────────────────── */}
        <AnimatedSection index={0} style={{ marginHorizontal: 16, marginBottom: 0 }}>
          <View style={[styles.statusCard, { backgroundColor: theme.card }]}>
            <View style={styles.statusRow}>
              <StatusBlock count={stats.expired} label={t(lang, "status_expired")} color="#FF3B30" icon="close-circle"
                onPress={() => router.push({ pathname: "/(tabs)/search", params: { status: "expired" } })} />
              <View style={[styles.statusDivider, { backgroundColor: theme.divider }]} />
              <StatusBlock count={stats.warning} label={t(lang, "status_warning")} color="#FF9500" icon="alert-circle"
                onPress={() => router.push({ pathname: "/(tabs)/search", params: { status: "warning" } })} />
              <View style={[styles.statusDivider, { backgroundColor: theme.divider }]} />
              <StatusBlock count={stats.ok} label={t(lang, "status_ok")} color="#34C759" icon="checkmark-circle"
                onPress={() => router.push({ pathname: "/(tabs)/search", params: { status: "ok" } })} />
            </View>
          </View>
        </AnimatedSection>

        {/* ─── Health Score (horizontal bar) ──────────── */}
        {enriched.length > 0 && (
          <AnimatedSection index={0} style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 16 }}>
            <AnimatedPressable
              onPress={() => router.push("/(tabs)/alerts")}
              scaleValue={0.98}
              accessibilityLabel={t(lang, "a11y_health_score", { score: healthScore })}
            >
              <View style={[styles.scoreCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.scoreNumber, { color: getHealthScoreColor(healthScore) }]}>
                  {healthScore}
                </Text>
                <View style={styles.scoreBarWrap}>
                  <View style={styles.scoreLabelRow}>
                    <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>
                      {t(lang, "health_score")}
                    </Text>
                    {(stats.expired > 0 || stats.warning > 0) && (
                      <Text style={[styles.scoreHint, { color: getHealthScoreColor(healthScore) }]}>
                        {stats.expired > 0
                          ? t(lang, "health_hint_expired", { n: stats.expired })
                          : t(lang, "health_hint_warning", { n: stats.warning })}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.scoreTrack, { backgroundColor: theme.border }]}>
                    <View style={[styles.scoreFill, { width: `${healthScore}%`, backgroundColor: getHealthScoreColor(healthScore) }]} />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={14} color={theme.textDim} />
              </View>
            </AnimatedPressable>
          </AnimatedSection>
        )}

        {/* ─── Categories Grid ───────────────────────── */}
        <AnimatedSection index={1}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            {t(lang, "form_category").toUpperCase()}
          </Text>
          <View style={[styles.catGrid, { paddingHorizontal: CARD_PADDING }]}>
            {(Object.keys(CATEGORIES) as CategoryId[]).map((catId) => {
              const cat = CATEGORIES[catId];
              const catStat = catStats[catId];
              const hasAlert = catStat.expired > 0 || catStat.warning > 0;
              return (
                <AnimatedPressable
                  key={catId}
                  style={[styles.catCard, { backgroundColor: theme.card, width: CARD_WIDTH }]}
                  onPress={() => router.push(`/category/${catId}`)}
                  accessibilityLabel={t(lang, "a11y_open_category", { name: getCategoryLabel(cat, lang) })}
                  scaleValue={0.96}
                >
                  <View style={styles.catCardTop}>
                    <View style={[styles.catIcon, { backgroundColor: cat.color + "14" }]}>
                      <Ionicons name={cat.icon} size={22} color={cat.color} />
                    </View>
                    {hasAlert && (
                      <View
                        style={[styles.alertDot, { backgroundColor: catStat.expired > 0 ? "#FF3B30" : "#FF9500" }]}
                      />
                    )}
                  </View>
                  <Text style={[styles.catName, { color: theme.text }]} numberOfLines={1}>
                    {getCategoryLabel(cat, lang)}
                  </Text>
                  <Text style={[styles.catMeta, { color: theme.textMuted }]}>
                    {catStat.total} {catStat.total !== 1 ? t(lang, "doc_plural") : t(lang, "doc_singular")}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </AnimatedSection>

        {/* ─── Urgent Documents (compact) ───────────── */}
        {urgentDocs.length > 0 && (
          <AnimatedSection index={2} style={{ marginTop: 8 }}>
            <View style={styles.urgentHeader}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                {t(lang, "home_needs_attention").toUpperCase()}
              </Text>
              <AnimatedPressable
                onPress={() => router.push("/(tabs)/alerts")}
                accessibilityLabel={t(lang, "a11y_see_all_alerts")}
                haptic={false}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.seeAll}>{t(lang, "home_see_all")}</Text>
              </AnimatedPressable>
            </View>
            <View style={[styles.group, { backgroundColor: theme.card }]}>
              {urgentDocs.slice(0, QUICK_PREVIEW_LIMIT).map((doc, i) => {
                const isLast = i === Math.min(urgentDocs.length, QUICK_PREVIEW_LIMIT) - 1;
                const statusColor = doc._status === "expired" ? "#FF3B30" : "#FF9500";
                return (
                  <View key={doc.id}>
                    <AnimatedPressable
                      onPress={() => router.push(`/document/${doc.id}`)}
                      style={styles.docRow}
                      accessibilityLabel={t(lang, "a11y_open_document", { title: doc.title })}
                      scaleValue={0.99}
                    >
                      <View style={[styles.docDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.docTitle, { color: theme.text }]} numberOfLines={1}>
                        {doc.title}
                      </Text>
                      <Text style={[styles.docDays, { color: statusColor }]}>
                        {formatDaysRemaining(doc._daysUntil, lang)}
                      </Text>
                      <Ionicons name="chevron-forward" size={13} color={theme.textDim} style={{ marginLeft: 4 }} />
                    </AnimatedPressable>
                    {!isLast && (
                      <View style={{ paddingLeft: 28 }}>
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </AnimatedSection>
        )}

        {/* ─── Empty State ──────────────────────────── */}
        {enriched.length === 0 && (
          <AnimatedSection index={1} style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="documents-outline" size={44} color={theme.textDim} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t(lang, "home_welcome")}
            </Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>
              {t(lang, "home_welcome_sub")}
            </Text>
            <AnimatedPressable
              onPress={() => router.push('/form')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 }}
              hapticStyle="medium"
              accessibilityLabel={t(lang, 'nav_add')}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>{t(lang, 'nav_add')}</Text>
            </AnimatedPressable>
          </AnimatedSection>
        )}
      </RNAnimated.ScrollView>
    </View>
  );
}

// ─── Sub-components ──────────────────────────────────

function StatusBlock({
  count, label, color, icon, onPress,
}: {
  count: number; label: string; color: string; icon: IconName; onPress?: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <AnimatedPressable
        style={styles.statusBlock}
        accessibilityLabel={`${count} ${label}`}
        onPress={onPress}
        haptic={false}
        scaleValue={0.95}
      >
        <Ionicons name={icon} size={16} color={color} style={{ marginBottom: 2 }} />
        <Text style={[styles.statusCount, { color }]}>{count}</Text>
        <Text style={[styles.statusLabel, { color }]}>{label}</Text>
      </AnimatedPressable>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },

  // Compact header (absolute, transparent initially)
  compactBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  compactInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  compactTitle: { fontSize: 17, fontWeight: "600" },
  compactBorder: {
    height: StyleSheet.hairlineWidth,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  largeTitle: { fontSize: 34, fontWeight: "700", letterSpacing: 0.37 },
  subtitle: { fontSize: 15, marginTop: 2 },

  // Status
  statusCard: { borderRadius: 14, overflow: "hidden" },
  statusRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  statusBlock: { flex: 1, alignItems: "center" },
  statusCount: { fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  statusLabel: { fontSize: 11, fontWeight: "600", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  statusDivider: { width: StyleSheet.hairlineWidth, height: 32 },

  // Section
  sectionLabel: {
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 20,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },

  // Group
  group: { marginHorizontal: 16, borderRadius: 12, overflow: "hidden" },

  // Category Grid
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  catCard: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14 },
  catCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  catName: { fontSize: 15, fontWeight: "600" },
  catMeta: { fontSize: 13, marginTop: 2 },

  // Urgent header
  urgentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 20,
  },
  seeAll: { color: "#007AFF", fontSize: 15 },

  // Compact doc row (single line per doc)
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  docDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  docTitle: { fontSize: 17, flex: 1 },
  docDays: { fontSize: 13, fontWeight: "600", marginLeft: 8 },

  // Health Score bar
  scoreCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 14, gap: 14 },
  scoreNumber: { fontSize: 28, fontWeight: "800", letterSpacing: -1, minWidth: 38, textAlign: "center" },
  scoreBarWrap: { flex: 1, gap: 5 },
  scoreLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scoreLabel: { fontSize: 13, fontWeight: "500" },
  scoreHint: { fontSize: 12, fontWeight: "600" },
  scoreTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  scoreFill: { height: 6, borderRadius: 3 },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: "rgba(0,122,255,0.12)",
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "600" },
  emptySub: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: "center" },
});
