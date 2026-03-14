/**
 * SpendingTrend — SVG line chart showing spending over time
 * Clean, borderless, responsive width
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from "react-native-reanimated";
import { useTheme, useLanguage, useCurrency } from "../../stores/useSettingsStore";
import { t } from "../../core/i18n";
import { formatMoney } from "../../core/formatters";
import { fonts } from "../../theme/typography";
import { FadeInView } from "../AnimatedUI";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const CHART_HEIGHT = 100;
const CHART_PADDING = 8;

interface MonthPoint {
  label: string;
  amount: number;
}

export function SpendingTrend({ months }: { months: MonthPoint[] }) {
  const theme = useTheme();
  const lang = useLanguage();
  const currency = useCurrency();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 40; // 20px padding each side

  if (months.length < 2) {
    return (
      <FadeInView delay={300} style={styles.container}>
        <Text style={[styles.fallback, { color: theme.textMuted }]}>
          {t(lang, "analytics_trend_fallback")}
        </Text>
      </FadeInView>
    );
  }

  const maxAmount = Math.max(...months.map((m) => m.amount), 1);
  const points = months.map((m, i) => ({
    x: CHART_PADDING + (i / (months.length - 1)) * (chartWidth - CHART_PADDING * 2),
    y: CHART_HEIGHT - CHART_PADDING - ((m.amount / maxAmount) * (CHART_HEIGHT - CHART_PADDING * 2)),
  }));

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`;

  // Animated line drawing
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, []);

  const totalLength = points.reduce((acc, p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1];
    return acc + Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
  }, 0);

  const animatedLineProps = useAnimatedProps(() => ({
    strokeDasharray: [totalLength, totalLength],
    strokeDashoffset: totalLength * (1 - progress.value),
  }));

  return (
    <FadeInView delay={300}>
      <View style={styles.container}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {t(lang, "analytics_trend_title")}
        </Text>
        <Svg width={chartWidth} height={CHART_HEIGHT} style={{ alignSelf: "center" }}>
          <Defs>
            <SvgGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0A79F1" stopOpacity="0.15" />
              <Stop offset="1" stopColor="#0A79F1" stopOpacity="0" />
            </SvgGradient>
          </Defs>
          {/* Area fill */}
          <Path d={areaPath} fill="url(#fill)" />
          {/* Animated line */}
          <AnimatedPath
            d={linePath}
            stroke="#0A79F1"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            animatedProps={animatedLineProps}
          />
          {/* Data point dots */}
          {points.map((p, i) => (
            <Path
              key={i}
              d={`M ${p.x - 3} ${p.y} a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`}
              fill="#0A79F1"
            />
          ))}
        </Svg>
        {/* Month labels */}
        <View style={styles.labels}>
          {months.map((m, i) => (
            <View key={i} style={{ alignItems: "center" }}>
              <Text style={[styles.monthLabel, { color: theme.textMuted }]}>{m.label}</Text>
              <Text style={[styles.monthAmount, { color: theme.textSecondary }]}>
                {formatMoney(m.amount, currency, lang)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: 8,
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: "500",
    fontFamily: fonts.medium,
  },
  monthAmount: {
    fontSize: 10,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  fallback: {
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    paddingVertical: 20,
  },
});
