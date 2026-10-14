/**
 * Shared building blocks for the maintenance journal screens
 * (same look as the document form and category screens).
 */

import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Platform, ActivityIndicator, type KeyboardTypeOptions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import type { AppTheme } from "../../theme/colors";
import type { LanguageCode } from "../../core/constants";
import { t } from "../../core/i18n";
import { formatDate } from "../../core/formatters";
import { parseLocalDate, toDateString } from "../../core/dateUtils";
import { AnimatedPressable } from "../AnimatedUI";
import { fonts } from "../../theme/typography";

/** Top bar with a back/cancel button, centred title and an optional right action. */
export function NavBar({
  title, theme, topInset, onBack, backLabel, backIcon = true, right,
}: {
  title: string;
  theme: AppTheme;
  topInset: number;
  onBack: () => void;
  backLabel: string;
  backIcon?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View style={[ui.navBar, { paddingTop: topInset, backgroundColor: theme.card, borderBottomColor: theme.divider }]}>
      <AnimatedPressable onPress={onBack} style={ui.navSide} haptic={false} accessibilityLabel={backLabel} accessibilityRole="button">
        {backIcon && <Ionicons name="chevron-back" size={28} color={theme.primary} />}
        <Text style={[ui.navSideText, { color: theme.primaryText, marginLeft: backIcon ? -4 : 12 }]} numberOfLines={1}>{backLabel}</Text>
      </AnimatedPressable>
      <Text style={[ui.navTitle, { color: theme.text }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <View style={[ui.navSide, { justifyContent: "flex-end", paddingRight: 12 }]}>{right}</View>
    </View>
  );
}

export function SectionHeader({ title, theme }: { title: string; theme: AppTheme }) {
  return <Text style={[ui.sectionHeader, { color: theme.textSecondary }]}>{title}</Text>;
}

export function Card({ theme, children, style }: { theme: AppTheme; children: React.ReactNode; style?: object }) {
  return <View style={[ui.group, { backgroundColor: theme.card }, style]}>{children}</View>;
}

export function Divider({ theme }: { theme: AppTheme }) {
  return <View style={ui.dividerWrap}><View style={[ui.divider, { backgroundColor: theme.divider }]} /></View>;
}

/**
 * Label + single-line text input row. Uncontrolled (`defaultValue`): on the
 * New Architecture a controlled `value` + setState input loses/lags spaces.
 */
export function TextField({
  label, value, onChangeText, theme, placeholder, keyboardType, maxLength = 100, suffix, autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: AppTheme;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  suffix?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={ui.inputRow}>
      <Text style={[ui.inputLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        style={[ui.inputField, { color: theme.text }]}
        defaultValue={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textDim}
        keyboardType={keyboardType}
        returnKeyType="done"
        maxLength={maxLength}
        autoFocus={autoFocus}
        accessibilityLabel={label}
      />
      {suffix ? <Text style={[ui.suffix, { color: theme.textMuted }]}>{suffix}</Text> : null}
    </View>
  );
}

/** Label + date; tapping opens the system date picker. */
export function DateField({
  label, value, onChange, theme, language, minimumDate, maximumDate,
}: {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  theme: AppTheme;
  language: LanguageCode;
  minimumDate?: string;
  maximumDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const toDate = (s?: string) => (s && !isNaN(parseLocalDate(s).getTime()) ? parseLocalDate(s) : undefined);
  return (
    <>
      <AnimatedPressable
        style={ui.inputRow}
        onPress={() => setOpen((o) => !o)}
        haptic={false}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatDate(value, language) }}
      >
        <Text style={[ui.inputLabel, { color: theme.textSecondary }]}>{label}</Text>
        <Text style={[ui.inputField, { color: theme.text }]}>{formatDate(value, language)}</Text>
      </AnimatedPressable>
      {open && (
        <View style={ui.datePickerContainer}>
          {Platform.OS === "ios" && (
            <View style={ui.datePickerHeader}>
              <AnimatedPressable
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(false); }}
                haptic={false}
                accessibilityLabel={t(language, "form_done")}
                accessibilityRole="button"
              >
                <Text style={[ui.doneText, { color: theme.primaryText }]}>{t(language, "form_done")}</Text>
              </AnimatedPressable>
            </View>
          )}
          <DateTimePicker
            value={toDate(value) ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={toDate(minimumDate)}
            maximumDate={toDate(maximumDate)}
            themeVariant="dark"
            onChange={(event, selected) => {
              if (Platform.OS === "android") setOpen(false);
              if (event.type === "dismissed" || !selected) return;
              onChange(toDateString(selected));
            }}
          />
        </View>
      )}
    </>
  );
}

/** Full-width gradient button (same as the document form's Save). */
export function PrimaryButton({
  label, icon, onPress, loading, disabled, theme,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  theme: AppTheme;
}) {
  return (
    <AnimatedPressable
      style={[ui.primaryBtn, { shadowColor: theme.primary }]}
      onPress={onPress}
      hapticStyle="medium"
      accessibilityLabel={label}
      accessibilityRole="button"
      scaleValue={0.97}
      disabled={disabled || loading}
    >
      <LinearGradient colors={["#0E8BFF", "#0A79F1"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ui.primaryBtnInner}>
        {loading
          ? <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
          : <Ionicons name={icon} size={20} color="#FFF" style={{ marginRight: 6 }} />}
        <Text style={ui.primaryBtnText}>{label}</Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

/** Outlined secondary action. */
export function SecondaryButton({
  label, icon, onPress, color, theme,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  color?: string;
  theme: AppTheme;
}) {
  const tint = color ?? theme.primaryText;
  return (
    <AnimatedPressable
      style={[ui.secondaryBtn, { borderColor: tint + "55", backgroundColor: tint + "12" }]}
      onPress={onPress}
      hapticStyle="light"
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={tint} style={{ marginRight: 6 }} />
      <Text style={[ui.secondaryBtnText, { color: tint }]}>{label}</Text>
    </AnimatedPressable>
  );
}

/** Label on the left, value on the right (stats rows). */
/** Validation message announced by screen readers. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={ui.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">{message}</Text>;
}

/** Icon-only header button with a full 44pt touch target. */
export function NavIconButton({
  icon, label, onPress, theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  theme: AppTheme;
}) {
  return (
    <AnimatedPressable onPress={onPress} accessibilityLabel={label} style={ui.navIconBtn}>
      <Ionicons name={icon} size={26} color={theme.primary} />
    </AnimatedPressable>
  );
}

export function StatRow({ label, value, theme, valueColor }: { label: string; value: string; theme: AppTheme; valueColor?: string }) {
  return (
    <View style={ui.statRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[ui.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[ui.statValue, { color: valueColor ?? theme.text }]}>{value}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  navSide: { flexDirection: "row", alignItems: "center", width: 96, minHeight: 44 },
  navSideText: { fontSize: 17, fontFamily: fonts.regular },
  navTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", fontFamily: fonts.semiBold },
  sectionHeader: { fontSize: 13, fontWeight: "500", fontFamily: fonts.medium, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.04)" },
  inputRow: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 16 },
  inputLabel: { fontSize: 17, fontFamily: fonts.regular, minWidth: 110, marginRight: 12 },
  inputField: { flex: 1, fontSize: 17, fontFamily: fonts.regular, paddingVertical: 11 },
  suffix: { fontSize: 15, fontFamily: fonts.regular, marginLeft: 6 },
  datePickerContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  datePickerHeader: { flexDirection: "row", justifyContent: "flex-end", paddingTop: 8, paddingBottom: 4, paddingHorizontal: 4 },
  doneText: { fontSize: 17, fontWeight: "600", fontFamily: fonts.semiBold },
  dividerWrap: { paddingLeft: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  primaryBtn: { borderRadius: 16, overflow: "hidden", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  primaryBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  primaryBtnText: { color: "#FFF", fontSize: 17, fontWeight: "600", fontFamily: fonts.semiBold },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, minHeight: 48, paddingHorizontal: 16 },
  secondaryBtnText: { fontSize: 16, fontWeight: "600", fontFamily: fonts.semiBold },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
  statLabel: { fontSize: 15, fontFamily: fonts.regular, flexShrink: 1, marginRight: 12 },
  statValue: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold, textAlign: "right" },
  navIconBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#FF3B30", fontSize: 12, fontWeight: "500", fontFamily: fonts.medium, paddingHorizontal: 32, paddingTop: 4, paddingBottom: 2 },
});
