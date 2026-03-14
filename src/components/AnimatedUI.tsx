/**
 * DocDue — Shared Animated Components
 *
 * Premium iOS micro-interactions:
 * - AnimatedPressable: scale-on-press (like Apple buttons)
 * - FadeInView: simple fade + slide on mount
 *
 * Compatible with Expo Go (no Reanimated layout animations)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Animated, ViewStyle, StyleProp, Easing, Text, TextStyle } from "react-native";
import * as Haptics from "expo-haptics";

// ─── AnimatedPressable (scale on press) ──────────────

interface AnimatedPressableProps {
  onPress?: () => void;
  onLongPress?: () => void;
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
  onLongPress,
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
      if (hapticStyle === "selection") {
        Haptics.selectionAsync().catch(() => {});
      } else {
        Haptics.impactAsync(
          hapticStyle === "medium"
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light
        ).catch(() => {});
      }
    }
    onPress?.();
  }, [onPress, haptic, hapticStyle]);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        onLongPress={onLongPress}
        style={style}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ ...accessibilityState, disabled: disabled || accessibilityState?.disabled }}
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

// ─── AnimatedCounter (number counting up) ─────────────

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  delay?: number;
  style?: StyleProp<TextStyle>;
}

export function AnimatedCounter({ value, duration = 800, delay = 200, style }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    setDisplay(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const timer = setTimeout(() => {
      const steps = Math.max(1, Math.round(duration / 16));
      let step = 0;
      interval = setInterval(() => {
        step++;
        if (step >= steps) {
          setDisplay(value);
          clearInterval(interval!);
        } else {
          // Cubic ease-out: 1 - (1 - t)^3
          const t = step / steps;
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(Math.round(value * eased));
        }
      }, 16);
    }, delay);
    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [value, duration, delay]);

  return <Text style={style} accessibilityLiveRegion="polite">{display}</Text>;
}

// ─── AnimatedBar (width animates from 0%) ─────────────

interface AnimatedBarProps {
  percentage: number;
  color: string;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedBar({ percentage, color, delay = 300, style }: AnimatedBarProps) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    width.setValue(0);
    const timer = setTimeout(() => {
      Animated.spring(width, {
        toValue: percentage,
        useNativeDriver: false,
        speed: 8,
        bounciness: 3,
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [percentage]);

  const animWidth = width.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[{ width: animWidth, backgroundColor: color }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
    />
  );
}
