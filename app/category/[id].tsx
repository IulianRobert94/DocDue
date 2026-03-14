/**
 * Category Detail Screen — Apple HIG 2025
 * Animated header, toggle sort chips, premium grouped list
 */

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, SectionList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLanguage, useCurrency } from '../../src/stores/useSettingsStore';
import { useEnrichedDocuments, useDocumentStore } from '../../src/stores/useDocumentStore';
import { t, translateSubtype } from '../../src/core/i18n';
import { SwipeableRow } from '../../src/components/SwipeableRow';
import { buildMarkAsPaidAction, deleteWithUndo } from '../../src/core/confirmActions';
import { formatDate, formatMoney, formatDaysRemaining } from '../../src/core/formatters';
import { sortDocumentsByField } from '../../src/core/enrichment';
import { CATEGORIES, STATUS_DISPLAY, SORT_OPTIONS } from '../../src/core/constants';
import type { CategoryId, SortField, SortDirection, DocumentStatus } from '../../src/core/constants';
import Reanimated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { AnimatedPressable, FadeInView } from '../../src/components/AnimatedUI';
import { fonts } from '../../src/theme/typography';

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const enrichedDocs = useEnrichedDocuments();
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const undoDelete = useDocumentStore((s) => s.undoDelete);
  const markAsPaid = useDocumentStore((s) => s.markAsPaid);
  const [sortField, setSortField] = useState<SortField>('urgency');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const categoryId = id as CategoryId;
  const category = CATEGORIES[categoryId];

  if (!category) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={{ paddingTop: insets.top + 16, alignItems: 'center', paddingVertical: 80 }}>
          <Ionicons name="alert-circle-outline" size={40} color={theme.textDim} style={{ marginBottom: 12 }} />
          <Text style={{ color: theme.textMuted, fontSize: 15, fontFamily: fonts.regular }}>{t(language, 'doc_not_found')}</Text>
          <AnimatedPressable onPress={() => router.back()} style={{ marginTop: 20 }} accessibilityLabel={t(language, 'a11y_go_back')}>
            <Text style={{ color: theme.primary, fontSize: 17, fontFamily: fonts.regular }}>{t(language, 'btn_back')}</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  const handleSortTap = (opt: typeof SORT_OPTIONS[number]) => {
    if (sortField === opt.value && opt.toggleable) {
      // Toggle direction
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(opt.value);
      // Default direction per field
      setSortDir(opt.value === 'amount' ? 'desc' : 'asc');
    }
  };

  const getSortLabel = (opt: typeof SORT_OPTIONS[number]) => {
    const base = t(language, opt.labelKey);
    if (sortField === opt.value && opt.toggleable) {
      return `${base} ${sortDir === 'asc' ? '↑' : '↓'}`;
    }
    return base;
  };

  const { categoryDocs, sections } = useMemo(() => {
    const sorted = sortDocumentsByField(
      enrichedDocs.filter((doc) => doc.cat === categoryId),
      sortField, sortDir, language
    );
    const expired: typeof sorted = [];
    const warning: typeof sorted = [];
    const ok: typeof sorted = [];
    for (const d of sorted) {
      if (d._status === 'expired') expired.push(d);
      else if (d._status === 'warning') warning.push(d);
      else ok.push(d);
    }
    const sects = [
      { title: t(language, 'status_expired'), data: expired, status: 'expired' as DocumentStatus },
      { title: t(language, 'status_warning'), data: warning, status: 'warning' as DocumentStatus },
      { title: t(language, 'status_ok'), data: ok, status: 'ok' as DocumentStatus },
    ].filter((sec) => sec.data.length > 0);
    return { categoryDocs: sorted, sections: sects };
  }, [enrichedDocs, categoryId, sortField, sortDir, language]);

  const categoryLabel = category ? t(language, category.labelKey) : id;

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* iOS Nav Bar */}
      <FadeInView delay={0} style={[s.navBar, { paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.divider }]}>
        <AnimatedPressable onPress={() => router.back()} style={s.backBtn} accessibilityLabel={t(language, 'a11y_go_back')}>
          <Ionicons name="chevron-back" size={28} color={theme.primary} />
          <Text style={{ color: theme.primary, fontSize: 17, fontFamily: fonts.regular, marginLeft: -4 }}>{t(language, 'nav_back')}</Text>
        </AnimatedPressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
          <Ionicons name={category?.icon || 'document-outline'} size={18} color={category?.color || '#999'} />
          <Text style={[s.navTitle, { color: theme.text }]} numberOfLines={1}>{categoryLabel}</Text>
        </View>
        <View style={{ width: 60 }} />
      </FadeInView>

      {/* Sort chips — toggleable */}
      <View style={s.sortRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {SORT_OPTIONS.map((opt) => {
            const active = sortField === opt.value;
            return (
              <AnimatedPressable
                key={opt.value}
                style={[s.sortChip, {
                  backgroundColor: active ? theme.primary : theme.inputFill,
                }]}
                onPress={() => handleSortTap(opt)}
                hapticStyle="selection"
                accessibilityLabel={t(language, 'a11y_sort_by', { label: getSortLabel(opt) })}
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.sortText, { color: active ? '#FFF' : theme.textSecondary }]}>
                  {getSortLabel(opt)}
                </Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      </View>

      <Text style={[s.countLabel, { color: theme.textMuted }]}>
        {categoryDocs.length} {t(language, categoryDocs.length === 1 ? 'doc_singular' : 'doc_plural')}
      </Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        renderSectionHeader={({ section: { title, status, data } }) => (
          <View style={s.sectionHeader} accessibilityRole="header">
            <Ionicons
              name={STATUS_DISPLAY[status]?.icon || 'ellipse'}
              size={14}
              color={STATUS_DISPLAY[status]?.color}
            />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>{title} ({data.length})</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const statusColor = STATUS_DISPLAY[item._status]?.color || '#999';

          return (
            <Reanimated.View entering={FadeInDown.delay(index * 40).springify()} exiting={FadeOut.duration(200)} style={{ marginHorizontal: 16 }}>
              <SwipeableRow
                onDelete={() => deleteWithUndo(item.id, language, deleteDocument, undoDelete)}
                confirmTitle={t(language, 'confirm_delete_title')}
                confirmMessage={t(language, 'confirm_delete_msg', { title: item.title })}
                confirmCancel={t(language, 'confirm_cancel')}
                confirmDelete={t(language, 'confirm_delete_btn')}
                deleteLabel={t(language, 'detail_delete')}
                secondaryAction={buildMarkAsPaidAction(item, language, markAsPaid)}
              >
                <AnimatedPressable
                  onPress={() => router.push(`/document/${item.id}`)}
                  accessibilityLabel={t(language, "a11y_open_document", { title: item.title })}
                  scaleValue={0.98}
                  style={[s.row, {
                    backgroundColor: theme.card,
                    borderTopLeftRadius: isFirst ? 12 : 0,
                    borderTopRightRadius: isFirst ? 12 : 0,
                    borderBottomLeftRadius: isLast ? 12 : 0,
                    borderBottomRightRadius: isLast ? 12 : 0,
                  }]}
                >
                  <View style={s.rowBody}>
                    <View style={[s.statusStrip, { backgroundColor: statusColor }]} />
                    <View style={s.rowMain}>
                      <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[s.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
                        {translateSubtype(item.type, language)}{item.asset ? ` · ${item.asset}` : ''} · {formatDate(item.due, language)}
                      </Text>
                    </View>
                    <View style={s.rowRight}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={STATUS_DISPLAY[item._status]?.icon || 'ellipse'} size={13} color={statusColor} />
                        <Text style={[s.rowDays, { color: statusColor }]}>{formatDaysRemaining(item._daysUntil, language)}</Text>
                      </View>
                      {item.amt ? <Text style={[s.rowAmt, { color: theme.textMuted }]}>{formatMoney(item.amt, currency, language)}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={theme.textDim} style={{ marginLeft: 4 }} />
                  </View>
                  {!isLast && <View style={{ position: 'absolute', bottom: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />}
                </AnimatedPressable>
              </SwipeableRow>
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          <FadeInView delay={200} style={s.emptyState}>
            <View style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: theme.inputFillSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="documents-outline" size={44} color={theme.textDim} />
            </View>
            <Text style={[s.emptyText, { color: theme.textMuted }]}>{t(language, 'no_documents')}</Text>
            <AnimatedPressable
              onPress={() => router.push(`/form?cat=${categoryId}`)}
              style={[s.addBtn, { backgroundColor: theme.primary }]}
              hapticStyle="medium"
              accessibilityLabel={t(language, 'a11y_add_document')}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={s.addBtnText}>{t(language, 'nav_add')}</Text>
            </AnimatedPressable>
          </FadeInView>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 60, paddingLeft: 4 },
  navTitle: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  sortRow: { paddingVertical: 12 },
  sortChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  sortText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold },
  countLabel: { fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: 20, paddingBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { overflow: 'hidden' },
  rowBody: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingLeft: 16, paddingRight: 12, minHeight: 60 },
  statusStrip: { width: 3, height: 28, borderRadius: 2, marginRight: 12 },
  rowMain: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 17, fontWeight: '400', fontFamily: fonts.regular },
  rowSub: { fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowDays: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold },
  rowAmt: { fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  emptyState: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, fontFamily: fonts.regular },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 },
  addBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
});
