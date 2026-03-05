/**
 * Spending Analytics — Financial Dashboard
 * Revolut-style summary cards with historical + forward-looking data
 */

import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
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
import { AnimatedPressable, FadeInView } from '../src/components/AnimatedUI';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const isPremium = useSettingsStore((s) => s.settings.isPremium);
  const currency = useSettingsStore((s) => s.settings.currency);
  const enriched = useEnrichedDocuments();

  useEffect(() => {
    if (!isPremium) {
      router.replace('/premium');
    }
  }, [isPremium]);

  if (!isPremium) return null;

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

    return { totalPaid, totalPayments, avgMonthly, monthCount, total30, count30, catBars, monthBars };
  }, [enriched, language]);

  const hasData = analytics.totalPaid > 0 || analytics.total30 > 0 || analytics.catBars.some((c) => c.amount > 0);

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}>
        {/* Modal handle + close */}
        <FadeInView delay={0} style={s.closeRow}>
          <View style={{ width: 60 }} />
          <View style={[s.grabber, { backgroundColor: theme.grabber }]} />
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
        <FadeInView delay={100} style={s.titleSection}>
          <View style={[s.titleIconCircle, { backgroundColor: 'rgba(0,122,255,0.12)' }]}>
            <Ionicons name="bar-chart" size={32} color="#007AFF" />
          </View>
          <Text style={[s.screenTitle, { color: theme.text }]}>{t(language, 'analytics_title')}</Text>
        </FadeInView>

        {!hasData ? (
          <FadeInView delay={200} style={s.emptyState}>
            <Ionicons name="wallet-outline" size={44} color={theme.textDim} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>{t(language, 'analytics_no_data')}</Text>
          </FadeInView>
        ) : (
          <>
            {/* Hero Summary Row */}
            <FadeInView delay={200}>
              <View style={[s.group, { backgroundColor: theme.card }]}>
                <View style={s.heroRow}>
                  <View style={s.heroCell}>
                    <Text style={[s.heroLabel, { color: theme.textSecondary }]}>
                      {t(language, 'analytics_total_paid')}
                    </Text>
                    <Text style={[s.heroValue, { color: theme.text }]}>
                      {formatMoney(analytics.totalPaid, currency, language)}
                    </Text>
                    <Text style={[s.heroSub, { color: theme.textMuted }]}>
                      {t(language, 'payment_count', { n: analytics.totalPayments })}
                    </Text>
                  </View>
                  <View style={[s.heroDivider, { backgroundColor: theme.divider }]} />
                  <View style={s.heroCell}>
                    <Text style={[s.heroLabel, { color: theme.textSecondary }]}>
                      {t(language, 'analytics_30days')}
                    </Text>
                    <Text style={[s.heroValue, { color: theme.text }]}>
                      {formatMoney(analytics.total30, currency, language)}
                    </Text>
                    <Text style={[s.heroSub, { color: theme.textMuted }]}>
                      {analytics.count30} {analytics.count30 !== 1 ? t(language, 'doc_plural') : t(language, 'doc_singular')}
                    </Text>
                  </View>
                </View>
              </View>
            </FadeInView>

            {/* Average Monthly Cost */}
            {analytics.monthCount > 0 && (
              <FadeInView delay={300}>
                <View style={[s.group, { backgroundColor: theme.card, marginTop: 12 }]}>
                  <View style={s.avgCard}>
                    <Text style={[s.avgLabel, { color: theme.textSecondary }]}>
                      {t(language, 'analytics_avg_monthly')}
                    </Text>
                    <Text style={[s.avgValue, { color: theme.text }]}>
                      {formatMoney(Math.round(analytics.avgMonthly), currency, language)}
                    </Text>
                    <Text style={[s.avgSub, { color: theme.textMuted }]}>
                      {t(language, 'analytics_based_on', { n: analytics.monthCount })}
                    </Text>
                  </View>
                </View>
              </FadeInView>
            )}

            {/* Category Breakdown */}
            <FadeInView delay={400}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
                {t(language, 'analytics_by_category').toUpperCase()}
              </Text>
              <View style={[s.group, { backgroundColor: theme.card }]}>
                {analytics.catBars.map((item, i) => (
                  <View key={item.id}>
                    <View style={s.catRow}>
                      <View style={s.catLeft}>
                        <View style={[s.catIconCircle, { backgroundColor: item.cat.color + '14' }]}>
                          <Ionicons name={item.cat.icon} size={16} color={item.cat.color} />
                        </View>
                        <Text style={[s.catName, { color: theme.text }]}>
                          {getCategoryLabel(item.cat, language)}
                        </Text>
                      </View>
                      <View style={s.catRight}>
                        <Text style={[s.catAmount, { color: theme.text }]}>
                          {item.amount > 0 ? formatMoney(item.amount, currency, language) : '—'}
                        </Text>
                        {item.pct > 0 && (
                          <Text style={[s.catPct, { color: theme.textMuted }]}>{item.pct}%</Text>
                        )}
                      </View>
                    </View>
                    {item.amount > 0 && (
                      <View style={[s.barTrack, { backgroundColor: theme.inputFillSubtle }]}>
                        <View
                          style={[s.barFill, { backgroundColor: item.cat.color, width: `${Math.max(item.ratio * 100, 2)}%` }]}
                        />
                      </View>
                    )}
                    {i < analytics.catBars.length - 1 && (
                      <View style={{ paddingLeft: 16 }}>
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </FadeInView>

            {/* Monthly Forecast */}
            {analytics.monthBars.length > 0 && (
              <FadeInView delay={500}>
                <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
                  {t(language, 'analytics_by_month').toUpperCase()}
                </Text>
                <View style={[s.group, { backgroundColor: theme.card, padding: 16 }]}>
                  <View style={s.monthGrid}>
                    {analytics.monthBars.map((month, i) => (
                      <View key={i} style={s.monthCol}>
                        <Text style={[s.monthAmount, { color: theme.text }]}>
                          {formatMoney(month.amount, currency, language)}
                        </Text>
                        <View style={[s.monthBarTrack, { backgroundColor: theme.inputFillSubtle }]}>
                          <View
                            style={[s.monthBarFill, { height: `${Math.max(month.ratio * 100, 4)}%`, backgroundColor: '#007AFF' }]}
                          />
                        </View>
                        <Text style={[s.monthLabel, { color: theme.textMuted }]}>{month.label}</Text>
                      </View>
                    ))}
                  </View>
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
  titleSection: { paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center' },
  titleIconCircle: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  screenTitle: { fontSize: 22, fontWeight: '700', letterSpacing: 0.35 },
  sectionHeader: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },

  // Hero summary row
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroCell: { flex: 1, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 12 },
  heroLabel: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 6 },
  heroSub: { fontSize: 13, marginTop: 4 },
  heroDivider: { width: StyleSheet.hairlineWidth, height: 48 },

  // Average monthly card
  avgCard: { alignItems: 'center', paddingVertical: 20 },
  avgLabel: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  avgValue: { fontSize: 32, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 },
  avgSub: { fontSize: 13, marginTop: 4 },

  // Category breakdown
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIconCircle: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: 15, fontWeight: '500' },
  catRight: { alignItems: 'flex-end' },
  catAmount: { fontSize: 15, fontWeight: '600' },
  catPct: { fontSize: 12, marginTop: 1 },
  barTrack: { height: 4, borderRadius: 2, marginHorizontal: 16, marginBottom: 12 },
  barFill: { height: 4, borderRadius: 2 },

  // Monthly forecast
  monthGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', gap: 8 },
  monthCol: { flex: 1, alignItems: 'center' },
  monthAmount: { fontSize: 11, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  monthBarTrack: { width: '100%', height: 100, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  monthBarFill: { width: '100%', borderRadius: 4 },
  monthLabel: { fontSize: 12, fontWeight: '500', marginTop: 6 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 15 },
});
