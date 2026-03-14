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

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated as RNAnimated,
  useWindowDimensions,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme, useLanguage, useSettingsStore } from "../../src/stores/useSettingsStore";
import {
  useEnrichedDocuments,
  useGlobalStats,
  useCategoryStats,
  useDocumentStore,
} from "../../src/stores/useDocumentStore";
import { t } from "../../src/core/i18n";
import { CATEGORIES, QUICK_PREVIEW_LIMIT } from "../../src/core/constants";
import type { CategoryId } from "../../src/core/constants";
import { formatDaysRemaining, getCategoryLabel } from "../../src/core/formatters";
import { AnimatedPressable, AnimatedSection, AnimatedCounter, AnimatedBar } from "../../src/components/AnimatedUI";
import { CircularProgress } from "../../src/components/CircularProgress";
import { Celebration } from "../../src/components/Celebration";
import { calculateHealthScore, getHealthScoreColor } from "../../src/core/healthScore";
import { fonts } from "../../src/theme/typography";

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
  const stats = useGlobalStats(enriched);
  const catStats = useCategoryStats(enriched);
  const streakDays = useSettingsStore((s) => s.settings.streakDays ?? 0);
  const urgentDocs = useMemo(
    () => enriched.filter((d) => d._status === "expired" || d._status === "warning"),
    [enriched]
  );

  // Health Score
  const healthScore = useMemo(
    () => calculateHealthScore(enriched),
    [enriched]
  );


  // Next expiring document (for health score card)
  const nextExpiring = useMemo(() => {
    if (enriched.length === 0) return null;
    const sorted = [...enriched].sort((a, b) => a._daysUntil - b._daysUntil);
    return sorted[0] || null;
  }, [enriched]);

  // Celebration when health score hits 100
  const [showCelebration, setShowCelebration] = useState(false);
  useEffect(() => {
    if (healthScore === 100 && enriched.length > 0) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 1000);
    }
  }, [healthScore]);

  // Floating animation for empty state icon
  const floatAnim = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (enriched.length > 0) return;
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(floatAnim, { toValue: -8, duration: 1500, useNativeDriver: true }),
        RNAnimated.timing(floatAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [enriched.length]);

  // Demo banner — show only when demo data is present and not dismissed
  const clearAll = useDocumentStore((s) => s.clearAll);
  const [showDemoBanner, setShowDemoBanner] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem("dt_demo_dismissed").then((val) => {
      if (!val && enriched.length > 0) {
        // Check if first doc looks like demo (has demo-style titles)
        const hasDemo = enriched.some((d) => d.id.startsWith("demo_"));
        setShowDemoBanner(hasDemo);
      }
    }).catch(() => {});
  }, [enriched.length]);

  const handleDismissDemo = useCallback(() => {
    Alert.alert(
      t(lang, "demo_banner_dismiss"),
      t(lang, "demo_banner_text"),
      [
        { text: t(lang, "confirm_cancel"), style: "cancel" },
        {
          text: t(lang, "demo_banner_dismiss"),
          style: "destructive",
          onPress: () => {
            clearAll();
            AsyncStorage.setItem("dt_demo_dismissed", "1").catch(() => {});
            setShowDemoBanner(false);
          },
        },
      ]
    );
  }, [lang, clearAll]);

  // ─── Pull-to-refresh ────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Re-hydrate stores
    Promise.all([
      useDocumentStore.getState()._hydrate(),
    ]).finally(() => setTimeout(() => setRefreshing(false), 600));
  }, []);

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
        {/* Animated blur background */}
        <RNAnimated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: compactOpacity, overflow: 'hidden' },
          ]}
          pointerEvents="none"
        >
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </RNAnimated.View>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            progressBackgroundColor={theme.card}
          />
        }
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

        {/* ─── Demo Banner ───────────────────────────── */}
        {showDemoBanner && (
          <AnimatedSection index={0} style={{ marginHorizontal: 16, marginBottom: 12 }}>
            <View style={[styles.demoBanner, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '33' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.demoBannerText, { color: theme.textSecondary }]}>
                  {t(lang, "demo_banner_text")}
                </Text>
              </View>
              <AnimatedPressable onPress={handleDismissDemo} hapticStyle="selection" style={styles.demoBannerBtn}
                accessibilityLabel={t(lang, "demo_banner_dismiss")}>
                <Ionicons name="close-circle" size={20} color={theme.textMuted} />
              </AnimatedPressable>
            </View>
          </AnimatedSection>
        )}

        {/* ─── Status Summary ───────────────────────── */}
        <AnimatedSection index={0} style={{ marginHorizontal: 16, marginBottom: 0 }}>
          <View style={[styles.statusCard, { backgroundColor: theme.card }]}>
            <LinearGradient
              colors={['#FF3B30', '#FF9500', '#34C759']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: 2, borderRadius: 1 }}
            />
            <View style={styles.statusRow}>
              <StatusBlock count={stats.expired} label={t(lang, "status_expired")} color="#FF3B30"
                onPress={() => router.push({ pathname: "/(tabs)/search", params: { status: "expired" } })} />
              <View style={[styles.statusDivider, { backgroundColor: theme.divider }]} />
              <StatusBlock count={stats.warning} label={t(lang, "status_warning")} color="#FF9500"
                onPress={() => router.push({ pathname: "/(tabs)/search", params: { status: "warning" } })} />
              <View style={[styles.statusDivider, { backgroundColor: theme.divider }]} />
              <StatusBlock count={stats.ok} label={t(lang, "status_ok")} color="#34C759"
                onPress={() => router.push({ pathname: "/(tabs)/search", params: { status: "ok" } })} />
            </View>
          </View>
        </AnimatedSection>

        {/* ─── Health Score + Next Expiring ─────────── */}
        {enriched.length > 0 && (
          <AnimatedSection index={0} style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 16 }}>
            <View style={[styles.scoreCard, { backgroundColor: theme.card }]}>
              <Pressable
                onPress={() => router.push("/(tabs)/alerts")}
                style={styles.scoreLeft}
                accessibilityLabel={t(lang, "a11y_health_score", { score: healthScore })}
              >
                <CircularProgress
                  size={48}
                  strokeWidth={4}
                  progress={healthScore}
                  color={getHealthScoreColor(healthScore)}
                  trackColor={theme.border}
                >
                  <AnimatedCounter value={healthScore} style={[styles.scoreNumber, { color: getHealthScoreColor(healthScore) }]} />
                </CircularProgress>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>
                    {t(lang, "health_score")}
                  </Text>
                  {(stats.expired > 0 || stats.warning > 0) ? (
                    <Text style={[styles.scoreHint, { color: getHealthScoreColor(healthScore) }]}>
                      {stats.expired > 0
                        ? t(lang, "health_hint_expired", { n: stats.expired })
                        : t(lang, "health_hint_warning", { n: stats.warning })}
                    </Text>
                  ) : (
                    <Text style={[styles.scoreHint, { color: '#34C759' }]}>
                      {t(lang, "health_good")}
                    </Text>
                  )}
                </View>
              </Pressable>
              {nextExpiring && (
                <Pressable
                  onPress={() => router.push(`/document/${nextExpiring.id}`)}
                  style={styles.scoreRight}
                  accessibilityLabel={`${nextExpiring.title} — ${formatDaysRemaining(nextExpiring._daysUntil, lang)}`}
                >
                  <Text style={[styles.scoreNextTitle, { color: theme.text }]} numberOfLines={1}>
                    {nextExpiring.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Text style={[styles.scoreNextDays, { color: nextExpiring._status === 'expired' ? '#FF3B30' : nextExpiring._status === 'warning' ? '#FF9500' : theme.textMuted }]}>
                      {formatDaysRemaining(nextExpiring._daysUntil, lang)}
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color={theme.textDim} />
                  </View>
                </Pressable>
              )}
            </View>
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
                  style={[styles.catCard, {
                    backgroundColor: theme.card,
                    width: CARD_WIDTH,
                  }]}
                  onPress={() => router.push(`/category/${catId}`)}
                  accessibilityLabel={t(lang, "a11y_open_category", { name: getCategoryLabel(cat, lang) })}
                  scaleValue={0.96}
                >
                  <View style={styles.catCardTop}>
                    <View style={[styles.catIcon, { backgroundColor: cat.color + "18" }]}>
                      <Ionicons name={cat.icon} size={24} color={cat.color} />
                    </View>
                    {hasAlert && (
                      <View
                        style={[styles.alertDot, { backgroundColor: catStat.expired > 0 ? "#FF3B30" : "#FF9500" }]}
                        accessibilityLabel={[
                          catStat.expired > 0 ? `${catStat.expired} ${t(lang, "status_expired")}` : '',
                          catStat.warning > 0 ? `${catStat.warning} ${t(lang, "status_warning")}` : '',
                        ].filter(Boolean).join(', ')}
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
                <Text style={[styles.seeAll, { color: theme.primary }]}>{t(lang, "home_see_all")}</Text>
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
            <RNAnimated.View style={[styles.emptyIconWrap, { backgroundColor: theme.primary + '1F', transform: [{ translateY: floatAnim }] }]}>
              <Ionicons name="documents-outline" size={44} color={theme.textDim} />
            </RNAnimated.View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t(lang, "home_welcome")}
            </Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>
              {t(lang, "home_welcome_sub")}
            </Text>
            <AnimatedPressable
              onPress={() => router.push('/form')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 }}
              hapticStyle="medium"
              accessibilityLabel={t(lang, 'nav_add')}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 15, fontFamily: fonts.semiBold }}>{t(lang, 'nav_add')}</Text>
            </AnimatedPressable>
          </AnimatedSection>
        )}
      </RNAnimated.ScrollView>
      {showCelebration && <Celebration trigger={showCelebration} />}
    </View>
  );
}

// ─── Sub-components ──────────────────────────────────

function StatusBlock({
  count, label, color, onPress,
}: {
  count: number; label: string; color: string; onPress?: () => void;
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
        <AnimatedCounter value={count} style={[styles.statusCount, { color }]} />
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
  compactTitle: { fontSize: 17, fontFamily: fonts.semiBold },
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
  largeTitle: { fontSize: 34, letterSpacing: 0.2, fontFamily: fonts.bold },
  subtitle: { fontSize: 15, marginTop: 2, fontFamily: fonts.regular },

  // Status
  // Status card
  statusCard: { borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  statusRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  statusBlock: { flex: 1, alignItems: "center" },
  statusCount: { fontSize: 26, letterSpacing: -0.5, fontFamily: fonts.bold },
  statusLabel: { fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: fonts.bold },
  statusDivider: { width: StyleSheet.hairlineWidth, height: 32 },

  // Section
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    paddingHorizontal: 20,
    paddingBottom: 8,
    letterSpacing: 0.8,
  },

  // Group
  group: { marginHorizontal: 16, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },

  // Category Grid
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catCard: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  catCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  catIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  catName: { fontSize: 15, fontFamily: fonts.semiBold },
  catMeta: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },

  // Urgent header
  urgentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: 20,
  },
  seeAll: { fontSize: 15, fontFamily: fonts.medium },

  // Compact doc row (single line per doc)
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  docDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  docTitle: { fontSize: 17, flex: 1, fontFamily: fonts.regular },
  docDays: { fontSize: 13, marginLeft: 8, fontFamily: fonts.semiBold },

  // Health Score bar
  scoreCard: { flexDirection: "row", alignItems: "stretch", borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  scoreLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10, paddingVertical: 12, paddingLeft: 12, paddingRight: 8 },
  scoreNumber: { fontSize: 16, letterSpacing: -0.3, textAlign: "center", fontFamily: fonts.extraBold },
  scoreBarWrap: { flex: 1, gap: 2 },
  scoreLabel: { fontSize: 13, fontFamily: fonts.medium },
  scoreHint: { fontSize: 12, fontFamily: fonts.semiBold },
  scoreRight: { alignItems: "flex-end", justifyContent: "center", paddingVertical: 12, paddingRight: 12, paddingLeft: 12, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(255,255,255,0.06)", minWidth: 100, maxWidth: 160 },
  scoreNextTitle: { fontSize: 13, fontFamily: fonts.medium, textAlign: "right" },
  scoreNextDays: { fontSize: 12, fontFamily: fonts.semiBold, marginTop: 2 },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontFamily: fonts.semiBold },
  emptySub: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: "center", fontFamily: fonts.regular },

  // Streak badge
  streakBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14 },
  streakText: { fontSize: 18, fontFamily: fonts.bold },
  streakLabel: { fontSize: 13, fontFamily: fonts.regular },

  // Demo banner
  demoBanner: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1 },
  demoBannerText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  demoBannerBtn: { padding: 8, marginLeft: 8 },
});
