/**
 * Maintenance journal — add a tracked item (with its first installation)
 * or edit an item's details.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Platform, KeyboardAvoidingView, Keyboard, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme, useLanguage, useCurrency } from '../src/stores/useSettingsStore';
import { useItemStore } from '../src/stores/useItemStore';
import { showToast } from '../src/stores/useToastStore';
import { t } from '../src/core/i18n';
import { CATEGORIES } from '../src/core/constants';
import type { CategoryId } from '../src/core/constants';
import { getTodayString } from '../src/core/dateUtils';
import { parseOptionalNumber } from '../src/core/validators';
import { AnimatedPressable } from '../src/components/AnimatedUI';
import {
  Card, DateField, Divider, FieldError, NavBar, PrimaryButton, SectionHeader, TextField,
} from '../src/components/journal/JournalUI';
import { fonts } from '../src/theme/typography';

const KM_LIMITS = { decimals: 0, max: 9_999_999 };
const COST_LIMITS = { decimals: 2, max: 999_999_999 };

export default function ItemFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useItemStore((s) => (id ? s.items.find((i) => i.id === id) : undefined));
  const addItem = useItemStore((s) => s.addItem);
  const updateItem = useItemStore((s) => s.updateItem);
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [cat, setCat] = useState<CategoryId>(existing?.cat ?? 'vehicule');
  const [asset, setAsset] = useState(existing?.asset ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  // First installation (new items only)
  const [date, setDate] = useState(getTodayString());
  const [kmText, setKmText] = useState('');
  const [costText, setCostText] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const savingRef = useRef(false); // a quick double tap must not create the item twice

  const hasChanges = isEdit
    ? name.trim() !== existing!.name || cat !== existing!.cat || asset.trim() !== (existing!.asset ?? '') || notes.trim() !== (existing!.notes ?? '')
    : !!(name.trim() || asset.trim() || notes.trim() || kmText.trim() || costText.trim() || note.trim());

  const handleCancel = () => {
    Keyboard.dismiss();
    if (!hasChanges) { router.back(); return; }
    Alert.alert(t(language, 'confirm_discard_title'), t(language, 'confirm_discard_msg'), [
      { text: t(language, 'confirm_cancel'), style: 'cancel' },
      { text: t(language, 'confirm_discard_btn'), style: 'destructive', onPress: () => router.back() },
    ]);
  };

  // Android back button: same "discard changes?" check as Cancel (listener
  // registered once, so it reads the latest handler from a ref)
  const onBackRef = useRef<() => boolean>(() => false);
  onBackRef.current = () => {
    if (!hasChanges) return false;
    handleCancel();
    return true;
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => onBackRef.current());
    return () => sub.remove();
  }, []);

  const handleSave = () => {
    if (savingRef.current) return;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t(language, 'val_name_required');
    const km = parseOptionalNumber(kmText, KM_LIMITS);
    const cost = parseOptionalNumber(costText, COST_LIMITS);
    if (!isEdit) {
      if (cat === 'vehicule' && Number.isNaN(km)) e.km = t(language, 'val_km_invalid');
      if (Number.isNaN(cost)) e.cost = t(language, 'val_amount_positive');
    }
    setErrors(e);
    if (Object.keys(e).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    savingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (isEdit) {
      updateItem(existing!.id, { name, cat, asset, notes });
      router.back();
      return;
    }
    const newId = addItem({
      name, cat, asset, notes, start: date,
      startKm: cat === 'vehicule' ? km ?? undefined : undefined,
      cost: cost ?? undefined,
      note,
    });
    showToast(t(language, 'journal_saved'));
    router.replace({ pathname: '/items/[id]', params: { id: newId } });
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <NavBar
        title={t(language, isEdit ? 'journal_form_edit_title' : 'journal_form_add_title')}
        theme={theme}
        topInset={insets.top}
        onBack={handleCancel}
        backLabel={t(language, 'confirm_cancel')}
        backIcon={false}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <SectionHeader title={t(language, 'form_category')} theme={theme} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {(Object.keys(CATEGORIES) as CategoryId[]).map((catId) => {
            const c = CATEGORIES[catId];
            const selected = cat === catId;
            return (
              <AnimatedPressable
                key={catId}
                style={[s.catChip, { backgroundColor: selected ? c.color + '18' : theme.card, borderColor: selected ? c.color : 'transparent' }]}
                onPress={() => setCat(catId)}
                hapticStyle="selection"
                accessibilityLabel={t(language, 'a11y_select_category', { name: t(language, c.labelKey) })}
                accessibilityState={{ selected }}
              >
                <Ionicons name={selected ? c.iconFilled : c.icon} size={16} color={selected ? c.color : theme.textMuted} />
                <Text style={[s.catChipLabel, { color: selected ? c.color : theme.textSecondary }]}>{t(language, c.labelKey)}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        <SectionHeader title={t(language, 'settings_general')} theme={theme} />
        <Card theme={theme}>
          <TextField
            label={t(language, 'journal_form_name')}
            value={name}
            onChangeText={(v) => { setName(v); if (errors.name) setErrors((p) => ({ ...p, name: '' })); }}
            placeholder={t(language, 'journal_form_name_placeholder')}
            theme={theme}
            autoFocus={!isEdit}
          />
          <Divider theme={theme} />
          <TextField
            label={t(language, 'journal_form_asset')}
            value={asset}
            onChangeText={setAsset}
            placeholder={t(language, 'journal_form_asset_placeholder')}
            theme={theme}
          />
          <Divider theme={theme} />
          <TextField
            label={t(language, 'form_notes')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t(language, 'journal_optional')}
            theme={theme}
            maxLength={300}
          />
        </Card>
        <FieldError message={errors.name} />

        {!isEdit && (
          <>
            <SectionHeader title={t(language, 'journal_form_first_install')} theme={theme} />
            <Card theme={theme}>
              <DateField
                label={t(language, 'journal_form_date')}
                value={date}
                onChange={setDate}
                maximumDate={getTodayString()}
                theme={theme}
                language={language}
              />
              {cat === 'vehicule' && (
                <>
                  <Divider theme={theme} />
                  <TextField
                    label={t(language, 'journal_form_km')}
                    value={kmText}
                    onChangeText={setKmText}
                    placeholder={t(language, 'journal_optional')}
                    keyboardType="number-pad"
                    maxLength={9}
                    suffix="km"
                    theme={theme}
                  />
                </>
              )}
              <Divider theme={theme} />
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
            <FieldError message={errors.km} />
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
  chipRow: { paddingHorizontal: 16, gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2, gap: 8, minHeight: 44 },
  catChipLabel: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium },
});
