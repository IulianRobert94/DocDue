/**
 * Backup & Restore section for Settings screen
 * Handles JSON backup create/restore with optional attachments
 */

import React from 'react';
import { View, Text, StyleSheet, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';

import { t } from '../../core/i18n';
import { DATA_VERSION, MAX_IMPORT_LIMIT } from '../../core/constants';
import type { RawDocument, AppSettings } from '../../core/constants';
import type { AppTheme } from '../../theme/colors';
import { AnimatedPressable } from '../AnimatedUI';
import { RowDivider } from './SettingsUI';

interface BackupRestoreSectionProps {
  theme: AppTheme;
  language: 'ro' | 'en';
  settings: AppSettings;
  documents: RawDocument[];
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  addDocuments: (docs: Omit<RawDocument, 'id'>[]) => void;
  clearAll: () => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  isPremium: boolean;
  onPremiumGate: () => void;
}

export function BackupRestoreSection({
  theme,
  language,
  settings,
  documents,
  updateSetting,
  addDocuments,
  clearAll,
  isLoading,
  setIsLoading,
  isPremium,
  onPremiumGate,
}: BackupRestoreSectionProps) {

  const handleCreateBackup = async () => {
    if (!isPremium) { onPremiumGate(); return; }
    setIsLoading(true);
    try {
      const includeAttachments = settings.includeAttachmentsInBackup;
      const attachmentsData: Record<string, string> = {};

      if (includeAttachments) {
        for (const doc of documents) {
          if (doc.attachments) {
            for (const att of doc.attachments) {
              try {
                const info = await FileSystem.getInfoAsync(att.uri);
                if (info.exists) {
                  const base64 = await FileSystem.readAsStringAsync(att.uri, { encoding: FileSystem.EncodingType.Base64 });
                  attachmentsData[`${doc.id}_${att.id}`] = base64;
                }
              } catch {
                // Skip unreadable files
              }
            }
          }
        }
      }

      const backup = {
        dataVersion: DATA_VERSION,
        appVersion: Constants.expoConfig?.version || '1.0.0',
        timestamp: new Date().toISOString(),
        documents,
        settings,
        documentCount: documents.length,
        hasAttachments: Object.keys(attachmentsData).length > 0,
        attachments: Object.keys(attachmentsData).length > 0 ? attachmentsData : undefined,
      };
      const json = JSON.stringify(backup, null, 2);
      const fileName = `docdue-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, json);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t(language, 'alert_notice'), t(language, 'sharing_unavailable'));
        return;
      }
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: t(language, 'backup_create'),
      });
      updateSetting('lastBackupDate', new Date().toISOString());
      Alert.alert(t(language, 'alert_success'), t(language, 'backup_success'));
    } catch (e: unknown) {
      if (__DEV__) console.error('DocDue backup error:', e);
      Alert.alert(t(language, 'backup_error'), (e as Error)?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const restoreAttachmentFiles = async (docs: RawDocument[], attachmentsData: Record<string, string>) => {
    const dir = `${FileSystem.documentDirectory}attachments/`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    for (const doc of docs) {
      if (doc.attachments) {
        for (const att of doc.attachments) {
          const key = `${doc.id}_${att.id}`;
          const base64 = attachmentsData[key];
          const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB base64 limit
          const isValidPath = att.uri && att.uri.startsWith('file://') && att.uri.includes('/attachments/') && !att.uri.includes('..');
          if (base64 && base64.length < MAX_ATTACHMENT_SIZE && isValidPath) {
            try {
              await FileSystem.writeAsStringAsync(att.uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            } catch {
              // Skip failed writes
            }
          }
        }
      }
    }
  };

  const handleRestoreBackup = async () => {
    if (!isPremium) { onPremiumGate(); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
      let backup: { documents?: RawDocument[]; settings?: Partial<AppSettings>; attachments?: Record<string, string> };
      try {
        backup = JSON.parse(fileContent);
      } catch {
        Alert.alert(t(language, 'restore_invalid'));
        return;
      }

      if (!backup.documents || !Array.isArray(backup.documents)) {
        Alert.alert(t(language, 'restore_invalid'));
        return;
      }

      if (backup.documents.length > MAX_IMPORT_LIMIT) {
        Alert.alert(t(language, 'alert_error'), t(language, 'import_too_large', { max: MAX_IMPORT_LIMIT }));
        return;
      }

      // Validate each document has required fields
      const backupDocs = backup.documents.filter((d: any): d is RawDocument =>
        d && typeof d === 'object' &&
        typeof d.id === 'string' &&
        typeof d.title === 'string' &&
        typeof d.due === 'string' &&
        typeof d.cat === 'string' &&
        typeof d.type === 'string' &&
        ['vehicule', 'casa', 'personal', 'financiar'].includes(d.cat) &&
        /^\d{4}-\d{2}-\d{2}$/.test(d.due) &&
        ['none', 'weekly', 'monthly', 'annual'].includes(d.rec || 'none')
      );

      if (backupDocs.length === 0) {
        Alert.alert(t(language, 'restore_invalid'));
        return;
      }
      const docCount = backupDocs.length;

      Alert.alert(
        t(language, 'restore_confirm'),
        t(language, 'restore_choose') + `\n\n${docCount} ${t(language, docCount === 1 ? 'doc_singular' : 'doc_plural')}`,
        [
          { text: t(language, 'confirm_cancel'), style: 'cancel' },
          {
            text: t(language, 'restore_merge'),
            onPress: async () => {
              setIsLoading(true);
              try {
                const existingKeys = new Set(
                  documents.map((d) => `${d.title}|${d.due}|${d.cat}`)
                );
                const newDocs = backupDocs.filter(
                  (d: RawDocument) => !existingKeys.has(`${d.title}|${d.due}|${d.cat}`)
                );
                if (newDocs.length > 0) {
                  const docsWithoutId = newDocs.map((d: RawDocument) => {
                    const { id, ...rest } = d;
                    return rest;
                  });
                  addDocuments(docsWithoutId);
                }
                if (backup.attachments) {
                  await restoreAttachmentFiles(backupDocs, backup.attachments);
                }
                Alert.alert(t(language, 'alert_success'), t(language, 'restore_success'));
              } finally {
                setIsLoading(false);
              }
            },
          },
          {
            text: t(language, 'restore_replace'),
            style: 'destructive',
            onPress: async () => {
              setIsLoading(true);
              try {
                clearAll();
                const docsWithoutId = backupDocs.map((d: RawDocument) => {
                  const { id, ...rest } = d;
                  return rest;
                });
                addDocuments(docsWithoutId);
                if (backup.settings) {
                  const { biometricEnabled, lastBackupDate, isPremium, ...restoreSettings } = backup.settings;
                  Object.entries(restoreSettings).forEach(([key, value]) => {
                    if (key in settings) {
                      updateSetting(key as keyof AppSettings, value as never);
                    }
                  });
                }
                if (backup.attachments) {
                  await restoreAttachmentFiles(backupDocs, backup.attachments);
                }
                Alert.alert(t(language, 'alert_success'), t(language, 'restore_success'));
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert(t(language, 'restore_error'));
    }
  };

  return (
    <>
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
        {t(language, 'backup_section')}
      </Text>
      <View style={[styles.group, { backgroundColor: theme.card }]}>
        <AnimatedPressable style={styles.row} onPress={handleCreateBackup} disabled={isLoading} hapticStyle="light" accessibilityLabel={t(language, 'backup_create')}>
          <Ionicons name="cloud-upload-outline" size={18} color="#007AFF" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: '#007AFF' }]}>
              {t(language, 'backup_create')}
              {!isPremium && <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFD700' }}> PRO</Text>}
            </Text>
            {settings.lastBackupDate && (
              <Text style={[styles.footerText, { color: theme.textMuted, marginTop: 2 }]}>
                {t(language, 'backup_last')}: {new Date(settings.lastBackupDate).toLocaleDateString(language === 'ro' ? 'ro-RO' : 'en-US')}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </AnimatedPressable>
        <RowDivider theme={theme} />
        <AnimatedPressable style={styles.row} onPress={handleRestoreBackup} disabled={isLoading} hapticStyle="light" accessibilityLabel={t(language, 'backup_restore')}>
          <Ionicons name="cloud-download-outline" size={18} color="#007AFF" style={{ marginRight: 8 }} />
          <Text style={[styles.rowLabel, { color: '#007AFF', flex: 1 }]}>
            {t(language, 'backup_restore')}
            {!isPremium && <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFD700' }}> PRO</Text>}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </AnimatedPressable>
        <RowDivider theme={theme} />
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              {t(language, 'backup_include_attachments')}
            </Text>
            <Text style={[styles.footerText, { color: theme.textMuted, marginTop: 2 }]}>
              {t(language, 'backup_include_desc')}
            </Text>
          </View>
          <Switch
            value={settings.includeAttachmentsInBackup}
            onValueChange={(v) => updateSetting('includeAttachmentsInBackup', v)}
            trackColor={{ false: theme.divider, true: '#34C759' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={theme.divider}
            accessibilityLabel={t(language, 'backup_include_attachments')}
          />
        </View>
      </View>
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
