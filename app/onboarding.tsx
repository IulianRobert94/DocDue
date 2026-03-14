/**
 * Onboarding Screen — Apple HIG 2025 v13
 * Premium first launch experience with floating icons and glow effects
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, useWindowDimensions, ViewToken,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_ONBOARDED } from '../src/core/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage, useTheme, useSettingsStore } from '../src/stores/useSettingsStore';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '../src/components/AnimatedUI';
import {
  requestNotificationPermission,
  rescheduleAllNotifications,
  scheduleMorningDigest,
  scheduleWeeklySummary,
} from '../src/services/notifications';
import { useDocumentStore } from '../src/stores/useDocumentStore';
import { t } from '../src/core/i18n';

import type { IconName } from '../src/types';
import { fonts } from '../src/theme/typography';

interface OnboardingStep {
  icon: IconName;
  iconColor: string;
  glowColor: string;
  titleKey: string;
  descKey: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: 'shield-checkmark',
    iconColor: '#0A79F1',
    glowColor: 'rgba(10,121,241,0.12)',
    titleKey: 'onboarding_slide1_title',
    descKey: 'onboarding_slide1_desc',
  },
  {
    icon: 'color-wand',
    iconColor: '#FF9500',
    glowColor: 'rgba(255,149,0,0.12)',
    titleKey: 'onboarding_slide2_title',
    descKey: 'onboarding_slide2_desc',
  },
  {
    icon: 'notifications',
    iconColor: '#FF3B30',
    glowColor: 'rgba(255,59,48,0.12)',
    titleKey: 'onboarding_slide3_title',
    descKey: 'onboarding_slide3_desc',
  },
  {
    icon: 'lock-closed',
    iconColor: '#34C759',
    glowColor: 'rgba(52,199,89,0.12)',
    titleKey: 'onboarding_slide4_title',
    descKey: 'onboarding_slide4_desc',
  },
];

function AnimatedDot({ active, accessibilityLabel }: { active: boolean; accessibilityLabel?: string }) {
  const width = useRef(new Animated.Value(active ? 28 : 8)).current;
  const bgColor = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(width, { toValue: active ? 28 : 8, useNativeDriver: false, speed: 20, bounciness: 6 }),
      Animated.timing(bgColor, { toValue: active ? 1 : 0, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [active]);

  const backgroundColor = bgColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(60,80,120,0.4)', '#0A79F1'],
  });

  return <Animated.View style={[s.dot, { width, backgroundColor }]} accessibilityLabel={accessibilityLabel} accessibilityRole="tab" />;
}

function FloatingIcon({ icon, color, glowColor, active }: { icon: IconName; color: string; glowColor: string; active: boolean }) {
  const floatY = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) return;
    const floatAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -10, duration: 1800, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowScale, { toValue: 1.15, duration: 2200, useNativeDriver: true }),
        Animated.timing(glowScale, { toValue: 1, duration: 2200, useNativeDriver: true }),
      ])
    );
    const opacityAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.6, duration: 2200, useNativeDriver: true }),
      ])
    );
    floatAnim.start();
    glowAnim.start();
    opacityAnim.start();
    return () => { floatAnim.stop(); glowAnim.stop(); opacityAnim.stop(); };
  }, [active]);

  return (
    <Animated.View style={[s.iconOuter, { transform: [{ translateY: floatY }] }]}>
      <Animated.View style={[s.iconGlow, { backgroundColor: glowColor, transform: [{ scale: glowScale }], opacity: glowOpacity }]} />
      <View style={[s.iconWrap, { backgroundColor: glowColor }]}>
        <Ionicons name={icon} size={64} color={color} />
      </View>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = useLanguage();
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isLastSlide = currentIndex === STEPS.length - 1;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(STORAGE_KEY_ONBOARDED, '1');
    router.replace('/(tabs)');
  };

  const handleNext = async () => {
    try {
      if (currentIndex === 2) {
        const granted = await requestNotificationPermission();
        if (granted) {
          useSettingsStore.getState().updateSetting('notificationsEnabled', true);
          const docs = useDocumentStore.getState().documents;
          const settings = useSettingsStore.getState().settings;
          rescheduleAllNotifications(docs, settings.reminderDays, settings.language).catch(() => {});
          scheduleMorningDigest(docs, settings.language).catch(() => {});
          scheduleWeeklySummary(docs, settings.language).catch(() => {});
        }
      }
      if (isLastSlide) {
        await finishOnboarding();
      } else {
        flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      }
    } catch (e) {
      if (__DEV__) console.warn("DocDue: onboarding next error", e);
    }
  };

  const handleSkip = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_ONBOARDED, '1');
      router.replace('/(tabs)');
    } catch (e) {
      if (__DEV__) console.warn("DocDue: onboarding skip error", e);
    }
  };

  const renderItem = ({ item, index }: { item: OnboardingStep; index: number }) => (
    <View style={[s.slide, { width: screenWidth }]}>
      <FloatingIcon icon={item.icon} color={item.iconColor} glowColor={item.glowColor} active={index === currentIndex} />
      <Text style={[s.title, { color: theme.text }]}>{t(lang, item.titleKey)}</Text>
      <Text style={[s.desc, { color: theme.textSecondary }]}>{t(lang, item.descKey)}</Text>
      <Text style={[s.stepIndicator, { color: theme.textDim }]}>
        {index + 1} / {STEPS.length}
      </Text>
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, backgroundColor: theme.background }]}>
      {!isLastSlide && (
        <AnimatedPressable onPress={handleSkip} style={[s.skipBtn, { top: insets.top + 8 }]} haptic={false}
          accessibilityLabel={t(lang, 'onboarding_skip')} accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[s.skipText, { color: theme.textMuted }]}>{t(lang, 'onboarding_skip')}</Text>
        </AnimatedPressable>
      )}

      <FlatList
        ref={flatListRef}
        data={STEPS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        bounces={false}
        style={s.flatList}
      />

      <View style={s.dots} accessibilityRole="tablist">
        {Array.from({ length: STEPS.length }).map((_, i) => (
          <AnimatedDot
            key={i}
            active={i === currentIndex}
            accessibilityLabel={t(lang, 'a11y_onboarding_dot', { n: String(i + 1), total: String(STEPS.length) })}
          />
        ))}
      </View>

      <View style={s.footer}>
        {currentIndex > 0 ? (
          <AnimatedPressable
            onPress={() => flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true })}
            haptic={false}
            style={s.backBtn}
            accessibilityLabel={t(lang, 'onboarding_back')}
          >
            <Ionicons name="arrow-back" size={20} color={theme.textSecondary} />
          </AnimatedPressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
        <AnimatedPressable onPress={handleNext} style={[s.nextBtn, { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, overflow: 'hidden' }]} scaleValue={0.96} hapticStyle="medium"
          accessibilityLabel={isLastSlide ? t(lang, 'onboarding_start') : t(lang, 'onboarding_next')} accessibilityRole="button">
          <LinearGradient
            colors={['#0E8BFF', '#0A79F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 }}
          >
            <Text style={s.nextText}>
              {isLastSlide ? t(lang, 'onboarding_start') : currentIndex === 2 ? t(lang, 'onboarding_enable_notif') : t(lang, 'onboarding_next')}
            </Text>
            <Ionicons name={isLastSlide ? "checkmark" : currentIndex === 2 ? "notifications" : "arrow-forward"} size={20} color="#FFF" />
          </LinearGradient>
        </AnimatedPressable>
        <View style={{ width: 44 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: { position: 'absolute', right: 20, zIndex: 10, padding: 8 },
  skipText: { fontSize: 17, fontFamily: fonts.regular },
  flatList: { flex: 1 },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconOuter: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  iconGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 48,
  },
  iconWrap: {
    width: 140,
    height: 140,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: fonts.extraBold,
    textAlign: 'center',
    letterSpacing: 0.35,
    lineHeight: 38,
    marginBottom: 14,
  },
  desc: { fontSize: 17, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 26, paddingHorizontal: 8 },
  stepIndicator: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, marginTop: 20, letterSpacing: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(60,80,120,0.4)' },
  footer: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  nextBtn: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  nextText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
});
