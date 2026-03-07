/**
 * Shared UI primitives for Settings screen sections
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '../../theme/colors';

export const RowDivider = React.memo(function RowDivider({ theme }: { theme: AppTheme }) {
  return (
    <View style={{ paddingLeft: 16 }}>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
    </View>
  );
});

export const InfoRow = React.memo(function InfoRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: AppTheme;
}) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[s.rowValue, { color: theme.textSecondary }]}>{value}</Text>
    </View>
  );
});

export const SegmentedControl = React.memo(function SegmentedControl({
  options,
  selected,
  onSelect,
  theme,
  fullWidth = false,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
  theme: AppTheme;
  fullWidth?: boolean;
}) {
  return (
    <View style={[s.segmented, { backgroundColor: theme.inputFill }]}>
      {options.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[
              s.segmentItem,
              fullWidth && { flex: 1, paddingHorizontal: 4 },
              isActive && [s.segmentActive, {
                backgroundColor: 'rgba(60,85,140,0.9)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.4,
                shadowRadius: 3,
                elevation: 3,
              }],
            ]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(opt.value); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt.label}
          >
            <Text
              style={[
                s.segmentText,
                { color: isActive ? '#FFFFFF' : theme.textMuted },
                isActive && { fontWeight: '600' },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowLabel: { fontSize: 17 },
  rowValue: { fontSize: 17 },
  segmented: {
    flexDirection: 'row',
    borderRadius: 9,
    padding: 2,
  },
  segmentItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {},
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
