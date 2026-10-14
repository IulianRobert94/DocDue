/**
 * Small "Exemplu" tag next to an example document's title, so the seeded
 * examples are never mistaken for the user's own documents.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";

import type { LanguageCode } from "../core/constants";
import { t } from "../core/i18n";
import { fonts } from "../theme/typography";

export function ExamplePill({ language }: { language: LanguageCode }) {
  return (
    <View style={s.pill} accessibilityLabel={t(language, "demo_pill")}>
      <Text style={s.text}>{t(language, "demo_pill")}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "rgba(10,121,241,0.16)" },
  text: { fontSize: 11, color: "#4DA3FF", fontFamily: fonts.semiBold, textTransform: "uppercase", letterSpacing: 0.4 },
});
