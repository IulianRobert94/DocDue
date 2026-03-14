/**
 * PremiumOverlay — Blurred upgrade prompt over premium content
 * Shows user's real data through blur to create FOMO
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AnimatedPressable } from "./AnimatedUI";
import { useTheme, useLanguage } from "../stores/useSettingsStore";
import { t } from "../core/i18n";
import { fonts } from "../theme/typography";

export function PremiumOverlay() {
  const theme = useTheme();
  const lang = useLanguage();
  const router = useRouter();

  return (
    <View style={styles.container} pointerEvents="box-none" accessible accessibilityRole="alert" accessibilityLabel={t(lang, "premium_unlock_analytics")}>
      {/* Gradient: transparent at top (user peeks) -> blur at bottom */}
      <LinearGradient
        colors={["transparent", "rgba(10,14,23,0.3)", "rgba(10,14,23,0.7)"]}
        locations={[0, 0.15, 0.4]}
        style={styles.gradient}
        pointerEvents="none"
        importantForAccessibility="no"
      />
      {/* Blur over content */}
      <BlurView intensity={20} tint="dark" style={styles.blur} importantForAccessibility="no" />
      {/* Overlay content */}
      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.lockCircle} importantForAccessibility="no">
          <Ionicons name="lock-closed" size={28} color="#FFD700" />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>
          {t(lang, "premium_unlock_analytics")}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(lang, "premium_data_tracked")}
        </Text>
        <AnimatedPressable
          onPress={() => router.push("/premium")}
          hapticStyle="medium"
          scaleValue={0.96}
          style={styles.btn}
          accessibilityLabel={t(lang, "premium_upgrade")}
        >
          <LinearGradient
            colors={["#0E8BFF", "#0A79F1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.btnGradient}
          >
            <Ionicons name="star" size={18} color="#FFF" />
            <Text style={styles.btnText}>{t(lang, "premium_upgrade")}</Text>
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
    top: 120, // let user peek at the top
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  lockCircle: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(255,215,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.15)",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: fonts.bold,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  btn: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#0A79F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  btnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "600",
    fontFamily: fonts.semiBold,
  },
});
