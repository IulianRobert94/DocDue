/**
 * Spending Analytics — Clean Financial Dashboard
 * Minimal Revolut-style layout: no borders, generous whitespace
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLanguage, useSettingsStore } from '../src/stores/useSettingsStore';
import { useEnrichedDocuments } from '../src/stores/useDocumentStore';
import { t } from '../src/core/i18n';
import { CATEGORIES } from '../src/core/constants';
import type { CategoryId } from '../src/core/constants';
import { formatMoney, getCategoryLabel } from '../src/core/formatters';
import { parseLocalDate } from '../src/core/dateUtils';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable, FadeInView } from '../src/components/AnimatedUI';
import { PremiumOverlay } from '../src/components/PremiumOverlay';
import { SpendingTrend } from '../src/components/analytics/SpendingTrend';
import { fonts } from '../src/theme/typography';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const isPremium = useSettingsStore((s) => s.settings.isPremium);
  const currency = useSettingsStore((s) => s.settings.currency);
  const enriched = useEnrichedDocuments();

  const analytics = useMemo(() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86_400_000);
    const in90 = new Date(now.getTime() + 90 * 86_400_000);

    // ── Historical totals from paymentHistory ──
    let totalPaid = 0;
    let totalPayments = 0;
    const monthSet = new Set<string>();

    for (const doc of enriched) {
      if (doc.paymentHistory) {
        for (const p of doc.paymentHistory) {
          if (p.amt != null) {
            totalPaid += p.amt;
            totalPayments++;
            monthSet.add(p.date.substring(0, 7));
          }
        }
      }
    }

    const monthCount = monthSet.size;
    const avgMonthly = monthCount > 0 ? totalPaid / monthCount : 0;

    // ── Forward-looking ──
    let total30 = 0;
    let count30 = 0;
    const catTotals: Record<CategoryId, number> = {
      vehicule: 0, casa: 0, personal: 0, financiar: 0,
    };
    const monthMap = new Map<string, number>();

    for (const doc of enriched) {
      const dueDate = parseLocalDate(doc.due);

      if (doc._daysUntil >= 0 && doc.amt) {
        catTotals[doc.cat] += doc.amt;
      }

      if (dueDate >= now && dueDate <= in30 && doc.amt) {
        total30 += doc.amt;
        count30++;
      }

      if (dueDate >= now && dueDate <= in90 && doc.amt) {
        const y = dueDate.getFullYear();
        const m = dueDate.getMonth() + 1;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + doc.amt);
      }
    }

    // Category bars
    const totalCatSum = Object.values(catTotals).reduce((a, b) => a + b, 0);
    const maxCatTotal = Math.max(...Object.values(catTotals), 1);
    const catBars = (Object.keys(CATEGORIES) as CategoryId[])
      .map((catId) => ({
        id: catId,
        cat: CATEGORIES[catId],
        amount: catTotals[catId],
        ratio: catTotals[catId] / maxCatTotal,
        pct: totalCatSum > 0 ? Math.round((catTotals[catId] / totalCatSum) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Monthly forecast (max 3 months)
    const sortedMonths = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 3);
    const monthBarsData = sortedMonths.map(([key, amt]) => {
      const mNum = parseInt(key.split('-')[1], 10);
      return { label: t(language, `month_short_${mNum}`), amount: amt };
    });
    const maxMonth = Math.max(...monthBarsData.map((m) => m.amount), 1);
    const monthBars = monthBarsData.map((m) => ({
      ...m,
      ratio: m.amount / maxMonth,
    }));

    // Historical monthly totals for trend line (last 6 months)
    const historyMonthMap = new Map<string, number>();
    for (const doc of enriched) {
      if (doc.paymentHistory) {
        for (const p of doc.paymentHistory) {
          if (p.amt != null) {
            const key = p.date.substring(0, 7);
            historyMonthMap.set(key, (historyMonthMap.get(key) || 0) + p.amt);
          }
        }
      }
    }
    const trendMonths = [...historyMonthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, amt]) => {
        const mNum = parseInt(key.split('-')[1], 10);
        return { label: t(language, `month_short_${mNum}`), amount: amt };
      });

    return {
      totalPaid, totalPayments, avgMonthly, monthCount, total30, count30,
      catBars, monthBars, trendMonths,
    };
  }, [enriched, language]);

  const hasData = analytics.totalPaid > 0 || analytics.total30 > 0 || analytics.catBars.some((c) => c.amount > 0);

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {!isPremium && <PremiumOverlay />}
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}>
        {/* Modal handle + close */}
        <FadeInView delay={0} style={s.closeRow}>
          <View style={{ width: 60 }} />
          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0.08)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.grabber}
          />
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ width: 60, alignItems: 'flex-end' }}
            accessibilityLabel={t(language, 'a11y_close_modal')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            haptic={false}
          >
            <View style={[s.closeCircle, { backgroundColor: theme.inputFillStrong }]}>
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        {/* Title */}
        <FadeInView delay={100} style={s.titleWrap}>
          <Text style={[s.screenTitle, { color: theme.text }]}>{t(language, 'analytics_title')}</Text>
        </FadeInView>

        {!hasData ? (
          <FadeInView delay={200} style={s.emptyState}>
            <Ionicons name="wallet-outline" size={44} color={theme.textDim} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>{t(language, 'analytics_no_data')}</Text>
          </FadeInView>
        ) : (
          <>
            {/* Hero Stats — flat, no card */}
            <FadeInView delay={200} style={s.heroSection}>
              <View style={s.heroMain}>
                <Text style={[s.heroAmount, { color: theme.text }]}>
                  {formatMoney(analytics.total30, currency, language)}
                </Text>
                <Text style={[s.heroLabel, { color: theme.textSecondary }]}>
                  {t(language, 'analytics_30days')}
                </Text>
              </View>
              <View style={s.heroSecondary}>
                <View style={s.heroStat}>
                  <Text style={[s.heroStatValue, { color: theme.text }]}>
                    {formatMoney(analytics.totalPaid, currency, language)}
                  </Text>
                  <Text style={[s.heroStatLabel, { color: theme.textMuted }]}>
                    {t(language, 'analytics_total_paid')}
                  </Text>
                </View>
                {analytics.monthCount > 0 && (
                  <View style={s.heroStat}>
                    <Text style={[s.heroStatValue, { color: theme.text }]}>
                      {formatMoney(Math.round(analytics.avgMonthly), currency, language)}
                    </Text>
                    <Text style={[s.heroStatLabel, { color: theme.textMuted }]}>
                      {t(language, 'analytics_avg_monthly')}
                    </Text>
                  </View>
                )}
              </View>
            </FadeInView>

            {/* Spending Trend */}
            <SpendingTrend months={analytics.trendMonths} />

            {/* Category Breakdown — flat rows */}
            <FadeInView delay={400}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
                {t(language, 'analytics_by_category').toUpperCase()}
              </Text>
              <View style={s.catList}>
                {analytics.catBars.map((item) => (
                  <View key={item.id} style={s.catRow}>
                    <View style={s.catLeft}>
                      <View style={[s.catDot, { backgroundColor: item.cat.color }]} />
                      <Text style={[s.catName, { color: theme.text }]}>
                        {getCategoryLabel(item.cat, language)}
                      </Text>
                    </View>
                    <View style={s.catRight}>
                      {item.pct > 0 && (
                        <Text style={[s.catPct, { color: theme.textMuted }]}>{item.pct}%</Text>
                      )}
                      <Text style={[s.catAmount, { color: theme.text }]}>
                        {item.amount > 0 ? formatMoney(item.amount, currency, language) : '—'}
                      </Text>
                    </View>
                    {item.amount > 0 && (
                      <View style={s.barWrap}>
                        <View style={[s.barTrack, { backgroundColor: theme.inputFillSubtle }]}>
                          <View
                            style={[s.barFill, { backgroundColor: item.cat.color, width: `${Math.max(item.ratio * 100, 2)}%` }]}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </FadeInView>

            {/* Monthly Forecast — flat bars */}
            {analytics.monthBars.length > 0 && (
              <FadeInView delay={500}>
                <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
                  {t(language, 'analytics_by_month').toUpperCase()}
                </Text>
                <View style={s.monthGrid}>
                  {analytics.monthBars.map((month, i) => (
                    <View key={i} style={s.monthCol}>
                      <Text style={[s.monthAmount, { color: theme.text }]}>
                        {formatMoney(month.amount, currency, language)}
                      </Text>
                      <View style={[s.monthBarTrack, { backgroundColor: theme.inputFillSubtle }]}>
                        <View
                          style={[s.monthBarFill, { height: `${Math.max(month.ratio * 100, 4)}%`, backgroundColor: theme.primary }]}
                        />
                      </View>
                      <Text style={[s.monthLabel, { color: theme.textMuted }]}>{month.label}</Text>
                    </View>
                  ))}
                </View>
              </FadeInView>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  closeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 4 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  closeCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  screenTitle: { fontSize: 28, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 0.2 },
  sectionHeader: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semiBold, letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 12 },

  // Hero — flat, prominent
  heroSection: { paddingHorizontal: 20, paddingBottom: 8 },
  heroMain: { marginBottom: 20 },
  heroAmount: { fontSize: 34, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: -0.5 },
  heroLabel: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, marginTop: 4 },
  heroSecondary: { flexDirection: 'row', gap: 32 },
  heroStat: {},
  heroStatValue: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  heroStatLabel: { fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },

  // Category — flat rows
  catList: { paddingHorizontal: 20, gap: 16 },
  catRow: {},
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { fontSize: 15, fontWeight: '500', fontFamily: fonts.medium, flex: 1 },
  catRight: { flexDirection: 'row', alignItems: 'center', gap: 8, position: 'absolute', right: 0, top: 0 },
  catAmount: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  catPct: { fontSize: 13, fontFamily: fonts.regular },
  barWrap: { marginTop: 2 },
  barTrack: { height: 3, borderRadius: 1.5 },
  barFill: { height: 3, borderRadius: 1.5 },

  // Monthly forecast — flat
  monthGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingHorizontal: 20, gap: 12 },
  monthCol: { flex: 1, alignItems: 'center' },
  monthAmount: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semiBold, marginBottom: 8, textAlign: 'center' },
  monthBarTrack: { width: '100%', height: 80, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  monthBarFill: { width: '100%', borderRadius: 4 },
  monthLabel: { fontSize: 12, fontWeight: '500', fontFamily: fonts.medium, marginTop: 8 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 16 },
  emptyText: { fontSize: 15, fontFamily: fonts.regular },
});
