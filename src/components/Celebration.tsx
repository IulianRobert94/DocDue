/**
 * Celebration — Lightweight confetti burst for key moments
 */

import React, { useEffect } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";

const PARTICLE_COUNT = 14;
const COLORS = ["#0A79F1", "#34C759", "#FF9500", "#FF3B30", "#FFD700", "#AF52DE", "#5856D6"];

interface CelebrationProps {
  trigger: boolean;
}

function Particle({ index, trigger }: { index: number; trigger: boolean }) {
  const { width, height } = useWindowDimensions();
  const centerX = width / 2;
  const centerY = height / 2 - 50;

  const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
  const distance = 120 + Math.random() * 80;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance - 60; // bias upward
  const size = 6 + Math.random() * 6;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (trigger) {
      const delay = index * 30;
      scale.value = withDelay(delay, withSpring(1, { damping: 8, stiffness: 200 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 150 }));
      translateX.value = withDelay(delay, withTiming(targetX, { duration: 800, easing: Easing.out(Easing.cubic) }));
      translateY.value = withDelay(delay, withTiming(targetY, { duration: 800, easing: Easing.out(Easing.cubic) }));
      // Fade out
      opacity.value = withDelay(delay + 600, withTiming(0, { duration: 400 }));
      scale.value = withDelay(delay + 600, withTiming(0.3, { duration: 400 }));
    } else {
      translateX.value = 0;
      translateY.value = 0;
      scale.value = 0;
      opacity.value = 0;
    }
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: centerX - size / 2,
          top: centerY - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: COLORS[index % COLORS.length],
        },
        style,
      ]}
    />
  );
}

export function Celebration({ trigger }: CelebrationProps) {
  if (!trigger) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no" accessibilityElementsHidden>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle key={i} index={i} trigger={trigger} />
      ))}
    </View>
  );
}
