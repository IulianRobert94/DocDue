/**
 * Premium Paywall Screen — Apple HIG 2025
 * Animated paywall with pricing tiers + restore purchases
 * Uses react-native-iap (direct Apple StoreKit / Google Play Billing)
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, Animated, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, useLanguage, useSettingsStore } from '../src/stores/useSettingsStore';
import { t } from '../src/core/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable, FadeInView } from '../src/components/AnimatedUI';
import {
  isIAPConfigured,
  getOfferings,
  purchasePackage,
  restorePurchases,
  type IAPPackage,
} from '../src/services/iap';

import type { IconName } from '../src/types';
import { fonts } from '../src/theme/typography';

const PRO_FEATURES: ReadonlyArray<{ icon: IconName; color: string; key: string }> = [
  { icon: 'documents', color: '#0A79F1', key: 'premium_feature_unlimited' },
  { icon: 'bar-chart', color: '#34C759', key: 'premium_feature_analytics' },
  { icon: 'cloud-upload', color: '#5856D6', key: 'premium_feature_backup' },
  { icon: 'grid', color: '#FF9500', key: 'premium_feature_export' },
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const isPremium = useSettingsStore((s) => s.settings.isPremium);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const [packages, setPackages] = useState<IAPPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<IAPPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const purchaseInProgress = useRef(false);

  // Animated badge glow
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => { anim.stop(); glowAnim.setValue(0); };
  }, []);

  // Load offerings from store
  useEffect(() => {
    if (isIAPConfigured() && !isPremium) {
      getOfferings().then((pkgs) => {
        setPackages(pkgs);
        // Default-select lifetime (one-time purchase)
        const lifetime = pkgs.find((p) => p.type === 'lifetime');
        setSelectedPkg(lifetime || pkgs[0] || null);
      }).catch(() => {});
    }
  }, [isPremium]);

  const handlePurchase = async () => {
    if (!selectedPkg || purchaseInProgress.current) return;
    purchaseInProgress.current = true;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const result = await purchasePackage(selectedPkg.productId);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        updateSetting('isPremium', true);
        router.back();
      } else if (!result.cancelled) {
        Alert.alert(t(language, 'alert_error'), result.error || t(language, 'purchase_error'));
      }
    } finally {
      setLoading(false);
      purchaseInProgress.current = false;
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        updateSetting('isPremium', true);
        Alert.alert(t(language, 'alert_success'), t(language, 'iap_restore_ok'));
        router.back();
      } else {
        Alert.alert(t(language, 'alert_notice'), t(language, 'iap_restore_none'));
      }
    } finally {
      setRestoring(false);
    }
  };

  const iapReady = isIAPConfigured() && packages.length > 0;
  const badgeScale = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const badgeOpacity = glowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1, 0.8] });

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}>
        {/* Modal handle + close */}
        <FadeInView delay={0} style={s.closeRow}>
          <View style={{ width: 60 }} />
          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0.08)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.grabber}
          />
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ width: 60, alignItems: 'flex-end' }}
            accessibilityLabel={t(language, 'a11y_close_modal')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            haptic={false}
          >
            <View style={[s.closeCircle, { backgroundColor: theme.inputFillStrong }]}>
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        {/* Animated Hero */}
        <FadeInView delay={100} style={s.hero}>
          <Animated.View style={[s.proBadge, { transform: [{ scale: badgeScale }], opacity: badgeOpacity }]}>
            <Ionicons name="shield-checkmark" size={48} color="#FFD700" />
          </Animated.View>
          <Text style={[s.heroTitle, { color: theme.text }]} accessibilityRole="header">{t(language, 'premium_title')}</Text>
          <Text style={[s.heroSub, { color: theme.textMuted }]}>{t(language, 'premium_subtitle')}</Text>
        </FadeInView>

        {/* Feature List */}
        <FadeInView delay={200} style={[s.group, { backgroundColor: theme.card }]}>
          {PRO_FEATURES.map((feat, i) => (
            <View key={feat.key}>
              <View style={s.featureRow}>
                <View style={[s.featureIcon, { backgroundColor: feat.color + '14' }]}>
                  <Ionicons name={feat.icon} size={22} color={feat.color} />
                </View>
                <Text style={[s.featureText, { color: theme.text }]}>{t(language, feat.key)}</Text>
                <Ionicons name="checkmark-circle" size={22} color="#34C759" />
              </View>
              {i < PRO_FEATURES.length - 1 && (
                <View style={{ paddingLeft: 60 }}>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                </View>
              )}
            </View>
          ))}
        </FadeInView>

        {/* Action Buttons */}
        <FadeInView delay={300} style={s.actions}>
          {isPremium ? (
            <View style={s.activeBadge}>
              <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              <Text style={[s.activeText, { color: '#34C759' }]}>{t(language, 'premium_active')}</Text>
            </View>
          ) : iapReady ? (
            <>
              {/* Pricing Tiers */}
              <View style={s.tierRow}>
                {packages.map((pkg) => {
                  const isSelected = selectedPkg?.id === pkg.id;
                  const isBestValue = pkg.type === 'annual';
                  return (
                    <AnimatedPressable
                      key={pkg.id}
                      style={[
                        s.tierCard,
                        { backgroundColor: theme.card, borderColor: isSelected ? theme.primary : theme.divider },
                        isSelected && { borderColor: theme.primary, backgroundColor: theme.primary + '0F', shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
                      ]}
                      onPress={() => setSelectedPkg(pkg)}
                      hapticStyle="selection"
                      accessibilityLabel={`${t(language, `plan_${pkg.type}`)} ${pkg.price}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      {isBestValue && (
                        <View style={s.bestValueBadge}>
                          <Text style={s.bestValueText}>{t(language, 'plan_best_value')}</Text>
                        </View>
                      )}
                      <Text style={[s.tierType, { color: isSelected ? theme.primary : theme.textSecondary }]}>
                        {t(language, `plan_${pkg.type}`)}
                      </Text>
                      <Text style={[s.tierPrice, { color: isSelected ? theme.text : theme.textSecondary }]}>
                        {pkg.price}
                      </Text>
                      {pkg.pricePerMonth && (
                        <Text style={[s.tierPerMonth, { color: theme.textMuted }]}>
                          {pkg.pricePerMonth}/{t(language, 'plan_month')}
                        </Text>
                      )}
                    </AnimatedPressable>
                  );
                })}
              </View>

              {/* Purchase button */}
              <AnimatedPressable
                style={[s.upgradeBtn, { shadowColor: theme.primary, overflow: 'hidden' }, loading && { opacity: 0.7 }]}
                onPress={handlePurchase}
                hapticStyle="medium"
                disabled={loading || !selectedPkg}
              >
                <LinearGradient
                  colors={['#0E8BFF', '#0A79F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
                  ) : (
                    <Ionicons name="lock-open" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  )}
                  <Text style={s.upgradeBtnText}>
                    {t(language, 'premium_subscribe')}{selectedPkg?.price ? ` — ${selectedPkg.price}` : ''}
                  </Text>
                </LinearGradient>
              </AnimatedPressable>

              {/* Restore purchases — REQUIRED by Apple */}
              <AnimatedPressable onPress={handleRestore} haptic={false} disabled={restoring} style={s.restoreBtn}>
                {restoring ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Text style={[s.restoreText, { color: theme.primary }]}>{t(language, 'premium_restore')}</Text>
                )}
              </AnimatedPressable>

              {/* Purchase terms — REQUIRED by Apple */}
              <Text style={[s.termsText, { color: theme.textMuted }]}>
                {t(language, 'premium_terms')}
              </Text>
              <Text style={[s.termsText, { color: theme.textMuted }]}>
                <Text
                  style={{ color: theme.primary }}
                  onPress={() => Linking.openURL('https://iulianrobert94.github.io/DocDue/terms.html').catch(() => {})}
                >
                  {t(language, 'premium_terms_of_use')}
                </Text>
                {'  ·  '}
                <Text
                  style={{ color: theme.primary }}
                  onPress={() => Linking.openURL('https://iulianrobert94.github.io/DocDue/privacy.html').catch(() => {})}
                >
                  {t(language, 'premium_privacy_link')}
                </Text>
              </Text>
            </>
          ) : (
            <>
              {/* IAP not available — show restore + informational message */}
              <Text style={[s.earlyAccessNote, { color: theme.textMuted }]}>
                {t(language, 'premium_unavailable_note')}
              </Text>
              <AnimatedPressable onPress={handleRestore} haptic={false} disabled={restoring} style={s.restoreBtn}>
                {restoring ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Text style={[s.restoreText, { color: theme.primary }]}>{t(language, 'premium_restore')}</Text>
                )}
              </AnimatedPressable>
            </>
          )}
        </FadeInView>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  closeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 4 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  closeCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center', paddingVertical: 32 },
  proBadge: {
    width: 96, height: 96, borderRadius: 22,
    backgroundColor: 'rgba(255,215,0,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  heroTitle: { fontSize: 32, fontWeight: '800', fontFamily: fonts.extraBold, letterSpacing: 0.35 },
  heroSub: { fontSize: 17, fontFamily: fonts.regular, marginTop: 4 },

  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, minHeight: 60 },
  featureIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  featureText: { fontSize: 17, fontFamily: fonts.regular, flex: 1 },

  actions: { paddingHorizontal: 16, paddingTop: 32, gap: 12 },

  // Pricing tiers
  tierRow: { flexDirection: 'row', gap: 10 },
  tierCard: {
    flex: 1, borderRadius: 16, borderWidth: 2, padding: 14, alignItems: 'center',
  },
  tierType: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  tierPrice: { fontSize: 22, fontWeight: '700', fontFamily: fonts.bold, marginTop: 4 },
  tierPerMonth: { fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  bestValueBadge: {
    position: 'absolute', top: -10, alignSelf: 'center',
    backgroundColor: '#FF9500', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
  },
  bestValueText: { color: '#FFF', fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, textTransform: 'uppercase' },

  upgradeBtn: {
    borderRadius: 16, overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 8,
  },
  upgradeBtnText: { color: '#FFF', fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  earlyAccessNote: { fontSize: 15, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  activeText: { fontSize: 20, fontWeight: '700', fontFamily: fonts.bold },

  restoreBtn: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { fontSize: 15, fontFamily: fonts.regular },
  termsText: { fontSize: 11, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 16, marginTop: 4 },
});
