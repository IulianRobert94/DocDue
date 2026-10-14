/**
 * Alerts Screen — Apple HIG 2025
 * Animated grouped list with premium feel
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLanguage, useCurrency } from '../../src/stores/useSettingsStore';
import { useEnrichedDocuments, useDocumentStore, useGlobalStats } from '../../src/stores/useDocumentStore';
import { t, translateSubtype } from '../../src/core/i18n';
import { SwipeableRow } from '../../src/components/SwipeableRow';
import { buildMarkAsPaidAction, deleteWithUndo, showDocumentMenu } from '../../src/core/confirmActions';
import { groupAlerts } from '../../src/core/alerts';
import { docCurrency, formatTotals } from '../../src/core/money';
import type { AlertGroupKey } from '../../src/core/alerts';
import { isDemoDocument } from '../../src/core/helpers';
import { usePaySheet } from '../../src/components/PaySheet';
import { ExamplePill } from '../../src/components/ExamplePill';
import { formatDaysRemaining, formatMoney } from '../../src/core/formatters';
import { STATUS_DISPLAY, CATEGORIES } from '../../src/core/constants';
import type { IconName } from '../../src/types';
import Reanimated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { AnimatedPressable, FadeInView } from '../../src/components/AnimatedUI';
import { fonts } from '../../src/theme/typography';

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const router = useRouter();
  const enrichedDocs = useEnrichedDocuments();
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const undoDelete = useDocumentStore((s) => s.undoDelete);
  const stats = useGlobalStats(enrichedDocs);
  const { openPaySheet, paySheet } = usePaySheet();

  // Late / next 7 days / next 30 days / later — each with the money it needs
  const sections = useMemo(() => groupAlerts(enrichedDocs, currency).map((group) => ({
    ...group,
    title: t(language, `alerts_group_${group.key}`),
  })), [enrichedDocs, language, currency]);

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <SectionList
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
        sections={sections}
        stickySectionHeadersEnabled={false}
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <FadeInView delay={0} style={s.titleContainer}>
            <Text style={[s.largeTitle, { color: theme.text }]} accessibilityRole="header">
              {t(language, 'nav_alerts')}
            </Text>
            {stats.soonCount > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countText}>{stats.soonCount}</Text>
              </View>
            )}
          </FadeInView>
        }
        renderSectionHeader={({ section: { title, key, data, totals } }) => (
          <View style={s.sectionHeader} accessibilityRole="header">
            <Ionicons name={GROUP_ICON[key].icon} size={14} color={GROUP_ICON[key].color ?? theme.textMuted} />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>
              {title} ({data.length})
            </Text>
            {formatTotals(totals, language) !== '' && (
              <Text style={[s.sectionTotal, { color: theme.textSecondary }]}>{formatTotals(totals, language)}</Text>
            )}
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const statusColor = STATUS_DISPLAY[item._status]?.color || '#999';
          const category = CATEGORIES[item.cat] ?? CATEGORIES.vehicule;

          return (
            <Reanimated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify()} exiting={FadeOut.duration(200)} style={{ marginHorizontal: 16 }}>
              <SwipeableRow
                onDelete={() => { deleteWithUndo(item.id, language, deleteDocument, undoDelete); }}
                confirmTitle={t(language, 'confirm_delete_title')}
                confirmMessage={t(language, 'confirm_delete_msg', { title: item.title })}
                confirmCancel={t(language, 'confirm_cancel')}
                confirmDelete={t(language, 'confirm_delete_btn')}
                deleteLabel={t(language, 'detail_delete')}
                secondaryAction={buildMarkAsPaidAction(item, language, openPaySheet)}
              >
                <AnimatedPressable
                  onPress={() => router.push(`/document/${item.id}`)}
                  onLongPress={() => showDocumentMenu(item, language, {
                    onPay: openPaySheet,
                    onEdit: (d) => router.push(`/form?editId=${d.id}`),
                    onDelete: (d) => deleteWithUndo(d.id, language, deleteDocument, undoDelete),
                  })}
                  style={[
                    s.row,
                    {
                      backgroundColor: theme.card,
                      borderTopLeftRadius: isFirst ? 12 : 0,
                      borderTopRightRadius: isFirst ? 12 : 0,
                      borderBottomLeftRadius: isLast ? 12 : 0,
                      borderBottomRightRadius: isLast ? 12 : 0,
                    },
                  ]}
                  accessibilityLabel={t(language, "a11y_open_document", { title: item.title })}
                  scaleValue={0.98}
                >
                  <View style={s.rowContent}>
                    <View style={[s.rowIcon, { backgroundColor: (category?.color || '#999') + '14' }]}>
                      <Ionicons name={category?.icon || 'document-outline'} size={18} color={category?.color || '#999'} />
                    </View>
                    <View style={s.rowMain}>
                      <View style={s.titleLine}>
                        <Text style={[s.rowTitle, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {isDemoDocument(item) && <ExamplePill language={language} />}
                      </View>
                      <Text style={[s.rowSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
                        {translateSubtype(item.type, language)}
                        {item.asset ? ` · ${item.asset}` : ''}
                      </Text>
                    </View>
                    <View style={s.rowRight}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={STATUS_DISPLAY[item._status]?.icon || 'ellipse'} size={13} color={statusColor} />
                        <Text style={[s.rowDays, { color: statusColor }]}>
                          {formatDaysRemaining(item._daysUntil, language)}
                        </Text>
                      </View>
                      {item.amt ? (
                        <Text style={[s.rowAmount, { color: theme.textMuted }]}>
                          {formatMoney(item.amt, docCurrency(item, currency), language)}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={theme.textDim} style={{ marginLeft: 4 }} />
                  </View>
                  {!isLast && (
                    <View style={{ position: 'absolute', bottom: 0, left: 56, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                  )}
                </AnimatedPressable>
              </SwipeableRow>
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          <FadeInView delay={200} style={s.emptyState}>
            {enrichedDocs.length === 0 ? (
              <>
                <View style={[s.emptyIconWrap, { backgroundColor: 'rgba(10,121,241,0.08)' }]}>
                  <Ionicons name="documents-outline" size={44} color={theme.primary} />
                </View>
                <Text style={[s.emptyTitle, { color: theme.text }]}>
                  {t(language, 'alerts_no_docs_title')}
                </Text>
                <Text style={[s.emptyText, { color: theme.textMuted }]}>
                  {t(language, 'alerts_no_docs')}
                </Text>
              </>
            ) : (
              <>
                <View style={s.emptyIconWrap}>
                  <Ionicons name="checkmark-circle" size={44} color="#34C759" />
                </View>
                <Text style={[s.emptyTitle, { color: theme.text }]}>
                  {t(language, 'alerts_none_title')}
                </Text>
                <Text style={[s.emptyText, { color: theme.textMuted }]}>
                  {t(language, 'alerts_empty')}
                </Text>
              </>
            )}
          </FadeInView>
        }
      />
      {paySheet}
    </View>
  );
}

const GROUP_ICON: Record<AlertGroupKey, { icon: IconName; color?: string }> = {
  overdue: { icon: 'alert-circle', color: '#FF3B30' },
  week: { icon: 'time', color: '#FF9500' },
  month: { icon: 'calendar', color: '#0A79F1' },
  later: { icon: 'calendar-outline' },
};

const s = StyleSheet.create({
  container: { flex: 1 },
  titleContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  largeTitle: { fontSize: 34, letterSpacing: 0.37, fontFamily: fonts.bold },
  countBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: '#FF3B30' },
  countText: { color: '#FFF', fontSize: 14, fontFamily: fonts.bold },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts.semiBold, flex: 1 },
  sectionTotal: { fontSize: 13, fontFamily: fonts.semiBold },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { overflow: 'hidden' },
  rowContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 12, paddingRight: 12, minHeight: 64 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowMain: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 17, fontWeight: '400', fontFamily: fonts.regular },
  rowSubtitle: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  rowRight: { alignItems: 'flex-end' },
  rowDays: { fontSize: 13, fontFamily: fonts.semiBold },
  rowAmount: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  emptyState: { paddingVertical: 80, alignItems: 'center', paddingHorizontal: 32 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(52,199,89,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, marginBottom: 8, fontFamily: fonts.semiBold },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22, fontFamily: fonts.regular },
});
