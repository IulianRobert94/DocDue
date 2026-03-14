/**
 * Shimmer — Skeleton loading with animated shine effect
 * Replaces ActivityIndicator for premium feel
 */

import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

interface ShimmerProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}

export function Shimmer({ width, height, borderRadius = 6, style }: ShimmerProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-200, 200]) }],
  }));

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "rgba(255,255,255,0.04)",
          overflow: "hidden",
        },
        style,
      ]}
      accessible
      accessibilityLabel="Loading"
      importantForAccessibility="yes"
    >
      <AnimatedLinearGradient
        colors={[
          "rgba(255,255,255,0)",
          "rgba(255,255,255,0.06)",
          "rgba(255,255,255,0)",
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { width: 200 }, animatedStyle]}
      />
    </View>
  );
}

/** Pre-built skeleton that mimics a card with title + subtitle + rows */
export function ShimmerCard() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Shimmer width="60%" height={14} borderRadius={4} />
      <Shimmer width="40%" height={10} borderRadius={4} />
      <View style={{ height: 8 }} />
      <Shimmer width="100%" height={44} borderRadius={10} />
      <Shimmer width="100%" height={44} borderRadius={10} />
      <Shimmer width="100%" height={44} borderRadius={10} />
    </View>
  );
}
