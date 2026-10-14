/**
 * Maintenance journal — one tracked item: what's in use now, how long past
 * ones lasted, the estimated next replacement, and the full history.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLanguage, useCurrency } from '../../src/stores/useSettingsStore';
import { useItemStore } from '../../src/stores/useItemStore';
import { useToday } from '../../src/stores/useClockStore';
import { t, tp } from '../../src/core/i18n';
import { CATEGORIES } from '../../src/core/constants';
import type { ItemInstall } from '../../src/core/constants';
import { formatDate, formatMoney } from '../../src/core/formatters';
import { daysBetween } from '../../src/core/dateUtils';
import {
  formatDuration, formatEstimateWhen, formatKm, getItemStats, installDurationDays, installDurationKm,
} from '../../src/core/lifespan';
import { AnimatedPressable, FadeInView } from '../../src/components/AnimatedUI';
import {
  Card, Divider, NavBar, NavIconButton, PrimaryButton, SecondaryButton, SectionHeader, StatRow,
} from '../../src/components/journal/JournalUI';
import { fonts } from '../../src/theme/typography';

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItemStore((s) => s.items.find((i) => i.id === id));
  const deleteItem = useItemStore((s) => s.deleteItem);
  const deleteInstall = useItemStore((s) => s.deleteInstall);
  const today = useToday();

  const stats = useMemo(() => (item ? getItemStats(item, today) : null), [item, today]);
  const history = useMemo(() => (item ? [...item.installs].reverse() : []), [item]);

  if (!item || !stats) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <NavBar title="" theme={theme} topInset={insets.top} onBack={() => router.back()} backLabel={t(language, 'nav_back')} />
        <Text style={[s.notFound, { color: theme.textMuted }]}>{t(language, 'journal_item_not_found')}</Text>
      </View>
    );
  }

  const cat = CATEGORIES[item.cat];
  const openEvent = (mode: 'replace' | 'broke' | 'install' | 'past') =>
    router.push({ pathname: '/item-event', params: { id: item.id, mode } });

  const confirmDeleteInstall = (install: ItemInstall) => {
    Alert.alert(
      t(language, 'journal_delete_entry_title'),
      t(language, 'journal_delete_entry_msg', { date: formatDate(install.start, language) }),
      [
        { text: t(language, 'confirm_cancel'), style: 'cancel' },
        { text: t(language, 'confirm_delete_btn'), style: 'destructive', onPress: () => deleteInstall(item.id, install.id) },
      ],
    );
  };

  const confirmDeleteItem = () => {
    Alert.alert(
      t(language, 'journal_delete_item'),
      t(language, 'journal_delete_item_msg', { name: item.name }),
      [
        { text: t(language, 'confirm_cancel'), style: 'cancel' },
        {
          text: t(language, 'confirm_delete_btn'),
          style: 'destructive',
          onPress: () => { router.back(); deleteItem(item.id); },
        },
      ],
    );
  };

  // A reminder for the estimated date, created through the regular document form
  const addReminder = () => {
    if (!stats.estimatedNext) return;
    router.push({
      pathname: '/form',
      params: {
        cat: item.cat,
        dupType: 'Altele', // every category has "Altele"; avoids a wrong pre-selected type
        dupRec: 'none',
        prefillTitle: t(language, 'journal_reminder_title', { name: item.name }),
        // An estimate that already passed would start the reminder as expired
        prefillDue: stats.estimatedNext < today ? today : stats.estimatedNext,
        prefillAsset: item.asset ?? '',
      },
    });
  };

  const current = stats.current;
  const daysToEstimate = stats.estimatedNext ? daysBetween(today, stats.estimatedNext) : null;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <NavBar
        title={item.name}
        theme={theme}
        topInset={insets.top}
        onBack={() => router.back()}
        backLabel={t(language, 'nav_back')}
        right={(
          <NavIconButton
            icon="create-outline"
            label={t(language, 'journal_edit')}
            onPress={() => router.push({ pathname: '/item-form', params: { id: item.id } })}
            theme={theme}
          />
        )}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Header */}
        <FadeInView delay={0} style={s.header}>
          <View style={[s.catChip, { backgroundColor: cat.color + '1F' }]}>
            <Ionicons name={cat.icon} size={14} color={cat.color} />
            <Text style={[s.catChipText, { color: cat.color }]}>{t(language, cat.labelKey)}</Text>
          </View>
          {item.asset ? <Text style={[s.asset, { color: theme.textSecondary }]}>{item.asset}</Text> : null}
        </FadeInView>

        {/* Now */}
        <FadeInView delay={60}>
          <SectionHeader title={t(language, 'journal_current')} theme={theme} />
          <Card theme={theme} style={s.nowCard}>
            {current && stats.currentAgeDays !== null ? (
              <>
                <Text style={[s.nowTitle, { color: theme.text }]}>
                  {t(language, 'journal_status_in_use', { duration: formatDuration(stats.currentAgeDays, language) })}
                </Text>
                <Text style={[s.nowSub, { color: theme.textSecondary }]}>
                  {[
                    t(language, 'journal_installed_on', { date: formatDate(current.start, language) }),
                    typeof current.startKm === 'number' ? t(language, 'journal_at_km', { km: formatKm(current.startKm, language) }) : null,
                    typeof current.cost === 'number' ? formatMoney(current.cost, currency, language) : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
                {current.note ? <Text style={[s.nowNote, { color: theme.textMuted }]}>{current.note}</Text> : null}
              </>
            ) : (
              <>
                <Text style={[s.nowTitle, { color: item.installs.length ? '#FF3B30' : theme.text }]}>
                  {t(language, item.installs.length ? 'journal_not_in_use' : 'journal_status_empty')}
                </Text>
                {stats.lastEnded?.end ? (
                  <Text style={[s.nowSub, { color: theme.textSecondary }]}>
                    {t(language, 'journal_status_out_of_use', { date: formatDate(stats.lastEnded.end, language) })}
                  </Text>
                ) : null}
              </>
            )}
          </Card>
          <View style={s.actions}>
            {current ? (
              <>
                <PrimaryButton label={t(language, 'journal_action_replace')} icon="swap-horizontal" onPress={() => openEvent('replace')} theme={theme} />
                <View style={{ height: 10 }} />
                <SecondaryButton label={t(language, 'journal_action_broke')} icon="warning-outline" color="#FF3B30" onPress={() => openEvent('broke')} theme={theme} />
              </>
            ) : (
              <PrimaryButton label={t(language, 'journal_action_install')} icon="add" onPress={() => openEvent('install')} theme={theme} />
            )}
          </View>
        </FadeInView>

        {/* Stats + estimate */}
        {stats.completed > 0 && (
          <FadeInView delay={120}>
            <SectionHeader title={t(language, 'journal_stats')} theme={theme} />
            <Card theme={theme}>
              <StatRow label={t(language, 'journal_avg_life')} value={formatDuration(stats.avgDays ?? 0, language)} theme={theme} />
              {stats.completed > 1 && stats.minDays !== null && stats.maxDays !== null && (
                <>
                  <Divider theme={theme} />
                  <StatRow label={t(language, 'journal_shortest')} value={formatDuration(stats.minDays, language)} theme={theme} />
                  <Divider theme={theme} />
                  <StatRow label={t(language, 'journal_longest')} value={formatDuration(stats.maxDays, language)} theme={theme} />
                </>
              )}
              {stats.avgKm !== null && (
                <>
                  <Divider theme={theme} />
                  <StatRow label={t(language, 'journal_avg_km')} value={`${formatKm(stats.avgKm, language)} km`} theme={theme} />
                </>
              )}
              {stats.totalCost > 0 && (
                <>
                  <Divider theme={theme} />
                  <StatRow label={t(language, 'journal_total_cost')} value={formatMoney(stats.totalCost, currency, language)} theme={theme} />
                </>
              )}
              {stats.brokeCount > 0 && (
                <>
                  <Divider theme={theme} />
                  <StatRow label={t(language, 'journal_broke_count')} value={tp(language, 'journal_times', stats.brokeCount)} theme={theme} />
                </>
              )}
            </Card>

            {stats.estimatedNext && daysToEstimate !== null && (
              <Card theme={theme} style={{ marginTop: 12 }}>
                <StatRow
                  label={t(language, 'journal_estimate')}
                  value={formatDate(stats.estimatedNext, language)}
                  theme={theme}
                />
                <Text style={[s.estimateWhen, { color: daysToEstimate < 0 ? '#FF3B30' : daysToEstimate <= 30 ? '#FF9500' : theme.textSecondary }]}>
                  {formatEstimateWhen(daysToEstimate, language)}
                  {stats.estimatedKm !== null ? ` · ${t(language, 'journal_estimate_km', { km: formatKm(stats.estimatedKm, language) })}` : ''}
                  {' · '}{tp(language, 'journal_based_on', stats.completed)}
                </Text>
                <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                  <SecondaryButton label={t(language, 'journal_add_reminder')} icon="notifications-outline" onPress={addReminder} theme={theme} />
                </View>
              </Card>
            )}
          </FadeInView>
        )}

        {/* History */}
        {history.length > 0 && (
          <FadeInView delay={180}>
            <SectionHeader title={t(language, 'journal_history')} theme={theme} />
            <Card theme={theme}>
              {history.map((install, i) => {
                const km = installDurationKm(install);
                const details = [
                  formatDuration(installDurationDays(install, today), language),
                  km !== null ? `${formatKm(km, language)} km` : null,
                  typeof install.cost === 'number' ? formatMoney(install.cost, currency, language) : null,
                  install.endReason ? t(language, install.endReason === 'broke' ? 'journal_reason_broke' : 'journal_reason_replaced') : null,
                ].filter(Boolean).join(' · ');
                return (
                  <React.Fragment key={install.id}>
                    {i > 0 && <Divider theme={theme} />}
                    <View style={s.historyRow}>
                      <View style={[s.historyDot, { backgroundColor: install.end ? (install.endReason === 'broke' ? '#FF3B30' : theme.textDim) : '#34C759' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.historyDates, { color: theme.text }]}>
                          {formatDate(install.start, language)} → {install.end ? formatDate(install.end, language) : t(language, 'journal_in_use_now')}
                        </Text>
                        <Text style={[s.historyDetails, { color: theme.textSecondary }]}>{details}</Text>
                        {install.note ? <Text style={[s.historyNote, { color: theme.textMuted }]}>{install.note}</Text> : null}
                      </View>
                      <AnimatedPressable
                        onPress={() => confirmDeleteInstall(install)}
                        haptic={false}
                        hitSlop={10}
                        accessibilityLabel={`${t(language, 'confirm_delete_btn')} ${formatDate(install.start, language)}`}
                        style={s.historyDelete}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
                      </AnimatedPressable>
                    </View>
                  </React.Fragment>
                );
              })}
            </Card>
          </FadeInView>
        )}

        {item.installs.length > 0 && (
          <FadeInView delay={200} style={s.actions}>
            {stats.completed === 0 && (
              <Text style={[s.pastHint, { color: theme.textMuted }]}>{t(language, 'journal_no_stats_hint')}</Text>
            )}
            <SecondaryButton label={t(language, 'journal_add_past')} icon="time-outline" onPress={() => openEvent('past')} theme={theme} />
          </FadeInView>
        )}

        {item.notes ? (
          <FadeInView delay={220}>
            <SectionHeader title={t(language, 'form_notes')} theme={theme} />
            <Card theme={theme} style={{ padding: 16 }}>
              <Text style={[s.nowSub, { color: theme.text, marginTop: 0 }]}>{item.notes}</Text>
            </Card>
          </FadeInView>
        ) : null}

        <View style={[s.actions, { marginTop: 32 }]}>
          <SecondaryButton label={t(language, 'journal_delete_item')} icon="trash-outline" color="#FF3B30" onPress={confirmDeleteItem} theme={theme} />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  notFound: { textAlign: 'center', marginTop: 80, fontSize: 15, fontFamily: fonts.regular },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  catChipText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold },
  asset: { fontSize: 15, fontFamily: fonts.regular, flexShrink: 1 },
  nowCard: { padding: 16 },
  nowTitle: { fontSize: 20, fontWeight: '700', fontFamily: fonts.bold },
  nowSub: { fontSize: 14, fontFamily: fonts.regular, marginTop: 6, lineHeight: 20 },
  nowNote: { fontSize: 13, fontFamily: fonts.regular, marginTop: 6 },
  actions: { paddingHorizontal: 16, marginTop: 12 },
  estimateWhen: { fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingLeft: 16, paddingRight: 8 },
  historyDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7, marginRight: 12 },
  historyDates: { fontSize: 15, fontWeight: '500', fontFamily: fonts.medium },
  historyDetails: { fontSize: 13, fontFamily: fonts.regular, marginTop: 3 },
  historyNote: { fontSize: 13, fontFamily: fonts.regular, marginTop: 3, fontStyle: 'italic' },
  historyDelete: { padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pastHint: { fontSize: 13, fontFamily: fonts.regular, lineHeight: 19, marginBottom: 10, paddingHorizontal: 4 },
});
