/**
 * Document Form — Apple HIG 2025 v12
 * Modal form: compact DateTimePicker on iOS
 * Sticky bottom save bar + header cancel/save
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Alert,
  Platform, Keyboard, InputAccessoryView, BackHandler,
  ActivityIndicator, Modal, KeyboardAvoidingView, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { useTheme, useLanguage, useCurrency, useSettingsStore } from '../src/stores/useSettingsStore';
import { useDocumentStore, useEnrichedDocument } from '../src/stores/useDocumentStore';
import { t, translateSubtype } from '../src/core/i18n';
import { parseLocalDate } from '../src/core/dateUtils';
import { formatDate, formatMoney } from '../src/core/formatters';
import { CATEGORIES, RECURRENCE_OPTIONS } from '../src/core/constants';
import type { CategoryId, RecurrenceValue, RawDocument, Attachment } from '../src/core/constants';
import { AnimatedPressable, FadeInView } from '../src/components/AnimatedUI';
import { SegmentedControl, RowDivider } from '../src/components/settings/SettingsUI';
import { AttachmentPicker } from '../src/components/AttachmentPicker';
import { getSmartDefaults } from '../src/core/smartDefaults';

function dateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Timezone-safe string→Date using local parsing (not UTC) */
function stringToDate(dateStr: string): Date {
  const date = parseLocalDate(dateStr);
  if (isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  return date;
}

export default function FormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();

  const { editId, cat: catParam } = useLocalSearchParams<{ editId?: string; cat?: string }>();
  const existingDoc = useEnrichedDocument(editId);
  const addDocument = useDocumentStore((s) => s.addDocument);
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const customSubtypes = useSettingsStore((s) => s.settings.customSubtypes);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const isEdit = !!editId;

  // If editing a document that no longer exists, fall back to add mode
  const effectiveEdit = isEdit && !!existingDoc;

  const todayStr = dateToString(new Date());

  const [cat, setCat] = useState<CategoryId>(existingDoc?.cat || (catParam as CategoryId) || 'vehicule');
  const initCat = existingDoc?.cat || (catParam as CategoryId) || 'vehicule';
  const initSubtypes = CATEGORIES[initCat]?.subtypes || [];
  const initCustom = customSubtypes?.[initCat] || [];
  const isCustomType = existingDoc?.type ? !initSubtypes.includes(existingDoc.type) && !initCustom.includes(existingDoc.type) : false;
  const [type, setType] = useState<string>(isCustomType ? 'Altele' : (existingDoc?.type || ''));
  const [customType, setCustomType] = useState<string>(isCustomType ? (existingDoc?.type || '') : '');
  const [title, setTitle] = useState<string>(existingDoc?.title || '');
  const [asset, setAsset] = useState<string>(existingDoc?.asset || '');
  const [due, setDue] = useState<string>(existingDoc?.due || todayStr);
  const [amt, setAmt] = useState<string>(existingDoc?.amt ? String(existingDoc.amt) : '');
  const [rec, setRec] = useState<RecurrenceValue>(existingDoc?.rec || 'none');
  const [notes, setNotes] = useState<string>(existingDoc?.notes || '');
  const [attachments, setAttachments] = useState<Attachment[]>(existingDoc?.attachments || []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [recAutoSet, setRecAutoSet] = useState(false);
  const recAutoSetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const savingRef = useRef(false); // Guard against rapid double-taps
  const scrollRef = useRef<ScrollView>(null);

  // Cleanup recurrence auto-set timer on unmount
  useEffect(() => {
    return () => {
      if (recAutoSetTimer.current) clearTimeout(recAutoSetTimer.current);
    };
  }, []);

  // Toggle date picker dialog (both platforms now)
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [pickerDate, setPickerDate] = useState<Date>(
    existingDoc?.due ? stringToDate(existingDoc.due) : new Date()
  );

  const category = CATEGORIES[cat];
  const presetSubtypes = category?.subtypes || [];
  // Merge custom subtypes before "Altele" (Other)
  const savedCustom = customSubtypes?.[cat] || [];
  const subtypes = useMemo(() => {
    const withoutAltele = presetSubtypes.filter((s) => s !== 'Altele');
    const uniqueCustom = savedCustom.filter((c) => !withoutAltele.includes(c));
    return [...withoutAltele, ...uniqueCustom, 'Altele'];
  }, [presetSubtypes, savedCustom]);

  // Check if user has entered any data (to warn before discarding)
  const hasUnsavedData = isEdit
    ? (title.trim() !== (existingDoc?.title || '') ||
       asset.trim() !== (existingDoc?.asset || '') ||
       amt.trim() !== (existingDoc?.amt ? String(existingDoc.amt) : '') ||
       notes.trim() !== (existingDoc?.notes || '') ||
       cat !== (existingDoc?.cat || 'vehicule') ||
       type !== (existingDoc?.type || '') ||
       due !== (existingDoc?.due || todayStr) ||
       rec !== (existingDoc?.rec || 'none') ||
       attachments.length !== (existingDoc?.attachments?.length || 0))
    : (title.trim().length > 0 || asset.trim().length > 0 || amt.trim().length > 0 || notes.trim().length > 0);

  const handleCancel = () => {
    Keyboard.dismiss();
    if (hasUnsavedData) {
      Alert.alert(
        t(language, 'confirm_discard_title'),
        t(language, 'confirm_discard_msg'),
        [
          { text: t(language, 'confirm_cancel'), style: 'cancel' },
          { text: t(language, 'confirm_discard_btn'), style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  // Android back button: show unsaved data warning
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (hasUnsavedData) {
        handleCancel();
        return true; // prevent default back
      }
      return false; // allow default back
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [hasUnsavedData]);

  useEffect(() => {
    if (!isEdit && subtypes.length > 0 && !subtypes.includes(type)) {
      setType(subtypes[0]);
      setCustomType('');
    }
  }, [cat]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    Keyboard.dismiss();
    if (Platform.OS === 'android' && event.type === 'set') {
      setShowDatePicker(false);
    }
    if (Platform.OS === 'android' && event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    if (selectedDate) {
      setPickerDate(selectedDate);
      setDue(dateToString(selectedDate));
      clearError('due');
    }
  };

  const clearError = (key: string) => {
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  /** Apply smart defaults when selecting a subtype (only for new documents) */
  const handleSubtypeSelect = (sub: string) => {
    setType(sub);
    if (!isEdit && rec === 'none') {
      const defaults = getSmartDefaults(sub);
      if (defaults) {
        setRec(defaults.recurrence);
        if (recAutoSetTimer.current) clearTimeout(recAutoSetTimer.current);
        setRecAutoSet(true);
        recAutoSetTimer.current = setTimeout(() => setRecAutoSet(false), 2000);
      }
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = t(language, 'val_title_required');
    if (!due.trim()) e.due = t(language, 'val_date_required');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) e.due = t(language, 'val_date_invalid');
    else if (isNaN(parseLocalDate(due).getTime())) e.due = t(language, 'val_date_invalid');
    else {
      const y = parseLocalDate(due).getFullYear();
      if (y < 2000 || y > 2099) e.due = t(language, 'val_date_invalid');
    }
    const normalizedAmt = amt.trim().replace(',', '.');
    const amtNum = Number(normalizedAmt);
    if (normalizedAmt && (isNaN(amtNum) || amtNum < 0 || amtNum > 999_999_999 || !/^\d{1,9}(\.\d{1,2})?$/.test(normalizedAmt))) e.amt = t(language, 'val_amount_positive');
    setErrors(e);
    if (Object.keys(e).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (savingRef.current) return; // Prevent double-tap
    if (!validate()) return;
    savingRef.current = true;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const sanitizedCustomType = customType.trim().replace(/[^\p{L}\p{N}\s\-.,()]/gu, '').trim();
    const finalType = type === 'Altele' ? (sanitizedCustomType || 'Altele') : (type || subtypes[0] || '');
    // Auto-save new custom subtype for future use
    if (type === 'Altele' && sanitizedCustomType && sanitizedCustomType !== 'Altele') {
      const existing = customSubtypes?.[cat] || [];
      if (!existing.includes(sanitizedCustomType) && !presetSubtypes.includes(sanitizedCustomType)) {
        updateSetting('customSubtypes', { ...customSubtypes, [cat]: [...existing, sanitizedCustomType] });
      }
    }
    const docData: Omit<RawDocument, 'id'> = {
      cat, type: finalType, title: title.trim(),
      asset: asset.trim() || undefined, due,
      amt: amt.trim() ? Number(amt.trim().replace(',', '.')) : null, rec,
      notes: notes.trim() || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    try {
      if (effectiveEdit && existingDoc) {
        updateDocument({ ...docData, id: existingDoc.id } as RawDocument);
      } else {
        addDocument(docData);
      }
      // Show success animation then navigate back
      setShowSuccess(true);
      successScale.setValue(0);
      successOpacity.setValue(1);
      Animated.sequence([
        Animated.spring(successScale, { toValue: 1, speed: 12, bounciness: 8, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(successOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => router.back());
    } catch {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const categoryIds = Object.keys(CATEGORIES) as CategoryId[];

  return (
      <KeyboardAvoidingView
        style={[s.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 160 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
            {/* Modal header — Cancel | grabber | title */}
            <FadeInView delay={0} style={s.modalHeader}>
              <AnimatedPressable onPress={handleCancel} haptic={false} accessibilityLabel={t(language, 'a11y_cancel')}>
                <Text style={s.cancelText}>{t(language, 'confirm_cancel')}</Text>
              </AnimatedPressable>
              <View style={[s.grabber, { backgroundColor: theme.grabber }]} />
              <View style={{ width: 60 }} />
            </FadeInView>

            <FadeInView delay={100}>
              <Text style={[s.largeTitle, { color: theme.text }]} accessibilityRole="header">
                {effectiveEdit ? t(language, 'form_edit_title') : t(language, 'form_add_title')}
              </Text>
            </FadeInView>

            {/* Category */}
            <FadeInView delay={150}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'form_category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {categoryIds.map((catId) => {
                  const c = CATEGORIES[catId];
                  const selected = cat === catId;
                  return (
                    <AnimatedPressable
                      key={catId}
                      style={[s.catChip, {
                        backgroundColor: selected ? c.color + '18' : theme.card,
                        borderColor: selected ? c.color : 'transparent',
                      }]}
                      onPress={() => setCat(catId)}
                      hapticStyle="selection"
                      accessibilityLabel={t(language, 'a11y_select_category', { name: t(language, c.labelKey) })}
                      accessibilityState={{ selected }}
                    >
                      <Ionicons name={selected ? c.iconFilled : c.icon} size={16} color={selected ? c.color : theme.textMuted} />
                      <Text style={[s.catChipLabel, { color: selected ? c.color : theme.textSecondary }]}>
                        {t(language, c.labelKey)}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </ScrollView>
            </FadeInView>

            {/* General — consolidated card: Type, Title, Asset, Date, Amount, Recurrence */}
            <FadeInView delay={200}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'settings_general')}</Text>
              <View style={[s.group, { backgroundColor: theme.card }]}>
                {/* Type row — tappable, opens modal */}
                <AnimatedPressable style={s.inputRow} onPress={() => { setTypeSearch(''); setShowTypePicker(true); }} haptic={false} accessibilityLabel={t(language, 'form_type')} accessibilityRole="button">
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>{t(language, 'form_type')}</Text>
                  <Text style={[s.inputField, { color: type ? theme.text : theme.textDim }]} numberOfLines={1}>
                    {type === 'Altele'
                      ? (customType.trim() || translateSubtype('Altele', language))
                      : (type ? translateSubtype(type, language) : t(language, 'form_type_select'))}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 4 }} />
                </AnimatedPressable>
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                <View style={s.inputRow}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>{t(language, 'form_title')}</Text>
                  <TextInput style={[s.inputField, { color: theme.text }]} value={title}
                    onChangeText={(v) => { setTitle(v); clearError('title'); }}
                    placeholder={t(language, 'form_title_placeholder')} placeholderTextColor={theme.textDim}
                    returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
                    maxLength={150}
                    accessibilityLabel={t(language, 'form_title')}
                    aria-invalid={!!errors.title} />
                </View>
                {errors.title ? <Text style={s.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">{errors.title}</Text> : null}
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                <View style={s.inputRow}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>{t(language, 'form_asset')}</Text>
                  <TextInput style={[s.inputField, { color: theme.text }]} value={asset} onChangeText={setAsset}
                    placeholder={t(language, 'form_asset_placeholder')} placeholderTextColor={theme.textDim}
                    returnKeyType="next" onSubmitEditing={Keyboard.dismiss}
                    maxLength={100}
                    accessibilityLabel={t(language, 'form_asset')} />
                </View>
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                {/* Date — tap to show picker, Done to dismiss */}
                <AnimatedPressable style={s.inputRow} onPress={() => setShowDatePicker(true)} haptic={false} accessibilityLabel={t(language, 'form_due')} accessibilityRole="button">
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>{t(language, 'form_due')}</Text>
                  <Text style={[s.inputField, { color: due ? theme.text : theme.textDim }]}>
                    {due ? formatDate(due, language) : t(language, 'form_date_placeholder')}
                  </Text>
                </AnimatedPressable>
                {showDatePicker && (
                  <View style={s.datePickerContainer}>
                    <View style={s.datePickerHeader}>
                      <AnimatedPressable onPress={() => setShowDatePicker(false)} haptic={false}
                        accessibilityLabel={t(language, 'form_done')} accessibilityRole="button">
                        <Text style={s.doneText}>{t(language, 'form_done')}</Text>
                      </AnimatedPressable>
                    </View>
                    <DateTimePicker
                      value={pickerDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleDateChange}
                      themeVariant="dark"
                      accessibilityLabel={t(language, 'form_due')}
                    />
                  </View>
                )}
                {errors.due ? <Text style={s.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">{errors.due}</Text> : null}
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                <View style={s.inputRow}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>{t(language, 'form_amount')}</Text>
                  <TextInput style={[s.inputField, { color: theme.text }]} value={amt}
                    onChangeText={(v) => { setAmt(v); clearError('amt'); }}
                    placeholder="0" placeholderTextColor={theme.textDim} keyboardType="decimal-pad"
                    returnKeyType="done" maxLength={12}
                    inputAccessoryViewID={Platform.OS === 'ios' ? 'amtKeyboardDone' : undefined}
                    accessibilityLabel={t(language, 'form_amount')}
                    aria-invalid={!!errors.amt} />
                  {amt.trim().length > 0 && (
                    <Text style={{ fontSize: 15, color: theme.textMuted, marginLeft: 6 }}>{currency}</Text>
                  )}
                </View>
                {errors.amt ? <Text style={s.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">{errors.amt}</Text> : null}
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                {/* Recurrence — label + SegmentedControl stacked */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t(language, 'form_recurrence')}</Text>
                  <SegmentedControl
                    options={RECURRENCE_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(language, opt.labelKey + '_short'),
                    }))}
                    selected={rec}
                    onSelect={(v) => setRec(v as RecurrenceValue)}
                    theme={theme}
                    fullWidth
                  />
                  {recAutoSet && (
                    <Text style={{ fontSize: 12, color: '#34C759', marginTop: 6, fontWeight: '500' }}>
                      {t(language, 'smart_default_applied')}
                    </Text>
                  )}
                </View>
              </View>
            </FadeInView>

            {/* Subtype Picker Modal */}
            <Modal
              visible={showTypePicker}
              animationType="slide"
              transparent
              onRequestClose={() => setShowTypePicker(false)}
              statusBarTranslucent
              accessibilityViewIsModal
            >
              <View style={[s.pickerOverlay, { backgroundColor: theme.background }]}>
                {/* Modal header */}
                <View style={[s.pickerHeader, { paddingTop: insets.top + 8 }]}>
                  <AnimatedPressable onPress={() => setShowTypePicker(false)} haptic={false}
                    accessibilityLabel={t(language, 'confirm_cancel')} accessibilityRole="button">
                    <Text style={s.cancelText}>{t(language, 'confirm_cancel')}</Text>
                  </AnimatedPressable>
                  <Text style={[s.pickerTitle, { color: theme.text }]} accessibilityRole="header">{t(language, 'form_type')}</Text>
                  <View style={{ width: 60 }} />
                </View>

                {/* Search bar */}
                <View style={[s.searchBarWrap, { backgroundColor: theme.inputFill }]}>
                  <Ionicons name="search" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[s.searchInput, { color: theme.text }]}
                    value={typeSearch}
                    onChangeText={setTypeSearch}
                    placeholder={t(language, 'form_search_type')}
                    placeholderTextColor={theme.textDim}
                    returnKeyType="done"
                    accessibilityLabel={t(language, 'form_search_type')}
                  />
                  {typeSearch.length > 0 && (
                    <AnimatedPressable onPress={() => setTypeSearch('')} haptic={false}
                      accessibilityLabel={t(language, 'a11y_clear_search')} accessibilityRole="button">
                      <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                    </AnimatedPressable>
                  )}
                </View>

                {/* Subtype list */}
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                  <View style={[s.group, { backgroundColor: theme.card, marginTop: 8 }]}>
                    {subtypes.filter((sub) => {
                      if (!typeSearch.trim()) return true;
                      const q = typeSearch.toLowerCase();
                      const translated = translateSubtype(sub, language).toLowerCase();
                      const raw = sub.toLowerCase();
                      return translated.includes(q) || raw.includes(q);
                    }).map((sub, idx, arr) => (
                      <React.Fragment key={sub}>
                        <AnimatedPressable
                          style={s.pickerRow}
                          onPress={() => {
                            handleSubtypeSelect(sub);
                            if (sub !== 'Altele') {
                              setCustomType('');
                              setTimeout(() => setShowTypePicker(false), 200);
                            }
                          }}
                          hapticStyle="selection"
                          accessibilityLabel={t(language, 'a11y_select_type', { name: translateSubtype(sub, language) })}
                          accessibilityState={{ selected: type === sub }}
                        >
                          <Text style={[s.pickerRowText, { color: theme.text, flex: 1 }]}>
                            {translateSubtype(sub, language)}
                          </Text>
                          {type === sub && (
                            <Ionicons name="checkmark" size={20} color="#007AFF" />
                          )}
                          {savedCustom.includes(sub) && (
                            <AnimatedPressable
                              onPress={() => {
                                Alert.alert(
                                  t(language, 'confirm_delete_type_title'),
                                  t(language, 'confirm_delete_type_msg', { name: sub }),
                                  [
                                    { text: t(language, 'confirm_cancel'), style: 'cancel' },
                                    { text: t(language, 'confirm_delete_btn'), style: 'destructive', onPress: () => {
                                      const updated = savedCustom.filter((c) => c !== sub);
                                      updateSetting('customSubtypes', { ...customSubtypes, [cat]: updated });
                                      if (type === sub) { setType(''); setCustomType(''); }
                                    }},
                                  ]
                                );
                              }}
                              haptic={false}
                              accessibilityLabel={t(language, 'a11y_delete_custom_type', { name: sub })}
                              accessibilityRole="button"
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{ marginLeft: 12 }}
                            >
                              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
                            </AnimatedPressable>
                          )}
                        </AnimatedPressable>
                        {idx < arr.length - 1 && <RowDivider theme={theme} />}
                      </React.Fragment>
                    ))}
                  </View>

                  {/* Custom type input when Altele is selected */}
                  {type === 'Altele' && (
                    <View style={[s.group, { backgroundColor: theme.card, marginTop: 12 }]}>
                      <TextInput
                        style={[s.inputField, { color: theme.text, paddingHorizontal: 16, paddingVertical: 12 }]}
                        value={customType}
                        onChangeText={setCustomType}
                        placeholder={t(language, 'form_custom_type_placeholder')}
                        placeholderTextColor={theme.textDim}
                        returnKeyType="done"
                        onSubmitEditing={() => setShowTypePicker(false)}
                        maxLength={100}
                        autoFocus
                        accessibilityLabel={t(language, 'form_custom_type_placeholder')}
                      />
                    </View>
                  )}

                  <View style={{ height: insets.bottom + 20 }} />
                </ScrollView>
              </View>
            </Modal>

            {/* Notes */}
            <FadeInView delay={250}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'form_notes')}</Text>
              <View style={[s.group, { backgroundColor: theme.card }]}>
                <TextInput style={[s.notesInput, { color: theme.text }]} value={notes} onChangeText={setNotes}
                  placeholder={t(language, 'form_notes_placeholder')} placeholderTextColor={theme.textDim}
                  multiline numberOfLines={4} textAlignVertical="top" maxLength={500} returnKeyType="default"
                  onFocus={() => { if (Platform.OS === 'android') setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300); }}
                  inputAccessoryViewID={Platform.OS === 'ios' ? 'notesKeyboardDone' : undefined}
                  accessibilityLabel={t(language, 'form_notes')} />
              </View>
            </FadeInView>

            {/* Attachments */}
            <FadeInView delay={300}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'attachments')}</Text>
              <View style={[s.group, { backgroundColor: theme.card }]}>
                <AttachmentPicker
                  attachments={attachments}
                  onAdd={(att) => setAttachments((prev) => [...prev, att])}
                  onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
                  theme={theme}
                  language={language}
                  documentId={existingDoc?.id}
                />
              </View>
            </FadeInView>
          </ScrollView>

        {/* ─── Sticky bottom save bar ─── */}
        <View style={[s.bottomBar, {
          paddingBottom: insets.bottom + 8,
          backgroundColor: theme.barBackground,
          borderTopColor: theme.divider,
        }]}>
          <AnimatedPressable
            style={s.saveBtn}
            onPress={handleSave}
            hapticStyle="medium"
            accessibilityLabel={t(language, 'a11y_save_document')}
            scaleValue={0.97}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
            ) : (
              <Ionicons name="checkmark" size={20} color="#FFF" style={{ marginRight: 6 }} />
            )}
            <Text style={s.saveBtnText}>
              {t(language, 'form_save')}
            </Text>
          </AnimatedPressable>
        </View>

        {/* iOS "Done" toolbar for decimal-pad keyboard (has no return key) */}
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="notesKeyboardDone">
            <View style={[s.keyboardToolbar, { backgroundColor: theme.card, borderTopColor: theme.divider }]}>
              <View style={{ flex: 1 }} />
              <AnimatedPressable onPress={Keyboard.dismiss} haptic={false}
                accessibilityLabel={t(language, 'form_done')} accessibilityRole="button">
                <Text style={s.doneText}>{t(language, 'form_done')}</Text>
              </AnimatedPressable>
            </View>
          </InputAccessoryView>
        )}
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="amtKeyboardDone">
            <View style={[s.keyboardToolbar, { backgroundColor: theme.card, borderTopColor: theme.divider }]}>
              <View style={{ flex: 1 }} />
              <AnimatedPressable onPress={Keyboard.dismiss} haptic={false}
                accessibilityLabel={t(language, 'form_done')} accessibilityRole="button">
                <Text style={s.doneText}>{t(language, 'form_done')}</Text>
              </AnimatedPressable>
            </View>
          </InputAccessoryView>
        )}
      {/* Success overlay */}
      {showSuccess && (
        <Animated.View style={[s.successOverlay, { opacity: successOpacity }]} pointerEvents="none">
          <Animated.View style={[s.successCircle, { transform: [{ scale: successScale }] }]}>
            <Ionicons name="checkmark" size={44} color="#FFF" />
          </Animated.View>
        </Animated.View>
      )}
      </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 4 },
  cancelText: { color: '#007AFF', fontSize: 17 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  largeTitle: { fontSize: 34, fontWeight: '700', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4, letterSpacing: 0.37 },
  sectionHeader: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  chipRow: { paddingHorizontal: 16, gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, gap: 8 },
  catChipLabel: { fontSize: 14, fontWeight: '500' },
  pickerOverlay: { flex: 1 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  pickerTitle: { fontSize: 17, fontWeight: '600' },
  searchBarWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 44, paddingVertical: 11 },
  pickerRowText: { fontSize: 17 },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  inputRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16 },
  inputLabel: { fontSize: 17, minWidth: 100 },
  inputField: { flex: 1, fontSize: 17, paddingVertical: 11, textAlign: 'right' },
  datePickerContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  datePickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8, paddingBottom: 4, paddingHorizontal: 4 },
  doneText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
  dividerWrap: { paddingLeft: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  notesInput: { fontSize: 17, padding: 16, minHeight: 100 },
  errorText: { color: '#FF3B30', fontSize: 12, fontWeight: '500', paddingHorizontal: 32, paddingTop: 4, paddingBottom: 2 },
  keyboardToolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  // Sticky bottom save bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,14,23,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
