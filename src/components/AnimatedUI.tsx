/**
 * DocDue — Shared Animated Components
 *
 * Premium iOS micro-interactions:
 * - AnimatedPressable: scale-on-press (like Apple buttons)
 * - FadeInView: simple fade + slide on mount
 *
 * Compatible with Expo Go (no Reanimated layout animations)
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, Animated, ViewStyle, StyleProp, Easing } from "react-native";
import * as Haptics from "expo-haptics";

// ─── AnimatedPressable (scale on press) ──────────────

interface AnimatedPressableProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  scaleValue?: number;
  haptic?: boolean;
  hapticStyle?: "light" | "medium" | "selection";
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link" | "none";
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean | 'mixed'; busy?: boolean; expanded?: boolean };
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  disabled?: boolean;
}

export const AnimatedPressable = React.memo(function AnimatedPressable({
  onPress,
  style,
  children,
  scaleValue = 0.97,
  haptic = true,
  hapticStyle = "light",
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  hitSlop,
  disabled,
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleValue,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleValue]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, []);

  const handlePress = useCallback(() => {
    if (haptic) {
      try {
        if (hapticStyle === "selection") {
          Haptics.selectionAsync();
        } else {
          Haptics.impactAsync(
            hapticStyle === "medium"
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light
          );
        }
      } catch {}
    }
    onPress?.();
  }, [onPress, haptic, hapticStyle]);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={style}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        hitSlop={hitSlop}
        disabled={disabled}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

// ─── FadeInView (simple fade + slide on mount) ──────

interface FadeInViewProps {
  delay?: number;
  duration?: number;
  slideY?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FadeInView({
  delay = 0,
  duration = 300,
  slideY = 12,
  children,
  style,
}: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(slideY)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── AnimatedSection (staggered fade-in) ─────────────

interface AnimatedSectionProps {
  index: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedSection({ index, children, style }: AnimatedSectionProps) {
  return (
    <FadeInView delay={60 + index * 50} style={style}>
      {children}
    </FadeInView>
  );
}
