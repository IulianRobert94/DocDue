/**
 * Privacy Policy Screen — iOS Native Style
 * Full-page scroll with grouped sections
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useLanguage } from '../src/stores/useSettingsStore';
import { t } from '../src/core/i18n';
import { AnimatedPressable } from '../src/components/AnimatedUI';
import { fonts } from '../src/theme/typography';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const language = useLanguage();
  const router = useRouter();

  const sectionKeys = ['data_collected', 'permissions', 'storage', 'sharing', 'deletion', 'contact'] as const;
  const sections = sectionKeys.map((key) => ({
    title: t(language, `privacy_${key}_title`),
    body: t(language, `privacy_${key}_body`),
  }));

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}>
        {/* Header */}
        <View style={s.headerRow}>
          <AnimatedPressable onPress={() => router.back()} style={s.backBtn} hapticStyle="light" accessibilityLabel={t(language, 'a11y_go_back')}>
            <Ionicons name="chevron-back" size={28} color={theme.primary} />
          </AnimatedPressable>
          <View style={{ flex: 1 }} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Ionicons name="shield-checkmark" size={40} color={theme.primary} style={{ marginBottom: 12 }} />
          <Text style={[s.largeTitle, { color: theme.text }]} accessibilityRole="header">
            {t(language, 'settings_privacy')}
          </Text>
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>
            {t(language, 'privacy_last_updated')}
          </Text>
        </View>

        {sections.map((section, i) => (
          <View key={i} style={{ marginBottom: 12 }}>
            <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
              {section.title.toUpperCase()}
            </Text>
            <View style={[s.group, { backgroundColor: theme.card }]}>
              <Text style={[s.bodyText, { color: theme.text }]}>{section.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  largeTitle: { fontSize: 34, fontWeight: '700', fontFamily: fonts.bold },
  subtitle: { fontSize: 13, fontFamily: fonts.regular, marginTop: 4 },
  sectionHeader: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, textTransform: 'uppercase', paddingHorizontal: 20, paddingBottom: 8, letterSpacing: 0.5 },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  bodyText: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 22, padding: 16 },
});
