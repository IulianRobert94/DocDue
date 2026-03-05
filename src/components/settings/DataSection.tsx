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
import * as XLSX from 'xlsx';

import { t, translateSubtype } from '../../core/i18n';
import { CATEGORIES, FREE_DOCUMENT_LIMIT } from '../../core/constants';
import type { CategoryId, RecurrenceValue, RawDocument, AppSettings } from '../../core/constants';
import type { AppTheme } from '../../theme/colors';
import { AnimatedPressable } from '../AnimatedUI';
import { RowDivider } from './SettingsUI';

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

  const handleExportExcel = async () => {
    if (!isPremium) { onPremiumGate(); return; }
    setIsLoading(true);
    try {
      const rows = documents.map((doc) => ({
        [t(language, 'form_category')]: t(language, CATEGORIES[doc.cat]?.labelKey || '') || doc.cat,
        [t(language, 'form_type')]: translateSubtype(doc.type, language),
        [t(language, 'form_title')]: doc.title,
        [t(language, 'form_asset')]: doc.asset || '',
        [t(language, 'form_due')]: doc.due,
        [t(language, 'form_amount')]: doc.amt ?? '',
        [t(language, 'form_recurrence')]: doc.rec,
        [t(language, 'form_notes')]: doc.notes || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 20 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 30 },
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
      Alert.alert(
        t(language, 'settings_export_error'),
        (e as Error)?.message || String(e)
      );
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
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(fileContent, { type: 'base64', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { Alert.alert(t(language, 'settings_import_no_data')); return; }
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) { Alert.alert(t(language, 'settings_import_no_data')); return; }

      const parseDateValue = (raw: any): string => {
        if (raw instanceof Date && !isNaN(raw.getTime())) {
          const y = raw.getFullYear();
          const m = String(raw.getMonth() + 1).padStart(2, '0');
          const d = String(raw.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        if (typeof raw === 'number' && raw > 0) {
          const epoch = new Date((raw - 25569) * 86400 * 1000);
          const y = epoch.getUTCFullYear();
          const m = String(epoch.getUTCMonth() + 1).padStart(2, '0');
          const d = String(epoch.getUTCDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        const str = String(raw || '');
        if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
        const euMatch = str.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
        if (euMatch) return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;
        const usMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
        return '';
      };

      const validCats = Object.keys(CATEGORIES) as CategoryId[];
      const parsedDocs: Omit<RawDocument, 'id'>[] = rows.map((row) => {
        let cat: CategoryId = 'vehicule';
        for (const catId of validCats) {
          const catLabel = t('ro', CATEGORIES[catId].labelKey).toLowerCase();
          const catLabelEn = t('en', CATEGORIES[catId].labelKey).toLowerCase();
          const rowCat = String(row.Category || row.category || row.Categorie || row.cat || '').toLowerCase();
          if (rowCat === catId || rowCat.includes(catLabel) || rowCat.includes(catLabelEn)) {
            cat = catId;
            break;
          }
        }
        const title = String(row.Title || row.title || row.Titlu || row.name || row.Name || '');
        const type = String(row.Type || row.type || row.Tip || '');
        const asset = String(row['Associated with'] || row.asset || row.Asset || row.Asociat || row['Asociat cu'] || '');
        const rawDue = row['Due date'] || row['Data scadentă'] || row['Data scadenta'] || row.due || row.Due || row.Scadenta || row['Scadență'] || '';
        const due = parseDateValue(rawDue);
        const rawAmt = row.Amount ?? row.amount ?? row.Suma ?? row['Sumă'] ?? row['Suma'];
        const amt = rawAmt !== undefined && rawAmt !== null && rawAmt !== '' ? Number(rawAmt) : null;
        const rec = String(row.Recurrence || row.recurrence || row.rec || row.Recurenta || row['Recurență'] || 'none') as RecurrenceValue;
        const notes = String(row.Notes || row.notes || row.Note || row['Notițe'] || '');
        return {
          cat,
          type: type || (language === 'en' ? 'Other' : 'Altele'),
          title,
          asset: asset || undefined,
          due: due || new Date().toISOString().slice(0, 10),
          amt: amt !== null && !isNaN(amt) ? amt : null,
          rec: ['none', 'weekly', 'monthly', 'annual'].includes(rec) ? rec : 'none',
          notes: notes || undefined,
        };
      }).filter((d) => d.title.trim().length > 0);

      if (parsedDocs.length === 0) { Alert.alert(t(language, 'settings_import_no_data')); return; }

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
        const remaining = FREE_DOCUMENT_LIMIT - documents.length;
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

      const msg = skipped > 0
        ? t(language, 'settings_import_confirm_msg', { n: uniqueDocs.length }) +
          `\n(${skipped} ${t(language, 'duplicates_skipped')})`
        : t(language, 'settings_import_confirm_msg', { n: uniqueDocs.length });

      Alert.alert(
        t(language, 'settings_import_confirm_title'),
        msg,
        [
          { text: t(language, 'confirm_cancel'), style: 'cancel' },
          {
            text: t(language, 'settings_import_confirm_btn'),
            onPress: () => {
              addDocuments(uniqueDocs);
              Alert.alert(t(language, 'settings_import_success', { n: uniqueDocs.length }));
            },
          },
        ]
      );
    } catch (e) {
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

  const handleClearAll = () => {
    Alert.alert(
      t(language, 'confirm_clear_title'),
      t(language, 'confirm_clear_msg'),
      [
        { text: t(language, 'confirm_cancel'), style: 'cancel' },
        { text: t(language, 'confirm_clear_btn'), style: 'destructive', onPress: () => clearAll() },
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
            {!isPremium && <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFD700' }}> PRO</Text>}
          </Text>
        </AnimatedPressable>
        <RowDivider theme={theme} />
        <AnimatedPressable style={styles.row} onPress={handleImportExcel} disabled={isLoading} hapticStyle="light" accessibilityLabel={t(language, 'settings_import_excel')}>
          <Ionicons name="download-outline" size={18} color="#007AFF" style={{ marginRight: 8 }} />
          <Text style={[styles.rowLabel, { color: '#007AFF' }]}>
            {t(language, 'settings_import_excel')}
            {!isPremium && <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFD700' }}> PRO</Text>}
          </Text>
        </AnimatedPressable>
        <RowDivider theme={theme} />
        <AnimatedPressable style={styles.row} onPress={handleResetDemo} hapticStyle="light" accessibilityLabel={t(language, 'settings_reset_demo')}>
          <Ionicons name="refresh-outline" size={18} color="#007AFF" style={{ marginRight: 8 }} />
          <Text style={[styles.rowLabel, { color: '#007AFF' }]}>
            {t(language, 'settings_reset_demo')}
          </Text>
        </AnimatedPressable>
        <RowDivider theme={theme} />
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
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowLabel: { fontSize: 17 },
  footerText: { fontSize: 13, lineHeight: 18 },
});
