/**
 * Search Screen — Apple HIG 2025 v12
 * iOS-native search bar with scope buttons (category filter)
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, ScrollView,
  Keyboard, Animated as RNAnimated, Platform, ActionSheetIOS, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLanguage, useCurrency, useSettingsStore } from '../../src/stores/useSettingsStore';
import { useEnrichedDocuments, useDocumentStore } from '../../src/stores/useDocumentStore';
import { t, translateSubtype } from '../../src/core/i18n';
import { SwipeableRow } from '../../src/components/SwipeableRow';
import { buildMarkAsPaidAction, deleteWithUndo } from '../../src/core/confirmActions';
import { formatMoney, formatDaysRemaining } from '../../src/core/formatters';
import { sortDocumentsByField } from '../../src/core/enrichment';
import { STATUS_DISPLAY, CATEGORIES } from '../../src/core/constants';
import type { CategoryId, DocumentStatus, SortField } from '../../src/core/constants';
import Reanimated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { AnimatedPressable, FadeInView } from '../../src/components/AnimatedUI';
import { fonts } from '../../src/theme/typography';
import * as Haptics from 'expo-haptics';

type ScopeFilter = 'all' | CategoryId;
type StatusFilter = 'all' | DocumentStatus;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const enrichedDocs = useEnrichedDocuments();
  const router = useRouter();
  const navigation = useNavigation();
  const { status: statusParam } = useLocalSearchParams<{ status?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('urgency');
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const undoDelete = useDocumentStore((s) => s.undoDelete);
  const markAsPaid = useDocumentStore((s) => s.markAsPaid);
  const inputRef = useRef<TextInput>(null);
  const cancelOpacity = useRef(new RNAnimated.Value(0)).current;
  const cancelTranslateX = useRef(new RNAnimated.Value(30)).current;
  const recentSearches = useSettingsStore((s) => s.settings.recentSearches || []);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const saveRecentSearch = useCallback((query: string) => {
    if (!query.trim() || query.trim().length < 2) return;
    const trimmed = query.trim();
    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, 5);
    updateSetting('recentSearches', updated);
  }, [recentSearches, updateSetting]);

  // Set status filter when navigated with a param from home screen pills
  useEffect(() => {
    if (statusParam === 'ok' || statusParam === 'expired' || statusParam === 'warning') {
      setStatusFilter(statusParam);
    }
  }, [statusParam]);

  // Reset all filters when user taps the Search tab directly
  useEffect(() => {
    // @ts-expect-error — tabPress exists on tab navigators but Expo Router's useNavigation type doesn't expose it
    const unsubscribe = navigation.addListener('tabPress', () => {
      setStatusFilter('all');
      setScopeFilter('all');
      setSearchQuery('');
      setDebouncedQuery('');
      inputRef.current?.clear();
      setTimeout(() => inputRef.current?.focus(), 100);
    });
    return unsubscribe;
  }, [navigation]);

  // Debounce: wait 300ms after user stops typing before filtering
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleFocus = () => {
    setIsFocused(true);
    RNAnimated.parallel([
      RNAnimated.timing(cancelOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      RNAnimated.timing(cancelTranslateX, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const handleCancel = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setIsFocused(false);
    inputRef.current?.clear();
    inputRef.current?.blur();
    Keyboard.dismiss();
    RNAnimated.parallel([
      RNAnimated.timing(cancelOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      RNAnimated.timing(cancelTranslateX, { toValue: 30, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  // Apply status + scope + search query filters (memoized)
  const filteredDocs = useMemo(() => {
    const baseDocs = enrichedDocs.filter((doc) => {
      if (statusFilter !== 'all' && doc._status !== statusFilter) return false;
      if (scopeFilter !== 'all' && doc.cat !== scopeFilter) return false;
      return true;
    });
    if (debouncedQuery.length === 0) return baseDocs;
    const query = debouncedQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return baseDocs.filter((doc) => {
      const subName = normalize(translateSubtype(doc.type, language));
      return (
        normalize(doc.title).includes(query) ||
        subName.includes(query) ||
        (doc.asset && normalize(doc.asset).includes(query)) ||
        (doc.notes && normalize(doc.notes).includes(query))
      );
    });
  }, [enrichedDocs, statusFilter, scopeFilter, debouncedQuery, language]);

  const sortedDocs = useMemo(() =>
    sortDocumentsByField(filteredDocs, sortField, 'asc', language),
    [filteredDocs, sortField, language]
  );

  const SORT_CYCLE: SortField[] = ['urgency', 'date', 'amount', 'name'];
  const cycleSortField = () => {
    const idx = SORT_CYCLE.indexOf(sortField);
    setSortField(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]);
    Haptics.selectionAsync().catch(() => {});
  };

  const categoryIds = Object.keys(CATEGORIES) as CategoryId[];

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <FadeInView delay={0} style={{ paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
        <Text style={[s.largeTitle, { color: theme.text }]} accessibilityRole="header">
          {t(language, 'nav_search')}
        </Text>

        {/* Search bar */}
        <View style={s.searchRow}>
          <View style={[s.searchBar, { backgroundColor: theme.inputFill, flex: 1, borderWidth: 1, borderColor: theme.border }]}>
            <Ionicons name="search" size={16} color={theme.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              ref={inputRef}
              style={[s.searchInput, { color: theme.text }]}
              placeholder={t(language, 'search_placeholder')}
              placeholderTextColor={theme.textMuted}
              defaultValue=""
              onChangeText={setSearchQuery}
              onFocus={handleFocus}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel={t(language, 'search_placeholder')}
              accessibilityRole="search"
            />
          </View>
          {isFocused && (
            <RNAnimated.View style={{ width: 70, opacity: cancelOpacity, transform: [{ translateX: cancelTranslateX }] }}>
              <AnimatedPressable onPress={handleCancel} haptic={false} style={{ paddingLeft: 12, justifyContent: 'center', minHeight: 44 }}>
                <Text style={{ color: theme.primary, fontSize: 17, fontFamily: fonts.regular }} numberOfLines={1}>{t(language, 'confirm_cancel')}</Text>
              </AnimatedPressable>
            </RNAnimated.View>
          )}
        </View>

        {isFocused && searchQuery.length === 0 && recentSearches.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <Ionicons name="time-outline" size={14} color={theme.textMuted} />
            {recentSearches.map((recent, i) => (
              <AnimatedPressable
                key={i}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 6, paddingVertical: 5, borderRadius: 8, backgroundColor: theme.inputFill }}
                onPress={() => { setSearchQuery(recent); setDebouncedQuery(recent); }}
                onLongPress={() => {
                  const updated = recentSearches.filter((s) => s !== recent);
                  updateSetting('recentSearches', updated);
                  Haptics.selectionAsync().catch(() => {});
                }}
                hapticStyle="selection"
              >
                <Text style={{ fontSize: 13, color: theme.textSecondary, fontFamily: fonts.medium }}>{recent}</Text>
                <AnimatedPressable
                  onPress={() => {
                    const updated = recentSearches.filter((s) => s !== recent);
                    updateSetting('recentSearches', updated);
                  }}
                  haptic={false}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons name="close" size={12} color={theme.textDim} />
                </AnimatedPressable>
              </AnimatedPressable>
            ))}
          </View>
        )}

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scopeRow}
          style={{ marginLeft: -20, marginRight: -20 }}
        >
          {([
            { key: 'all' as StatusFilter, label: t(language, 'search_all'), color: theme.primary, icon: undefined },
            { key: 'expired' as StatusFilter, label: t(language, 'status_expired'), color: STATUS_DISPLAY.expired.color, icon: STATUS_DISPLAY.expired.icon },
            { key: 'warning' as StatusFilter, label: t(language, 'status_warning'), color: STATUS_DISPLAY.warning.color, icon: STATUS_DISPLAY.warning.icon },
            { key: 'ok' as StatusFilter, label: t(language, 'status_ok'), color: STATUS_DISPLAY.ok.color, icon: STATUS_DISPLAY.ok.icon },
          ]).map((opt) => {
            const active = statusFilter === opt.key;
            return (
              <AnimatedPressable
                key={opt.key}
                style={[
                  s.scopeChip,
                  active
                    ? { backgroundColor: opt.color + (opt.key === 'all' ? '' : '22') }
                    : { backgroundColor: theme.inputFill, borderWidth: 1, borderColor: 'transparent' },
                  active && opt.key === 'all' && { backgroundColor: theme.primary, borderWidth: 1, borderColor: theme.primary },
                  active && opt.key !== 'all' && { borderWidth: 1, borderColor: opt.color },
                ]}
                onPress={() => setStatusFilter(opt.key)}
                hapticStyle="selection"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: active }}
              >
                {opt.icon && <Ionicons name={opt.icon} size={14} color={active ? opt.color : theme.textMuted} />}
                <Text style={[s.scopeText, { color: active ? (opt.key === 'all' ? '#FFF' : opt.color) : theme.textSecondary }]}>
                  {opt.label}
                </Text>
              </AnimatedPressable>
            );
          })}
          {/* Sort toggle */}
          <AnimatedPressable
            style={[s.scopeChip, { backgroundColor: theme.inputFill, borderWidth: 1, borderColor: theme.border, marginLeft: 8 }]}
            onPress={cycleSortField}
            hapticStyle="selection"
            accessibilityLabel={t(language, 'sort_label')}
          >
            <Ionicons name="swap-vertical" size={14} color={theme.textSecondary} />
            <Text style={[s.scopeText, { color: theme.textSecondary }]}>
              {t(language, `sort_${sortField}`)}
            </Text>
          </AnimatedPressable>
        </ScrollView>

        {/* Category filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scopeRow}
          style={{ marginLeft: -20, marginRight: -20 }}
        >
          <AnimatedPressable
            style={[
              s.scopeChip,
              scopeFilter === 'all'
                ? { backgroundColor: theme.primary, borderWidth: 1, borderColor: theme.primary }
                : { backgroundColor: theme.inputFill, borderWidth: 1, borderColor: 'transparent' },
            ]}
            onPress={() => setScopeFilter('all')}
            hapticStyle="selection"
            accessibilityLabel={t(language, 'search_all')}
            accessibilityState={{ selected: scopeFilter === 'all' }}
          >
            <Text style={[s.scopeText, { color: scopeFilter === 'all' ? '#FFF' : theme.textSecondary }]}>
              {t(language, 'search_all')}
            </Text>
          </AnimatedPressable>
          {categoryIds.map((catId) => {
            const cat = CATEGORIES[catId];
            const active = scopeFilter === catId;
            return (
              <AnimatedPressable
                key={catId}
                style={[
                  s.scopeChip,
                  active
                    ? { backgroundColor: cat.color + '22', borderWidth: 1, borderColor: cat.color }
                    : { backgroundColor: theme.inputFill, borderWidth: 1, borderColor: 'transparent' },
                ]}
                onPress={() => setScopeFilter(catId)}
                hapticStyle="selection"
                accessibilityLabel={t(language, cat.labelKey)}
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={cat.icon} size={14} color={active ? cat.color : theme.textMuted} />
                <Text style={[s.scopeText, { color: active ? cat.color : theme.textSecondary }]}>
                  {t(language, cat.labelKey)}
                </Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        {searchQuery.length === 0 && (
          <Text style={[s.hintText, { color: theme.textMuted }]}>
            {t(language, 'search_count', { n: enrichedDocs.length })}
          </Text>
        )}
      </FadeInView>

      <FlatList
        data={sortedDocs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 40 }}
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        maxToRenderPerBatch={15}
        windowSize={7}
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const isLast = index === sortedDocs.length - 1;
          const statusColor = STATUS_DISPLAY[item._status]?.color || '#999';
          const category = CATEGORIES[item.cat] ?? CATEGORIES.vehicule;

          return (
            <Reanimated.View entering={FadeInDown.delay(index * 40).springify()} exiting={FadeOut.duration(200)}>
            <SwipeableRow
              onDelete={() => { deleteWithUndo(item.id, language, deleteDocument, undoDelete); }}
              confirmTitle={t(language, 'confirm_delete_title')}
              confirmMessage={t(language, 'confirm_delete_msg', { title: item.title })}
              confirmCancel={t(language, 'confirm_cancel')}
              confirmDelete={t(language, 'confirm_delete_btn')}
              deleteLabel={t(language, 'detail_delete')}
              secondaryAction={buildMarkAsPaidAction(item, language, markAsPaid)}
            >
              <AnimatedPressable
                onPress={() => {
                  if (debouncedQuery.length > 0) saveRecentSearch(debouncedQuery);
                  router.push(`/document/${item.id}`);
                }}
                onLongPress={() => {
                  const isRecurring = item.rec !== 'none';
                  const options = [
                    t(language, 'confirm_cancel'),
                    t(language, isRecurring ? 'confirm_paid_btn' : 'confirm_resolved_btn'),
                    t(language, 'detail_edit'),
                    t(language, 'detail_delete'),
                  ];
                  if (Platform.OS === 'ios') {
                    ActionSheetIOS.showActionSheetWithOptions(
                      { options, cancelButtonIndex: 0, destructiveButtonIndex: 3 },
                      (idx) => {
                        if (idx === 1) markAsPaid(item);
                        else if (idx === 2) router.push(`/form?editId=${item.id}`);
                        else if (idx === 3) {
                          Alert.alert(t(language, 'confirm_delete_title'), t(language, 'confirm_delete_msg'), [
                            { text: t(language, 'confirm_cancel'), style: 'cancel' },
                            { text: t(language, 'confirm_delete_btn'), style: 'destructive', onPress: () => { deleteWithUndo(item.id, language, deleteDocument, undoDelete); } },
                          ]);
                        }
                      }
                    );
                  } else {
                    Alert.alert(item.title, undefined, [
                      { text: t(language, 'confirm_cancel'), style: 'cancel' },
                      { text: t(language, isRecurring ? 'confirm_paid_btn' : 'confirm_resolved_btn'), onPress: () => markAsPaid(item) },
                      { text: t(language, 'detail_edit'), onPress: () => router.push(`/form?editId=${item.id}`) },
                      { text: t(language, 'detail_delete'), style: 'destructive', onPress: () => {
                        Alert.alert(t(language, 'confirm_delete_title'), t(language, 'confirm_delete_msg'), [
                          { text: t(language, 'confirm_cancel'), style: 'cancel' },
                          { text: t(language, 'confirm_delete_btn'), style: 'destructive', onPress: () => deleteDocument(item.id) },
                        ]);
                      }},
                    ]);
                  }
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                }}
                style={[s.row, {
                  backgroundColor: theme.card,
                  borderTopLeftRadius: isFirst ? 12 : 0,
                  borderTopRightRadius: isFirst ? 12 : 0,
                  borderBottomLeftRadius: isLast ? 12 : 0,
                  borderBottomRightRadius: isLast ? 12 : 0,
                }]}
                accessibilityLabel={t(language, "a11y_open_document", { title: item.title })}
                scaleValue={0.98}
              >
                <View style={s.rowBody}>
                  <View style={[s.rowIcon, { backgroundColor: (category?.color || '#999') + '14' }]}>
                    <Ionicons name={category?.icon || 'document-outline'} size={18} color={category?.color || '#999'} />
                  </View>
                  <View style={s.rowMain}>
                    <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[s.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
                      {translateSubtype(item.type, language)}{item.asset ? ` · ${item.asset}` : ''}
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
                {!isLast && <View style={{ position: 'absolute', bottom: 0, left: 56, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />}
              </AnimatedPressable>
            </SwipeableRow>
            </Reanimated.View>
          );
        }}
        ListEmptyComponent={
          searchQuery.length > 0 ? (
            <FadeInView delay={0} style={s.emptyState}>
              <View style={[s.emptyIconWrap, { backgroundColor: theme.inputFillSubtle }]}>
                <Ionicons name="search" size={44} color={theme.textDim} />
              </View>
              <Text style={[s.emptyText, { color: theme.textMuted }]}>
                {t(language, 'search_no_results', { q: searchQuery })}
              </Text>
            </FadeInView>
          ) : enrichedDocs.length === 0 ? (
            <FadeInView delay={0} style={s.emptyState}>
              <View style={[s.emptyIconWrap, { backgroundColor: theme.inputFillSubtle }]}>
                <Ionicons name="documents-outline" size={44} color={theme.textDim} />
              </View>
              <Text style={[s.emptyText, { color: theme.textMuted }]}>
                {t(language, 'no_documents')}
              </Text>
            </FadeInView>
          ) : (
            <FadeInView delay={0} style={s.emptyState}>
              <View style={[s.emptyIconWrap, { backgroundColor: theme.inputFillSubtle }]}>
                <Ionicons name="filter-outline" size={44} color={theme.textDim} />
              </View>
              <Text style={[s.emptyText, { color: theme.textMuted }]}>
                {t(language, 'search_no_filter_results')}
              </Text>
            </FadeInView>
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  largeTitle: { fontSize: 34, letterSpacing: 0.37, marginBottom: 12, fontFamily: fonts.bold },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 12, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontSize: 17, padding: 0, fontFamily: fonts.regular },
  scopeRow: { paddingHorizontal: 20, gap: 8, paddingTop: 10, paddingBottom: 2 },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  scopeText: { fontSize: 13, fontFamily: fonts.semiBold },
  hintText: { fontSize: 13, marginTop: 10, fontFamily: fonts.regular },
  row: { overflow: 'hidden' },
  rowBody: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 12, paddingRight: 12, minHeight: 64 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowMain: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 17, fontFamily: fonts.regular },
  rowSub: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  rowRight: { alignItems: 'flex-end' },
  rowDays: { fontSize: 13, fontFamily: fonts.semiBold },
  rowAmt: { fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  emptyState: { paddingVertical: 60, alignItems: 'center' },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 15, textAlign: 'center', fontFamily: fonts.regular },
});
