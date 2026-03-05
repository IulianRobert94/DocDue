/**
 * SwipeableRow — Swipe-to-delete wrapper for document list rows
 * Uses ReanimatedSwipeable from react-native-gesture-handler
 * Reveals action buttons on right swipe (delete, optional secondary)
 */

import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';

import type { IconName } from '../types';

interface SecondaryAction {
  label: string;
  icon: IconName;
  color: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  confirmTitle: string;
  confirmMessage: string;
  confirmCancel: string;
  confirmDelete: string;
  deleteLabel?: string;
  secondaryAction?: SecondaryAction;
}

function ActionButton({ dragX, label, icon, color, onPress, totalWidth }: {
  dragX: SharedValue<number>;
  label: string;
  icon: IconName;
  color: string;
  onPress: () => void;
  totalWidth: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      dragX.value,
      [-totalWidth, -totalWidth / 2, 0],
      [1, 0.8, 0.5],
      'clamp'
    );
    return { transform: [{ scale }] };
  });

  return (
    <Pressable style={[s.actionBtn, { backgroundColor: color }]} onPress={onPress} accessibilityLabel={label} accessibilityRole="button">
      <Reanimated.View style={[s.actionContent, animatedStyle]}>
        <Ionicons name={icon} size={20} color="#FFF" />
        <Text style={s.actionText}>{label}</Text>
      </Reanimated.View>
    </Pressable>
  );
}

export const SwipeableRow = React.memo(function SwipeableRow({
  children,
  onDelete,
  confirmTitle,
  confirmMessage,
  confirmCancel,
  confirmDelete,
  deleteLabel = "",
  secondaryAction,
}: SwipeableRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const totalWidth = secondaryAction ? 160 : 80;

  const handleSwipeOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(confirmTitle, confirmMessage, [
      {
        text: confirmCancel,
        style: 'cancel',
        onPress: () => swipeRef.current?.close(),
      },
      {
        text: confirmDelete,
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onDelete();
        },
      },
    ]);
  }, [onDelete, confirmTitle, confirmMessage, confirmCancel, confirmDelete]);

  const handleDeletePress = useCallback(() => {
    handleSwipeOpen();
  }, [handleSwipeOpen]);

  const handleSecondaryPress = useCallback(() => {
    swipeRef.current?.close();
    secondaryAction?.onPress();
  }, [secondaryAction]);

  // Build accessibility actions so VoiceOver/TalkBack users can trigger actions without swiping
  const a11yActions: Array<{ name: string; label: string }> = [
    { name: 'delete', label: deleteLabel || 'Delete' },
  ];
  if (secondaryAction) {
    a11yActions.unshift({ name: 'secondary', label: secondaryAction.label });
  }

  const handleA11yAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === 'delete') {
      handleDeletePress();
    } else if (event.nativeEvent.actionName === 'secondary') {
      secondaryAction?.onPress();
    }
  }, [handleDeletePress, secondaryAction]);

  return (
    <View
      accessible
      accessibilityActions={a11yActions}
      onAccessibilityAction={handleA11yAction}
    >
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={2}
        rightThreshold={40}
        renderRightActions={(_progress, dragX) => (
          <View style={{ flexDirection: 'row', width: totalWidth }}>
            {secondaryAction && (
              <ActionButton
                dragX={dragX}
                label={secondaryAction.label}
                icon={secondaryAction.icon}
                color={secondaryAction.color}
                onPress={handleSecondaryPress}
                totalWidth={totalWidth}
              />
            )}
            <ActionButton
              dragX={dragX}
              label={deleteLabel}
              icon="trash"
              color="#FF3B30"
              onPress={handleDeletePress}
              totalWidth={totalWidth}
            />
          </View>
        )}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') handleSwipeOpen();
        }}
        overshootRight={false}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
});

const s = StyleSheet.create({
  actionBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  actionContent: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  actionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
