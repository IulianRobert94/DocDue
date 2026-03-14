/**
 * Toast — Non-blocking success/error/info notification
 * Slides in from top with spring animation, auto-dismisses
 * Supports optional action button (e.g., Undo)
 */

import React, { useEffect, useCallback } from "react";
import { Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useToastStore } from "../stores/useToastStore";
import { fonts } from "../theme/typography";

const TOAST_DURATION = 3000;
const TOAST_DURATION_WITH_ACTION = 5000;

const VARIANTS = {
  success: { icon: "checkmark-circle" as const, color: "#34C759" },
  error: { icon: "close-circle" as const, color: "#FF3B30" },
  info: { icon: "information-circle" as const, color: "#0A79F1" },
};

export function Toast() {
  const insets = useSafeAreaInsets();
  const { visible, message, type, action, hide } = useToastStore();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    hide();
  }, [hide]);

  const duration = action ? TOAST_DURATION_WITH_ACTION : TOAST_DURATION;

  useEffect(() => {
    if (visible) {
      // Slide in with spring, then auto-dismiss after duration
      translateY.value = withSpring(0, { damping: 20, stiffness: 300 }, (finished) => {
        if (finished) {
          // Schedule auto-dismiss only after spring settles
          translateY.value = withDelay(
            duration - 400,
            withTiming(-100, { duration: 300 }, (done) => {
              if (done) runOnJS(dismiss)();
            })
          );
          opacity.value = withDelay(duration - 400, withTiming(0, { duration: 300 }));
        }
      });
      opacity.value = withTiming(1, { duration: 200 });
      // Haptic
      if (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else if (type === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else {
      translateY.value = -100;
      opacity.value = 0;
    }
  }, [visible, message, type]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible && opacity.value === 0) return null;

  const variant = VARIANTS[type];

  const handleAction = () => {
    action?.onPress();
    // Immediately dismiss toast after action
    translateY.value = withTiming(-100, { duration: 200 }, (finished) => {
      if (finished) runOnJS(dismiss)();
    });
    opacity.value = withTiming(0, { duration: 200 });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8 },
        animatedStyle,
      ]}
      pointerEvents={action ? "box-none" : "none"}
    >
      <BlurView intensity={60} tint="dark" style={styles.blur}>
        <Animated.View style={[styles.content, { borderLeftColor: variant.color }]}>
          <Ionicons name={variant.icon} size={20} color={variant.color} />
          <Text style={styles.text} numberOfLines={2}>{message}</Text>
          {action && (
            <Pressable
              onPress={handleAction}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={action.label}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  blur: {
    borderRadius: 14,
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    backgroundColor: "rgba(20,28,44,0.85)",
  },
  text: {
    flex: 1,
    color: "#F0F2F5",
    fontSize: 15,
    fontWeight: "500",
    fontFamily: fonts.medium,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: fonts.bold,
  },
});
