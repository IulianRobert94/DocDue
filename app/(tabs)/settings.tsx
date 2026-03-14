/**
 * Settings Screen — iOS Native Style
 * Grouped table view pattern (ca Apple Settings)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
  Share,
  Platform,
  Linking,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ExpoNotifications from 'expo-notifications';
import {
  useTheme,
  useLanguage,
  useSettingsStore,
} from '../../src/stores/useSettingsStore';
import { useDocumentStore } from '../../src/stores/useDocumentStore';
import { t } from '../../src/core/i18n';
import { REMINDER_DAYS_OPTIONS, CURRENCY_OPTIONS, CATEGORIES, FREE_DOCUMENT_LIMIT } from '../../src/core/constants';
import {
  requestNotificationPermission,
  rescheduleAllNotifications,
} from '../../src/services/notifications';
import { AnimatedPressable } from '../../src/components/AnimatedUI';
import { RowDivider, InfoRow, SegmentedControl } from '../../src/components/settings/SettingsUI';
import { BackupRestoreSection } from '../../src/components/settings/BackupRestoreSection';
import { DataSection } from '../../src/components/settings/DataSection';
import { fonts } from '../../src/theme/typography';

// ─── Main Settings Screen ───────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const language = useLanguage();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const documents = useDocumentStore((s) => s.documents);
  const addDocuments = useDocumentStore((s) => s.addDocuments);
  const resetToDemo = useDocumentStore((s) => s.resetToDemo);
  const clearAll = useDocumentStore((s) => s.clearAll);

  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Safety timeout: if loading overlay is stuck for 30s, dismiss it
  useEffect(() => {
    if (!isLoading) return;
    const timeout = setTimeout(() => setIsLoading(false), 30000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then((has) => {
      if (has) {
        LocalAuthentication.isEnrolledAsync().then((enrolled) => {
          setBiometricAvailable(enrolled);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const handleToggleNotifications = async (enabled: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          t(language, 'notif_permission_title'),
          t(language, 'notif_permission_denied'),
        );
        return;
      }
      updateSetting('notificationsEnabled', true);
      rescheduleAllNotifications(documents, settings.reminderDays, language).catch(() => {});
    } else {
      updateSetting('notificationsEnabled', false);
      ExpoNotifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    }
  };

  const handleToggleReminderDay = (day: number) => {
    const current = settings.reminderDays;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => b - a);
    updateSetting('reminderDays', next);
    if (settings.notificationsEnabled) {
      rescheduleAllNotifications(documents, next, language).catch(() => {});
    }
  };

  const onPremiumGate = () => router.push('/premium');

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {isLoading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textSecondary, fontSize: 14, fontFamily: fonts.regular, marginTop: 12 }}>
            {t(language, 'settings_processing')}
          </Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {/* Large Title — iOS style */}
        <Text style={[s.largeTitle, { color: theme.text }]} accessibilityRole="header">
          {t(language, 'settings_title')}
        </Text>

        {/* ─── Premium ──────────────────────────── */}
        <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
          {t(language, 'premium_section')}
        </Text>
        <View style={[s.group, { backgroundColor: theme.card }]}>
          <AnimatedPressable
            style={s.row}
            onPress={() => router.push('/premium')}
            accessibilityLabel={t(language, 'premium_title')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons
                name={settings.isPremium ? 'shield-checkmark' : 'star-outline'}
                size={18}
                color={settings.isPremium ? '#FFD700' : theme.primary}
                style={{ marginRight: 8 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.rowLabel, { color: settings.isPremium ? '#FFD700' : theme.primary }]}>
                  {t(language, settings.isPremium ? 'premium_active' : 'premium_upgrade')}
                </Text>
                {!settings.isPremium && (
                  <Text style={[s.footerText, { color: theme.textMuted, marginTop: 2 }]}>
                    {t(language, 'premium_free_count', { n: documents.length, max: FREE_DOCUMENT_LIMIT })}
                  </Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </AnimatedPressable>
          <RowDivider theme={theme} />
          <AnimatedPressable
            style={s.row}
            onPress={() => {
              router.push(settings.isPremium ? '/analytics' : '/premium');
            }}
            accessibilityLabel={t(language, 'analytics_title')}
          >
            <Ionicons name="bar-chart-outline" size={18} color="#34C759" style={{ marginRight: 8 }} />
            <Text style={[s.rowLabel, { color: '#34C759', flex: 1 }]}>
              {t(language, 'analytics_title')}
              {!settings.isPremium && <Text style={{ fontSize: 11, fontWeight: '700', fontFamily: fonts.bold, color: '#FFD700' }}> PRO</Text>}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </AnimatedPressable>
        </View>

        {/* ─── Appearance ─────────────────────────── */}
        <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
          {t(language, 'settings_appearance')}
        </Text>
        <View style={[s.group, { backgroundColor: theme.card }]}>
          <View style={s.row}>
            <Text style={[s.rowLabel, { color: theme.text }]}>
              {t(language, 'settings_language')}
            </Text>
            <SegmentedControl
              options={[
                { value: 'ro', label: 'RO' },
                { value: 'en', label: 'EN' },
              ]}
              selected={language}
              onSelect={(v) => updateSetting('language', v as 'ro' | 'en')}
              theme={theme}
            />
          </View>
          <RowDivider theme={theme} />
          <View style={s.row}>
            <Text style={[s.rowLabel, { color: theme.text }]}>
              {t(language, 'settings_currency')}
            </Text>
            <SegmentedControl
              options={CURRENCY_OPTIONS.map((o) => ({ value: o.value, label: o.value }))}
              selected={settings.currency}
              onSelect={(v) => updateSetting('currency', v as 'RON' | 'EUR' | 'USD')}
              theme={theme}
            />
          </View>
        </View>

        {/* ─── Notifications ──────────────────────── */}
        <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
          {t(language, 'settings_notifications')}
        </Text>
        <View style={[s.group, { backgroundColor: theme.card }]}>
          <View style={s.row}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[s.rowLabel, { color: theme.text }]}>
                {t(language, 'settings_notifications_enable')}
              </Text>
              <Text style={[s.footerText, { color: theme.textSecondary, marginTop: 2 }]}>
                {t(language, 'settings_notifications_desc')}
              </Text>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: theme.divider, true: '#34C759' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.divider}
              accessibilityLabel={t(language, 'settings_notifications_enable')}
            />
          </View>
          {settings.notificationsEnabled && (
            <>
              <RowDivider theme={theme} />
              <View style={[s.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <Text style={[s.rowLabel, { color: theme.text, marginBottom: 4 }]}>
                  {t(language, 'settings_reminder_days')}
                </Text>
                <Text style={[s.footerText, { color: theme.textSecondary }]}>
                  {t(language, 'settings_smart_reminders_desc')}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ─── Security ─────────────────────────── */}
        {biometricAvailable && (
          <>
            <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
              {t(language, 'biometric_section')}
            </Text>
            <View style={[s.group, { backgroundColor: theme.card }]}>
              <View style={s.row}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[s.rowLabel, { color: theme.text }]}>
                    {t(language, 'biometric_lock')}
                  </Text>
                  <Text style={[s.footerText, { color: theme.textSecondary, marginTop: 2 }]}>
                    {t(language, 'biometric_desc')}
                  </Text>
                </View>
                <Switch
                  value={settings.biometricEnabled}
                  onValueChange={async (val) => {
                    Haptics.selectionAsync().catch(() => {});
                    try {
                      if (val) {
                        const result = await LocalAuthentication.authenticateAsync({
                          promptMessage: t(language, 'biometric_lock'),
                          cancelLabel: t(language, 'confirm_cancel'),
                        });
                        if (result.success) {
                          updateSetting('biometricEnabled', true);
                        }
                      } else {
                        updateSetting('biometricEnabled', false);
                      }
                    } catch {}
                  }}
                  trackColor={{ false: theme.divider, true: '#34C759' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.divider}
                  accessibilityLabel={t(language, 'biometric_lock')}
                />
              </View>
            </View>
          </>
        )}

        {/* ─── Info ──────────────────────────────── */}
        <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
          {t(language, 'settings_general')}
        </Text>
        <View style={[s.group, { backgroundColor: theme.card }]}>
          <InfoRow
            label={t(language, 'settings_total_docs')}
            value={String(documents.length)}
            theme={theme}
          />
          <RowDivider theme={theme} />
          <InfoRow
            label={t(language, 'settings_version')}
            value={Constants.expoConfig?.version || '1.0.0'}
            theme={theme}
          />
        </View>

        {/* ─── Privacy ──────────────────────────── */}
        <View style={[s.group, { backgroundColor: theme.card, marginTop: 24 }]}>
          <AnimatedPressable
            style={s.row}
            onPress={() => router.push('/privacy')}
            accessibilityLabel={t(language, 'settings_privacy')}
          >
            <Text style={[s.rowLabel, { color: theme.primary }]}>
              {t(language, 'settings_privacy')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </AnimatedPressable>
          <RowDivider theme={theme} />
          <AnimatedPressable
            style={s.row}
            onPress={() => Linking.openURL('mailto:andreiiulianrobert@gmail.com?subject=DocDue%20Support').catch(() => {})}
            accessibilityLabel={t(language, 'settings_contact_support')}
          >
            <Ionicons name="mail-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
            <Text style={[s.rowLabel, { color: theme.primary, flex: 1 }]}>
              {t(language, 'settings_contact_support')}
            </Text>
            <Ionicons name="open-outline" size={16} color={theme.textMuted} />
          </AnimatedPressable>
        </View>
        <Text style={[s.footerText, { color: theme.textSecondary, marginHorizontal: 20, marginTop: 6 }]}>
          {t(language, 'settings_privacy_footer')}
        </Text>

        {/* ─── Share DocDue ──────────────────────── */}
        <View style={[s.group, { backgroundColor: theme.card, marginTop: 24 }]}>
          <AnimatedPressable
            style={s.row}
            onPress={() => {
              const url = Platform.OS === 'ios'
                ? 'https://apps.apple.com/app/id6760433928'
                : 'https://play.google.com/store/apps/details?id=com.docdueapp';
              Share.share({
                message: t(language, 'share_app_message') + '\n' + url,
              }).catch(() => {});
            }}
            accessibilityLabel={t(language, 'share_app')}
            hapticStyle="selection"
          >
            <Ionicons name="heart-outline" size={18} color="#FF2D55" style={{ marginRight: 8 }} />
            <Text style={[s.rowLabel, { color: '#FF2D55', flex: 1 }]}>
              {t(language, 'share_app')}
            </Text>
            <Ionicons name="share-outline" size={18} color={theme.textMuted} />
          </AnimatedPressable>
        </View>

        {/* ─── Backup & Restore ────────────────── */}
        <BackupRestoreSection
          theme={theme}
          language={language}
          settings={settings}
          documents={documents}
          updateSetting={updateSetting}
          addDocuments={addDocuments}
          clearAll={clearAll}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          isPremium={settings.isPremium}
          onPremiumGate={onPremiumGate}
        />

        {/* ─── Data ──────────────────────────────── */}
        <DataSection
          theme={theme}
          language={language}
          settings={settings}
          documents={documents}
          addDocuments={addDocuments}
          resetToDemo={resetToDemo}
          clearAll={clearAll}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          isPremium={settings.isPremium}
          onPremiumGate={onPremiumGate}
        />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: 'rgba(5,10,20,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeTitle: {
    fontSize: 34,
    fontFamily: fonts.bold,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',

  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowLabel: { fontSize: 17, fontFamily: fonts.regular },
  footerText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
});
