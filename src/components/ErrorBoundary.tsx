/**
 * ErrorBoundary — Catches unhandled React errors
 * Shows a user-friendly error screen instead of a crash
 * Required for Apple App Store compliance
 * Dark navy design — single theme
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../core/i18n';
import { useSettingsStore } from '../stores/useSettingsStore';
import { createTheme } from '../theme/colors';
import { fonts } from '../theme/typography';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function getLanguage(): 'ro' | 'en' {
  try {
    return useSettingsStore.getState().settings.language || 'ro';
  } catch {
    return 'ro';
  }
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__DEV__) console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const lang = getLanguage();
      const theme = createTheme();
      return (
        <View style={[s.container, { paddingTop: (StatusBar.currentHeight || 44) + 16, backgroundColor: theme.background }]}>
          <Ionicons name="warning" size={48} color="#FF9500" style={{ marginBottom: 16 }} />
          <Text style={[s.title, { color: theme.text }]}>
            {t(lang, 'error_title')}
          </Text>
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>
            {t(lang, 'error_subtitle')}
          </Text>
          {__DEV__ && (
            <Text style={[s.message, { color: theme.textMuted }]}>
              {this.state.error?.message}
            </Text>
          )}
          <Pressable
            style={[s.button, { overflow: 'hidden' }]}
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'error_retry')}
          >
            <LinearGradient
              colors={['#0E8BFF', '#0A79F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={s.buttonText}>{t(lang, 'error_retry')}</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={{ marginTop: 16, padding: 12 }}
            onPress={() => {
              Alert.alert(
                t(lang, 'error_clear_title'),
                t(lang, 'error_clear_msg'),
                [
                  { text: t(lang, 'confirm_cancel'), style: 'cancel' },
                  {
                    text: t(lang, 'error_clear_btn'),
                    style: 'destructive',
                    onPress: async () => {
                      await AsyncStorage.clear();
                      this.handleReset();
                    },
                  },
                ]
              );
            }}
            accessibilityRole="button"
          >
            <Text style={{ color: theme.textMuted, fontSize: 14, fontFamily: fonts.regular }}>
              {t(lang, 'error_clear_btn')}
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.bold,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    fontFamily: fonts.regular,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  button: {
    borderRadius: 12,
    minHeight: 44,
    overflow: 'hidden',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
});
