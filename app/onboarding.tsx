/**
 * Onboarding Screen — Apple HIG 2025 v12
 * First launch experience — swipeable FlatList with pagination
 * 4th slide: quick-start category picker
 * Respects user language setting
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, useWindowDimensions, ViewToken,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage, useTheme, useSettingsStore } from '../src/stores/useSettingsStore';
import { AnimatedPressable } from '../src/components/AnimatedUI';
import { requestNotificationPermission } from '../src/services/notifications';
import { t } from '../src/core/i18n';

import type { IconName } from '../src/types';

interface OnboardingStep {
  icon: IconName;
  iconColor: string;
  bgColor: string;
  titleKey: string;
  descKey: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: 'shield-checkmark',
    iconColor: '#007AFF',
    bgColor: 'rgba(0,122,255,0.08)',
    titleKey: 'onboarding_slide1_title',
    descKey: 'onboarding_slide1_desc',
  },
  {
    icon: 'color-wand',
    iconColor: '#FF9500',
    bgColor: 'rgba(255,149,0,0.08)',
    titleKey: 'onboarding_slide2_title',
    descKey: 'onboarding_slide2_desc',
  },
  {
    icon: 'notifications',
    iconColor: '#FF3B30',
    bgColor: 'rgba(255,59,48,0.08)',
    titleKey: 'onboarding_slide3_title',
    descKey: 'onboarding_slide3_desc',
  },
  {
    icon: 'lock-closed',
    iconColor: '#34C759',
    bgColor: 'rgba(52,199,89,0.08)',
    titleKey: 'onboarding_slide4_title',
    descKey: 'onboarding_slide4_desc',
  },
];

function AnimatedDot({ active, accessibilityLabel }: { active: boolean; accessibilityLabel?: string }) {
  const width = useRef(new Animated.Value(active ? 24 : 8)).current;
  const bgColor = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(width, { toValue: active ? 24 : 8, useNativeDriver: false, speed: 20, bounciness: 6 }),
      Animated.timing(bgColor, { toValue: active ? 1 : 0, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [active]);

  const backgroundColor = bgColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(60,80,120,0.4)', '#007AFF'],
  });

  return <Animated.View style={[s.dot, { width, backgroundColor }]} accessibilityLabel={accessibilityLabel} accessibilityRole="tab" />;
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
    await AsyncStorage.setItem('dt_onboarded', '1');
    router.replace('/(tabs)');
  };

  const handleNext = async () => {
    try {
      // When leaving the notification slide (index 2), request permission
      if (currentIndex === 2) {
        const granted = await requestNotificationPermission();
        if (granted) {
          useSettingsStore.getState().updateSetting('notificationsEnabled', true);
        }
      }
      if (isLastSlide) {
        await finishOnboarding();
      } else {
        flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      }
    } catch {}
  };

  const handleSkip = async () => {
    try {
      await AsyncStorage.setItem('dt_onboarded', '1');
      router.replace('/(tabs)');
    } catch {}
  };

  const renderItem = ({ item }: { item: OnboardingStep }) => (
    <View style={[s.slide, { width: screenWidth }]}>
      <View style={[s.iconWrap, { backgroundColor: item.bgColor }]}>
        <Ionicons name={item.icon} size={56} color={item.iconColor} />
      </View>
      <Text style={[s.title, { color: theme.text }]}>{t(lang, item.titleKey)}</Text>
      <Text style={[s.desc, { color: theme.textSecondary }]}>{t(lang, item.descKey)}</Text>
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, backgroundColor: theme.background }]}>
      {!isLastSlide && (
        <AnimatedPressable onPress={handleSkip} style={[s.skipBtn, { top: insets.top + 8 }]} haptic={false}>
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
        <AnimatedPressable onPress={handleNext} style={s.nextBtn} scaleValue={0.96} hapticStyle="medium">
          <Text style={s.nextText}>{isLastSlide ? t(lang, 'onboarding_start') : t(lang, 'onboarding_next')}</Text>
          <Ionicons name={isLastSlide ? "checkmark" : "arrow-forward"} size={20} color="#FFF" />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: { position: 'absolute', right: 20, zIndex: 10, padding: 8 },
  skipText: { fontSize: 17 },
  flatList: { flex: 1 },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.35,
    lineHeight: 36,
    marginBottom: 16,
  },
  desc: { fontSize: 17, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(60,80,120,0.4)' },
  footer: { paddingHorizontal: 20 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 16,
  },
  nextText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
