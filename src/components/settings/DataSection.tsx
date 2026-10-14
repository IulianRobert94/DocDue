/**
 * Data section for Settings screen
 * Handles Excel export/import, demo reset, and clear all
 */

import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { t, tp, translateSubtype } from '../../core/i18n';
import { useItemStore } from '../../stores/useItemStore';
import { parseImportedRows } from '../../core/importParser';
import { isDemoDocument, countTowardFreeLimit } from '../../core/helpers';
import { docCurrency } from '../../core/money';
import { CATEGORIES, FREE_DOCUMENT_LIMIT, MAX_IMPORT_LIMIT } from '../../core/constants';
import type { RawDocument, AppSettings } from '../../core/constants';
import type { AppTheme } from '../../theme/colors';
import { AnimatedPressable } from '../AnimatedUI';
import { RowDivider } from './SettingsUI';
import { fonts } from '../../theme/typography';
// Lazy-loaded to save ~1MB from initial bundle
let _xlsx: typeof import('xlsx') | null = null;
async function getXLSX() {
  if (!_xlsx) {
    try {
      _xlsx = await import('xlsx');
    } catch {
      _xlsx = null;
    }
  }
  return _xlsx;
}

interface DataSectionProps {
  theme: AppTheme;
  language: 'ro' | 'en';
  settings: AppSettings;
  documents: RawDocument[];
  addDocuments: (docs: Omit<RawDocument, 'id'>[]) => void;
  resetToDemo: () => void;
  clearAll: () => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  isPremium: boolean;
  onPremiumGate: () => void;
}

export function DataSection({
  theme,
  language,
  settings,
  documents,
  addDocuments,
  resetToDemo,
  clearAll,
  isLoading,
  setIsLoading,
  isPremium,
  onPremiumGate,
}: DataSectionProps) {
  const journalItems = useItemStore((s) => s.items);
  const clearAllItems = useItemStore((s) => s.clearAllItems);

  const handleExportExcel = async () => {
    if (!isPremium) { onPremiumGate(); return; }
    setIsLoading(true);
    try {
      const XLSX = await getXLSX();
      if (!XLSX) { Alert.alert(t(language, 'alert_error'), t(language, 'generic_error')); return; }
      // The user's own active documents: archived ones would come back as
      // expired on re-import, and the examples aren't theirs
      const rows = documents.filter((doc) => !doc.resolved && !isDemoDocument(doc)).map((doc) => ({
        [t(language, 'form_category')]: t(language, CATEGORIES[doc.cat]?.labelKey || '') || doc.cat,
        [t(language, 'form_type')]: translateSubtype(doc.type, language),
        [t(language, 'form_title')]: doc.title,
        [t(language, 'form_asset')]: doc.asset || '',
        [t(language, 'form_due')]: doc.due,
        [t(language, 'form_amount')]: doc.amt ?? '',
        [t(language, 'form_currency')]: doc.amt ? docCurrency(doc, settings.currency) : '',
        [t(language, 'form_recurrence')]: doc.rec,
        [t(language, 'form_notes')]: doc.notes || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 20 },
        { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Documents');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `docdue-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, wbout, { encoding: FileSystem.EncodingType.Base64 });
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t(language, 'alert_notice'), t(language, 'sharing_unavailable'));
        return;
      }
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: t(language, 'settings_export_excel'),
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } catch (e: unknown) {
      if (__DEV__) console.error('DocDue Excel export error:', e);
      Alert.alert(t(language, 'settings_export_error'), t(language, 'generic_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportExcel = async () => {
    if (!isPremium) { onPremiumGate(); return; }
    setIsLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const fileUri = result.assets[0].uri;
      const XLSX = await getXLSX();
      if (!XLSX) { Alert.alert(t(language, 'alert_error'), t(language, 'generic_error')); return; }
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(fileContent, { type: 'base64', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { Alert.alert(t(language, 'settings_import_no_data')); return; }
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) { Alert.alert(t(language, 'settings_import_no_data')); return; }
      if (rows.length > MAX_IMPORT_LIMIT) {
        Alert.alert(t(language, 'alert_error'), t(language, 'import_too_large', { max: MAX_IMPORT_LIMIT }));
        return;
      }

      // Rows with a missing/invalid due date are skipped and counted —
      // never silently converted to "today"
      const { docs: parsedDocs, invalidDates } = parseImportedRows(rows, language);

      if (parsedDocs.length === 0) {
        Alert.alert(
          t(language, 'settings_import_no_data') +
            (invalidDates > 0 ? `\n${tp(language, 'import_invalid_dates', invalidDates)}` : '')
        );
        return;
      }

      const existingKeys = new Set(
        documents.map((d) => `${d.title}|${d.due}|${d.cat}`)
      );
      const uniqueDocs = parsedDocs.filter(
        (d) => !existingKeys.has(`${d.title}|${d.due}|${d.cat}`)
      );
      const skipped = parsedDocs.length - uniqueDocs.length;

      if (uniqueDocs.length === 0) {
        Alert.alert(t(language, 'alert_notice'), t(language, 'all_docs_exist'));
        return;
      }

      if (!isPremium) {
        const remaining = FREE_DOCUMENT_LIMIT - countTowardFreeLimit(documents);
        if (remaining <= 0) {
          Alert.alert(
            t(language, 'premium_limit_title'),
            t(language, 'premium_limit_msg', { n: FREE_DOCUMENT_LIMIT }),
          );
          return;
        }
        if (uniqueDocs.length > remaining) {
          uniqueDocs.splice(remaining);
        }
      }

      let msg = tp(language, 'settings_import_confirm_msg', uniqueDocs.length);
      if (skipped > 0) msg += `\n(${skipped} ${t(language, 'duplicates_skipped')})`;
      if (invalidDates > 0) msg += `\n${tp(language, 'import_invalid_dates', invalidDates)}`;

      Alert.alert(
        t(language, 'settings_import_confirm_title'),
        msg,
        [
          { text: t(language, 'confirm_cancel'), style: 'cancel' },
          {
            text: t(language, 'settings_import_confirm_btn'),
            onPress: () => {
              addDocuments(uniqueDocs);
              Alert.alert(tp(language, 'settings_import_success', uniqueDocs.length));
            },
          },
        ]
      );
    } catch {
      Alert.alert(t(language, 'settings_import_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDemo = () => {
    Alert.alert(
      t(language, 'confirm_reset_title'),
      t(language, 'confirm_reset_msg'),
      [
        { text: t(language, 'confirm_cancel'), style: 'cancel' },
        { text: t(language, 'confirm_reset_btn'), style: 'destructive', onPress: () => resetToDemo() },
      ]
    );
  };

  // "Delete all data" also empties the maintenance journal
  const handleClearAll = () => {
    if (documents.length === 0 && journalItems.length === 0) return;
    const message = [
      documents.length > 0 ? tp(language, 'confirm_clear_msg_count', documents.length) : null,
      journalItems.length > 0 ? tp(language, 'confirm_clear_items_count', journalItems.length) : null,
    ].filter(Boolean).join('\n');
    Alert.alert(
      t(language, 'confirm_clear_title'),
      message,
      [
        { text: t(language, 'confirm_cancel'), style: 'cancel' },
        { text: t(language, 'confirm_clear_btn'), style: 'destructive', onPress: () => { clearAll(); clearAllItems(); } },
      ]
    );
  };

  return (
    <>
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
        {t(language, 'settings_data')}
      </Text>
      <View style={[styles.group, { backgroundColor: theme.card }]}>
        <AnimatedPressable style={styles.row} onPress={handleExportExcel} disabled={isLoading} hapticStyle="light" accessibilityLabel={t(language, 'settings_export_excel')}>
          <Ionicons name="grid-outline" size={18} color="#34C759" style={{ marginRight: 8 }} />
          <Text style={[styles.rowLabel, { color: '#34C759' }]}>
            {t(language, 'settings_export_excel')}
            {!isPremium && <Text style={{ fontSize: 11, fontWeight: '700', fontFamily: fonts.bold, color: '#FFD700' }}> PRO</Text>}
          </Text>
        </AnimatedPressable>
        <RowDivider theme={theme} />
        <AnimatedPressable style={styles.row} onPress={handleImportExcel} disabled={isLoading} hapticStyle="light" accessibilityLabel={t(language, 'settings_import_excel')}>
          <Ionicons name="download-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
          <Text style={[styles.rowLabel, { color: theme.primaryText }]}>
            {t(language, 'settings_import_excel')}
            {!isPremium && <Text style={{ fontSize: 11, fontWeight: '700', fontFamily: fonts.bold, color: '#FFD700' }}> PRO</Text>}
          </Text>
        </AnimatedPressable>
        <RowDivider theme={theme} />
        {__DEV__ && (
          <>
            <AnimatedPressable style={styles.row} onPress={handleResetDemo} hapticStyle="light" accessibilityLabel={t(language, 'settings_reset_demo')}>
              <Ionicons name="refresh-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
              <Text style={[styles.rowLabel, { color: theme.primaryText }]}>
                {t(language, 'settings_reset_demo')}
              </Text>
            </AnimatedPressable>
            <RowDivider theme={theme} />
          </>
        )}
        <AnimatedPressable style={styles.row} onPress={handleClearAll} hapticStyle="medium" accessibilityLabel={t(language, 'settings_clear_all')}>
          <Ionicons name="trash-outline" size={18} color="#FF3B30" style={{ marginRight: 8 }} />
          <Text style={[styles.rowLabel, { color: '#FF3B30' }]}>
            {t(language, 'settings_clear_all')}
          </Text>
        </AnimatedPressable>
      </View>
      <Text style={[styles.footerText, { color: theme.textSecondary, marginHorizontal: 20, marginTop: 6 }]}>
        {t(language, 'settings_about_text')}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: fonts.regular,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowLabel: { fontSize: 17, fontFamily: fonts.regular },
  footerText: { fontSize: 13, fontFamily: fonts.regular, lineHeight: 18 },
});
