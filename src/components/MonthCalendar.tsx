/**
 * Month calendar for the Alerts tab: a dot on each day something is due
 * (colored by status; faded for the next repeats of recurring documents) and
 * the list for the selected day underneath.
 */

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { CurrencyCode, EnrichedDocument, LanguageCode } from "../core/constants";
import { STATUS_DISPLAY, CATEGORIES } from "../core/constants";
import { t, translateSubtype } from "../core/i18n";
import { formatDate, formatMoney } from "../core/formatters";
import { entriesByDay, monthGrid, shiftMonth } from "../core/calendarGrid";
import { docCurrency } from "../core/money";
import { isDemoDocument } from "../core/helpers";
import type { AppTheme } from "../theme/colors";
import { AnimatedPressable } from "./AnimatedUI";
import { ExamplePill } from "./ExamplePill";
import { fonts } from "../theme/typography";

export function MonthCalendar({ docs, today, theme, language, currency, onOpen }: {
  docs: EnrichedDocument[];
  today: string;
  theme: AppTheme;
  language: LanguageCode;
  currency: CurrencyCode;
  onOpen: (doc: EnrichedDocument) => void;
}) {
  const [[year, month], setMonth] = useState<[number, number]>(() => [Number(today.slice(0, 4)), Number(today.slice(5, 7))]);
  const [selected, setSelected] = useState(today);

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const days = useMemo(() => {
    const cells = weeks.flat().filter((d): d is string => d !== null);
    return entriesByDay(docs, cells[0], cells[cells.length - 1]);
  }, [docs, weeks]);
  const selectedEntries = days.get(selected) ?? [];

  const goTo = (delta: number) => {
    const next = shiftMonth(year, month, delta);
    setMonth(next);
    // Keep a day of the shown month selected: today when it's there, else the 1st
    const prefix = `${next[0]}-${String(next[1]).padStart(2, "0")}`;
    setSelected(today.startsWith(prefix) ? today : `${prefix}-01`);
  };

  return (
    <View>
      <View style={s.header}>
        <AnimatedPressable onPress={() => goTo(-1)} style={s.arrow} hapticStyle="selection"
          accessibilityRole="button" accessibilityLabel={t(language, "calendar_prev")}>
          <Ionicons name="chevron-back" size={22} color={theme.primary} />
        </AnimatedPressable>
        <Text style={[s.monthTitle, { color: theme.text }]} accessibilityRole="header">
          {t(language, `month_${month}`)} {year}
        </Text>
        <AnimatedPressable onPress={() => goTo(1)} style={s.arrow} hapticStyle="selection"
          accessibilityRole="button" accessibilityLabel={t(language, "calendar_next")}>
          <Ionicons name="chevron-forward" size={22} color={theme.primary} />
        </AnimatedPressable>
      </View>

      <View style={[s.card, { backgroundColor: theme.card }]}>
        <View style={s.week}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <Text key={d} style={[s.weekday, { color: theme.textMuted }]}>{t(language, `weekday_short_${d}`)}</Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={s.week}>
            {week.map((date, di) => {
              if (!date) return <View key={di} style={s.cell} />;
              const entries = days.get(date) ?? [];
              const isSelected = date === selected;
              const isToday = date === today;
              return (
                <AnimatedPressable key={date} style={s.cell} onPress={() => setSelected(date)} haptic={false}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${formatDate(date, language)}${entries.length ? `, ${entries.length}` : ""}`}>
                  <View style={[
                    s.dayCircle,
                    isSelected && { backgroundColor: theme.primary },
                    !isSelected && isToday && { borderWidth: 1.5, borderColor: theme.primary },
                  ]}>
                    <Text style={[s.dayText, { color: isSelected ? "#FFF" : theme.text }]}>{Number(date.slice(8))}</Text>
                  </View>
                  <View style={s.dots}>
                    {entries.slice(0, 3).map((entry, i) => (
                      <View key={i} style={[
                        s.dot,
                        { backgroundColor: STATUS_DISPLAY[entry.doc._status]?.color ?? theme.primary },
                        entry.projected && { opacity: 0.35 },
                      ]} />
                    ))}
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={[s.dayHeader, { color: theme.textSecondary }]}>{formatDate(selected, language)}</Text>
      <View style={[s.card, { backgroundColor: theme.card }]}>
        {selectedEntries.length === 0 ? (
          <Text style={[s.empty, { color: theme.textMuted }]}>{t(language, "calendar_empty_day")}</Text>
        ) : selectedEntries.map(({ doc, projected }, i) => {
          const category = CATEGORIES[doc.cat] ?? CATEGORIES.vehicule;
          return (
            <View key={`${doc.id}-${i}`}>
              <AnimatedPressable style={s.row} onPress={() => onOpen(doc)} scaleValue={0.98}
                accessibilityLabel={t(language, "a11y_open_document", { title: doc.title })}>
                <View style={[s.rowIcon, { backgroundColor: category.color + "14" }]}>
                  <Ionicons name={category.icon} size={16} color={category.color} />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[s.rowTitle, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>{doc.title}</Text>
                    {isDemoDocument(doc) && <ExamplePill language={language} />}
                  </View>
                  <Text style={[s.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
                    {translateSubtype(doc.type, language)}{projected ? ` · ${t(language, "calendar_repeat")}` : ""}
                  </Text>
                </View>
                {doc.amt ? (
                  <Text style={[s.rowAmount, { color: theme.textSecondary }]}>{formatMoney(doc.amt, docCurrency(doc, currency), language)}</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={14} color={theme.textDim} style={{ marginLeft: 4 }} />
              </AnimatedPressable>
              {i < selectedEntries.length - 1 && (
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider, marginLeft: 56 }} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, marginBottom: 8 },
  arrow: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 18, fontFamily: fonts.semiBold },
  card: { marginHorizontal: 16, borderRadius: 12, overflow: "hidden", paddingVertical: 6 },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: fonts.medium, paddingVertical: 6 },
  cell: { flex: 1, alignItems: "center", paddingVertical: 4, minHeight: 48 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 15, fontFamily: fonts.medium },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dayHeader: { fontSize: 13, fontFamily: fonts.semiBold, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  empty: { fontSize: 15, fontFamily: fonts.regular, padding: 16, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", marginRight: 12 },
  rowTitle: { fontSize: 16, fontFamily: fonts.regular },
  rowSub: { fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  rowAmount: { fontSize: 14, fontFamily: fonts.medium },
});
