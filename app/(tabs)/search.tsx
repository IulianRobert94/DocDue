/**
 * Search Screen — Apple HIG 2025 v12
 * iOS-native search bar with scope buttons (category filter)
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, ScrollView,
  Keyboard, Animated as RNAnimated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLanguage, useCurrency } from '../../src/stores/useSettingsStore';
import { useEnrichedDocuments, useDocumentStore } from '../../src/stores/useDocumentStore';
import { t, translateSubtype } from '../../src/core/i18n';
import { SwipeableRow } from '../../src/components/SwipeableRow';
import { buildMarkAsPaidAction } from '../../src/core/confirmActions';
import { formatMoney, formatDaysRemaining } from '../../src/core/formatters';
import { STATUS_DISPLAY, CATEGORIES } from '../../src/core/constants';
import type { CategoryId, DocumentStatus } from '../../src/core/constants';
import { AnimatedPressable, FadeInView } from '../../src/components/AnimatedUI';

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
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const markAsPaid = useDocumentStore((s) => s.markAsPaid);
  const inputRef = useRef<TextInput>(null);
  const cancelOpacity = useRef(new RNAnimated.Value(0)).current;
  const cancelTranslateX = useRef(new RNAnimated.Value(30)).current;

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
    const query = debouncedQuery.toLowerCase();
    return baseDocs.filter((doc) => {
      const subName = translateSubtype(doc.type, language).toLowerCase();
      return (
        doc.title.toLowerCase().includes(query) ||
        subName.includes(query) ||
        (doc.asset && doc.asset.toLowerCase().includes(query)) ||
        (doc.notes && doc.notes.toLowerCase().includes(query))
      );
    });
  }, [enrichedDocs, statusFilter, scopeFilter, debouncedQuery, language]);

  const categoryIds = Object.keys(CATEGORIES) as CategoryId[];

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <FadeInView delay={0} style={{ paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
        <Text style={[s.largeTitle, { color: theme.text }]} accessibilityRole="header">
          {t(language, 'nav_search')}
        </Text>

        {/* Search bar */}
        <View style={s.searchRow}>
          <View style={[s.searchBar, { backgroundColor: theme.inputFill, flex: 1 }]}>
            <Ionicons name="search" size={16} color={theme.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              ref={inputRef}
              style={[s.searchInput, { color: theme.text }]}
              placeholder={t(language, 'search_placeholder')}
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
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
                <Text style={{ color: '#007AFF', fontSize: 17 }} numberOfLines={1}>{t(language, 'confirm_cancel')}</Text>
              </AnimatedPressable>
            </RNAnimated.View>
          )}
        </View>

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scopeRow}
          style={{ marginLeft: -20, marginRight: -20 }}
        >
          {([
            { key: 'all' as StatusFilter, label: t(language, 'search_all'), color: '#007AFF', icon: undefined },
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
                    : { backgroundColor: theme.inputFill },
                  active && opt.key === 'all' && { backgroundColor: '#007AFF' },
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
                ? { backgroundColor: '#007AFF' }
                : { backgroundColor: theme.inputFill },
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
                    ? { backgroundColor: cat.color + '22' }
                    : { backgroundColor: theme.inputFill },
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
        data={filteredDocs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 40 }}
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const isLast = index === filteredDocs.length - 1;
          const statusColor = STATUS_DISPLAY[item._status]?.color || '#999';
          const category = CATEGORIES[item.cat];

          return (
            <SwipeableRow
              onDelete={() => deleteDocument(item.id)}
              confirmTitle={t(language, 'confirm_delete_title')}
              confirmMessage={t(language, 'confirm_delete_msg', { title: item.title })}
              confirmCancel={t(language, 'confirm_cancel')}
              confirmDelete={t(language, 'confirm_delete_btn')}
              deleteLabel={t(language, 'detail_delete')}
              secondaryAction={buildMarkAsPaidAction(item, language, markAsPaid)}
            >
              <AnimatedPressable
                onPress={() => router.push(`/document/${item.id}`)}
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
          );
        }}
        ListEmptyComponent={
          searchQuery.length > 0 ? (
            <FadeInView delay={0} style={s.emptyState}>
              <View style={[s.emptyIconWrap, { backgroundColor: theme.inputFillSubtle }]}>
                <Ionicons name="search" size={32} color={theme.textDim} />
              </View>
              <Text style={[s.emptyText, { color: theme.textMuted }]}>
                {t(language, 'search_no_results', { q: searchQuery })}
              </Text>
            </FadeInView>
          ) : enrichedDocs.length === 0 ? (
            <FadeInView delay={0} style={s.emptyState}>
              <View style={[s.emptyIconWrap, { backgroundColor: theme.inputFillSubtle }]}>
                <Ionicons name="documents-outline" size={32} color={theme.textDim} />
              </View>
              <Text style={[s.emptyText, { color: theme.textMuted }]}>
                {t(language, 'no_documents')}
              </Text>
            </FadeInView>
          ) : (
            <FadeInView delay={0} style={s.emptyState}>
              <View style={[s.emptyIconWrap, { backgroundColor: theme.inputFillSubtle }]}>
                <Ionicons name="filter-outline" size={32} color={theme.textDim} />
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
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.37, marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: 10, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontSize: 17, padding: 0 },
  scopeRow: { paddingHorizontal: 20, gap: 8, paddingTop: 10, paddingBottom: 2 },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 5,
  },
  scopeText: { fontSize: 13, fontWeight: '600' },
  hintText: { fontSize: 13, marginTop: 10 },
  row: { overflow: 'hidden' },
  rowBody: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 12, paddingRight: 12, minHeight: 64 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowMain: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 17, fontWeight: '400' },
  rowSub: { fontSize: 13, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowDays: { fontSize: 13, fontWeight: '600' },
  rowAmt: { fontSize: 13, marginTop: 2 },
  emptyState: { paddingVertical: 60, alignItems: 'center' },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
