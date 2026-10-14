/**
 * Maintenance journal — list of tracked items, grouped by the object they
 * belong to (car, home…). Items needing a replacement come first.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLanguage } from '../../src/stores/useSettingsStore';
import { useItemStore } from '../../src/stores/useItemStore';
import { useToday } from '../../src/stores/useClockStore';
import { t } from '../../src/core/i18n';
import { CATEGORIES } from '../../src/core/constants';
import type { LanguageCode, TrackedItem } from '../../src/core/constants';
import { formatDate } from '../../src/core/formatters';
import { daysBetween } from '../../src/core/dateUtils';
import {
  formatDuration, formatEstimateWhen, getItemStats, groupItemsByAsset, sortItems,
} from '../../src/core/lifespan';
import type { AppTheme } from '../../src/theme/colors';
import { AnimatedPressable, FadeInView } from '../../src/components/AnimatedUI';
import { Card, Divider, NavBar, NavIconButton, PrimaryButton, SectionHeader } from '../../src/components/journal/JournalUI';
import { fonts } from '../../src/theme/typography';

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const items = useItemStore((s) => s.items);
  const today = useToday();

  const groups = useMemo(
    () => groupItemsByAsset(sortItems(items, today, language)),
    [items, today, language]
  );

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <NavBar
        title={t(language, 'journal_title')}
        theme={theme}
        topInset={insets.top}
        onBack={() => router.back()}
        backLabel={t(language, 'nav_back')}
        right={items.length > 0 ? (
          <NavIconButton icon="add" label={t(language, 'journal_add')} onPress={() => router.push('/item-form')} theme={theme} />
        ) : undefined}
      />

      {items.length === 0 ? (
        <FadeInView delay={50} style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: theme.primary + '1F' }]}>
            <Ionicons name="construct" size={40} color={theme.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: theme.text }]}>{t(language, 'journal_empty_title')}</Text>
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>{t(language, 'journal_empty_text')}</Text>
          <Text style={[s.emptyExamples, { color: theme.textMuted }]}>{t(language, 'journal_empty_examples')}</Text>
          <View style={{ alignSelf: 'stretch', marginTop: 28 }}>
            <PrimaryButton
              label={t(language, 'journal_add_first')}
              icon="add"
              onPress={() => router.push('/item-form')}
              theme={theme}
            />
          </View>
        </FadeInView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {groups.map((group, gi) => (
            <FadeInView key={group.asset ?? '__none'} delay={50 + gi * 40}>
              <SectionHeader title={group.asset ?? t(language, 'journal_group_other')} theme={theme} />
              <Card theme={theme}>
                {group.items.map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && <Divider theme={theme} />}
                    <ItemRow
                      item={item}
                      today={today}
                      theme={theme}
                      language={language}
                      onPress={() => router.push({ pathname: '/items/[id]', params: { id: item.id } })}
                    />
                  </React.Fragment>
                ))}
              </Card>
            </FadeInView>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ItemRow({ item, today, theme, language, onPress }: {
  item: TrackedItem;
  today: string;
  theme: AppTheme;
  language: LanguageCode;
  onPress: () => void;
}) {
  const stats = getItemStats(item, today);
  const cat = CATEGORIES[item.cat];

  let status: string;
  if (stats.isInUse && stats.currentAgeDays !== null) {
    status = t(language, 'journal_status_in_use', { duration: formatDuration(stats.currentAgeDays, language) });
  } else if (stats.lastEnded?.end) {
    status = t(language, 'journal_status_out_of_use', { date: formatDate(stats.lastEnded.end, language) });
  } else {
    status = t(language, 'journal_status_empty');
  }

  let right: { text: string; color: string } | null = null;
  if (!stats.isInUse && item.installs.length > 0) {
    right = { text: t(language, 'journal_to_replace'), color: '#FF3B30' };
  } else if (stats.estimatedNext) {
    const daysAway = daysBetween(today, stats.estimatedNext);
    const color = daysAway < 0 ? '#FF3B30' : daysAway <= 30 ? '#FF9500' : theme.textSecondary;
    right = { text: formatEstimateWhen(daysAway, language), color };
  } else if (stats.avgDays !== null) {
    right = { text: t(language, 'journal_avg_short', { duration: formatDuration(stats.avgDays, language) }), color: theme.textSecondary };
  }

  return (
    <AnimatedPressable
      style={s.row}
      onPress={onPress}
      hapticStyle="light"
      accessibilityLabel={[item.name, status, right?.text].filter(Boolean).join(', ')}
    >
      <View style={[s.rowIcon, { backgroundColor: cat.color + '1F' }]}>
        <Ionicons name={cat.icon} size={18} color={cat.color} />
      </View>
      <View style={s.rowMain}>
        <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[s.rowSub, { color: theme.textMuted }]} numberOfLines={1}>{status}</Text>
      </View>
      {right && <Text style={[s.rowRight, { color: right.color }]} numberOfLines={1}>{right.text}</Text>}
      <Ionicons name="chevron-forward" size={16} color={theme.textDim} />
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40 },
  emptyIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 22, fontWeight: '700', fontFamily: fonts.bold, textAlign: 'center', marginBottom: 10 },
  emptyText: { fontSize: 15, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 22 },
  emptyExamples: { fontSize: 13, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 19, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 12, paddingLeft: 14, paddingRight: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowMain: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 17, fontFamily: fonts.regular },
  rowSub: { fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  rowRight: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold, marginRight: 6, maxWidth: 130, textAlign: 'right' },
});
