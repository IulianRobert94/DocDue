/**
 * Maintenance journal — record what happened to a tracked item:
 *   replace  → the one in use ends and a new one starts the same day
 *   broke    → the one in use ends, nothing new yet
 *   install  → a new one starts (when nothing is in use)
 *   past     → add a period from before the existing history
 */

import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme, useLanguage, useCurrency } from '../src/stores/useSettingsStore';
import { useItemStore } from '../src/stores/useItemStore';
import { useToday } from '../src/stores/useClockStore';
import { showToast } from '../src/stores/useToastStore';
import { t } from '../src/core/i18n';
import { formatDate } from '../src/core/formatters';
import { addDaysToDate } from '../src/core/dateUtils';
import { formatKm, getItemStats, minimumKm } from '../src/core/lifespan';
import { parseOptionalNumber } from '../src/core/validators';
import { SegmentedControl } from '../src/components/settings/SettingsUI';
import {
  Card, DateField, Divider, FieldError, NavBar, PrimaryButton, SectionHeader, TextField,
} from '../src/components/journal/JournalUI';
import { fonts } from '../src/theme/typography';

type Mode = 'replace' | 'broke' | 'install' | 'past';

const TITLES: Record<Mode, string> = {
  replace: 'journal_event_replace_title',
  broke: 'journal_event_broke_title',
  install: 'journal_event_install_title',
  past: 'journal_event_past_title',
};

const KM_LIMITS = { decimals: 0, max: 9_999_999 };
const COST_LIMITS = { decimals: 2, max: 999_999_999 };

export default function ItemEventScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const today = useToday();
  const params = useLocalSearchParams<{ id: string; mode?: string }>();
  const mode: Mode = params.mode === 'broke' || params.mode === 'install' || params.mode === 'past' ? params.mode : 'replace';
  const item = useItemStore((s) => s.items.find((i) => i.id === params.id));
  const replaceCurrent = useItemStore((s) => s.replaceCurrent);
  const markBroken = useItemStore((s) => s.markBroken);
  const startNewInstall = useItemStore((s) => s.startNewInstall);
  const addPastInstall = useItemStore((s) => s.addPastInstall);

  // A past period ends where the known history begins
  const firstStart = item?.installs[0]?.start;
  const [date, setDate] = useState(mode === 'past' && firstStart ? firstStart : today);
  const [startDate, setStartDate] = useState(addDaysToDate(firstStart ?? today, -365));
  const [kmText, setKmText] = useState('');
  const [startKmText, setStartKmText] = useState('');
  const [costText, setCostText] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<'replaced' | 'broke'>(mode === 'past' ? 'broke' : 'replaced');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const savingRef = useRef(false); // a quick double tap must not record the event twice

  if (!item) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <NavBar title="" theme={theme} topInset={insets.top} onBack={() => router.back()} backLabel={t(language, 'nav_back')} />
        <Text style={[s.hint, { color: theme.textMuted, textAlign: 'center', marginTop: 80 }]}>{t(language, 'journal_item_not_found')}</Text>
      </View>
    );
  }

  const stats = getItemStats(item, today);
  const isPast = mode === 'past';
  // The date can't be earlier than the period it closes / follows
  const minDate = mode === 'install' ? stats.lastEnded?.end : mode === 'past' ? undefined : stats.current?.start;
  const maxDate = isPast ? (firstStart ?? today) : today;
  const startsNew = mode !== 'broke';
  const showKm = item.cat === 'vehicule' || item.installs.some((i) => i.startKm !== undefined || i.endKm !== undefined);
  const kmFloor = isPast ? null : minimumKm(item, mode as 'replace' | 'broke' | 'install');

  const handleSave = () => {
    if (savingRef.current) return;
    const e: Record<string, string> = {};
    const km = showKm ? parseOptionalNumber(kmText, KM_LIMITS) : null;
    const startKm = showKm && isPast ? parseOptionalNumber(startKmText, KM_LIMITS) : null;
    const cost = startsNew ? parseOptionalNumber(costText, COST_LIMITS) : null;
    if (Number.isNaN(km) || Number.isNaN(startKm)) e.km = t(language, 'val_km_invalid');
    else if (km !== null && kmFloor !== null && km < kmFloor) e.km = t(language, 'val_km_below', { km: formatKm(kmFloor, language) });
    else if (isPast && km !== null && startKm !== null && km < startKm) e.km = t(language, 'val_km_below', { km: formatKm(startKm, language) });
    if (Number.isNaN(cost)) e.cost = t(language, 'val_amount_positive');
    if (minDate && date < minDate) e.date = t(language, 'val_date_before', { date: formatDate(minDate, language) });
    if (date > maxDate) e.date = t(language, 'val_date_after', { date: formatDate(maxDate, language) });
    if (isPast && startDate > date) e.date = t(language, 'val_end_before_start');
    setErrors(e);
    if (Object.keys(e).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    savingRef.current = true;
    const kmValue = km ?? undefined;
    const event = { date, km: kmValue, cost: cost ?? undefined, note };
    const ok =
      mode === 'replace' ? replaceCurrent(item.id, { ...event, reason })
      : mode === 'broke' ? markBroken(item.id, { date, km: kmValue })
      : mode === 'install' ? startNewInstall(item.id, event)
      : addPastInstall(item.id, {
          start: startDate, end: date, startKm: startKm ?? undefined, endKm: kmValue,
          reason, cost: cost ?? undefined, note,
        });
    if (!ok) {
      savingRef.current = false;
      Alert.alert(t(language, 'alert_error'), t(language, 'generic_error'));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast(t(language, 'journal_saved'));
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <NavBar
        title={t(language, TITLES[mode])}
        theme={theme}
        topInset={insets.top}
        onBack={() => router.back()}
        backLabel={t(language, 'confirm_cancel')}
        backIcon={false}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Text style={[s.itemName, { color: theme.text }]}>{item.name}</Text>
        {(mode === 'replace' || mode === 'broke') && (
          <Text style={[s.hint, { color: theme.textSecondary }]}>
            {t(language, mode === 'replace' ? 'journal_event_hint_replace' : 'journal_event_hint_broke')}
          </Text>
        )}

        <SectionHeader title={t(language, 'settings_general')} theme={theme} />
        <Card theme={theme}>
          {isPast && (
            <>
              <DateField
                label={t(language, 'journal_form_start')}
                value={startDate}
                onChange={(d) => { setStartDate(d); if (errors.date) setErrors((p) => ({ ...p, date: '' })); }}
                maximumDate={date}
                theme={theme}
                language={language}
              />
              <Divider theme={theme} />
            </>
          )}
          <DateField
            label={t(language, isPast ? 'journal_form_end' : 'journal_form_date')}
            value={date}
            onChange={(d) => { setDate(d); if (errors.date) setErrors((p) => ({ ...p, date: '' })); }}
            minimumDate={minDate}
            maximumDate={maxDate}
            theme={theme}
            language={language}
          />
          {showKm && isPast && (
            <>
              <Divider theme={theme} />
              <TextField
                label={t(language, 'journal_form_km_start')}
                value={startKmText}
                onChangeText={setStartKmText}
                placeholder={t(language, 'journal_optional')}
                keyboardType="number-pad"
                maxLength={9}
                suffix="km"
                theme={theme}
              />
            </>
          )}
          {showKm && (
            <>
              <Divider theme={theme} />
              <TextField
                label={t(language, isPast ? 'journal_form_km_end' : 'journal_form_km')}
                value={kmText}
                onChangeText={setKmText}
                placeholder={kmFloor !== null ? `≥ ${formatKm(kmFloor, language)}` : t(language, 'journal_optional')}
                keyboardType="number-pad"
                maxLength={9}
                suffix="km"
                theme={theme}
              />
            </>
          )}
        </Card>
        <FieldError message={errors.date} />
        <FieldError message={errors.km} />

        {(mode === 'replace' || isPast) && (
          <>
            <SectionHeader title={t(language, 'journal_event_reason')} theme={theme} />
            <View style={{ paddingHorizontal: 16 }}>
              <SegmentedControl
                options={[
                  { value: 'replaced', label: t(language, 'journal_event_reason_replaced') },
                  { value: 'broke', label: t(language, 'journal_event_reason_broke') },
                ]}
                selected={reason}
                onSelect={(v) => setReason(v as 'replaced' | 'broke')}
                theme={theme}
                fullWidth
              />
            </View>
          </>
        )}

        {startsNew && (
          <>
            <SectionHeader title={t(language, isPast ? 'journal_form_details_section' : 'journal_event_new_section')} theme={theme} />
            <Card theme={theme}>
              <TextField
                label={t(language, 'journal_form_cost')}
                value={costText}
                onChangeText={setCostText}
                placeholder={t(language, 'journal_optional')}
                keyboardType="decimal-pad"
                maxLength={12}
                suffix={currency}
                theme={theme}
              />
              <Divider theme={theme} />
              <TextField
                label={t(language, 'journal_form_note')}
                value={note}
                onChangeText={setNote}
                placeholder={t(language, 'journal_form_note_placeholder')}
                theme={theme}
                maxLength={150}
              />
            </Card>
            <FieldError message={errors.cost} />
          </>
        )}

        <View style={{ paddingHorizontal: 16, marginTop: 28 }}>
          <PrimaryButton label={t(language, 'form_save')} icon="checkmark" onPress={handleSave} theme={theme} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  itemName: { fontSize: 22, fontWeight: '700', fontFamily: fonts.bold, paddingHorizontal: 20, paddingTop: 20 },
  hint: { fontSize: 14, fontFamily: fonts.regular, lineHeight: 20, paddingHorizontal: 20, paddingTop: 6 },
});
