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
import { CATEGORIES, RECURRENCE_QUICK, RECURRENCE_OPTIONS } from '../src/core/constants';
import type { CategoryId, RecurrenceValue, RawDocument, Attachment } from '../src/core/constants';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable, FadeInView } from '../src/components/AnimatedUI';
import { SegmentedControl, RowDivider } from '../src/components/settings/SettingsUI';
import { AttachmentPicker } from '../src/components/AttachmentPicker';
import { getSmartDefaults, autoCategorize } from '../src/core/smartDefaults';
import { getAutoReminderDays } from '../src/core/enrichment';
import { findDuplicate } from '../src/core/helpers';
import { fonts } from '../src/theme/typography';
import { isOcrAvailable, scanDocument } from '../src/services/ocr';
import * as ImagePicker from 'expo-image-picker';
import { showToast } from '../src/stores/useToastStore';

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

  const { editId, cat: catParam, dupCat, dupType, dupTitle, dupAsset, dupAmt, dupRec, dupNotes } = useLocalSearchParams<{
    editId?: string; cat?: string;
    dupCat?: string; dupType?: string; dupTitle?: string; dupAsset?: string; dupAmt?: string; dupRec?: string; dupNotes?: string;
  }>();
  const existingDoc = useEnrichedDocument(editId);
  const addDocument = useDocumentStore((s) => s.addDocument);
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const customSubtypes = useSettingsStore((s) => s.settings.customSubtypes);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const isEdit = !!editId;

  // If editing a document that no longer exists, fall back to add mode
  const effectiveEdit = isEdit && !!existingDoc;

  const todayStr = dateToString(new Date());

  const [cat, setCat] = useState<CategoryId>(existingDoc?.cat || (dupCat as CategoryId) || (catParam as CategoryId) || 'vehicule');
  const initCat = existingDoc?.cat || (catParam as CategoryId) || 'vehicule';
  const initSubtypes = CATEGORIES[initCat]?.subtypes || [];
  const initCustom = customSubtypes?.[initCat] || [];
  const isCustomType = existingDoc?.type ? !initSubtypes.includes(existingDoc.type) && !initCustom.includes(existingDoc.type) : false;
  const [type, setType] = useState<string>(isCustomType ? 'Altele' : (existingDoc?.type || dupType || ''));
  const [customType, setCustomType] = useState<string>(isCustomType ? (existingDoc?.type || '') : '');
  const [title, setTitle] = useState<string>(existingDoc?.title || (dupTitle ? `${dupTitle} (copy)` : ''));
  const [asset, setAsset] = useState<string>(existingDoc?.asset || dupAsset || '');
  // Smart default: +30 days for new docs (today is rarely the right due date)
  const defaultDue = existingDoc?.due || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return dateToString(d);
  })();
  const [due, setDue] = useState<string>(defaultDue);
  const [amt, setAmt] = useState<string>(existingDoc?.amt ? String(existingDoc.amt) : (dupAmt || ''));
  const [rec, setRec] = useState<RecurrenceValue>(existingDoc?.rec || (dupRec as RecurrenceValue) || 'none');
  const [showRecPicker, setShowRecPicker] = useState(false);
  const isCustomRec = rec !== 'none' && rec !== 'monthly' && rec !== 'annual';
  const [customReminders, setCustomReminders] = useState<number[] | null>(existingDoc?.reminderDays || null);
  const [notes, setNotes] = useState<string>(existingDoc?.notes || dupNotes || '');
  // Refs hold current text during typing — no re-renders, fixes Fabric space key bug
  const titleRef = useRef(title);
  const assetRef = useRef(asset);
  const amtRef = useRef(amt);
  const notesRef = useRef(notes);
  const [attachments, setAttachments] = useState<Attachment[]>(existingDoc?.attachments || []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [recAutoSet, setRecAutoSet] = useState(false);
  const recAutoSetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [autoDetected, setAutoDetected] = useState(false);
  const manualCatRef = useRef(false);
  const documents = useDocumentStore((s) => s.documents);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
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

  // Check if user has entered any data (reads from refs for current typing values)
  const getHasUnsavedData = () => isEdit
    ? (titleRef.current.trim() !== (existingDoc?.title || '') ||
       assetRef.current.trim() !== (existingDoc?.asset || '') ||
       amtRef.current.trim() !== (existingDoc?.amt ? String(existingDoc.amt) : '') ||
       notesRef.current.trim() !== (existingDoc?.notes || '') ||
       cat !== (existingDoc?.cat || 'vehicule') ||
       type !== (existingDoc?.type || '') ||
       due !== defaultDue ||
       rec !== (existingDoc?.rec || 'none') ||
       attachments.length !== (existingDoc?.attachments?.length || 0))
    : (titleRef.current.trim().length > 0 || assetRef.current.trim().length > 0 || amtRef.current.trim().length > 0 || notesRef.current.trim().length > 0);

  const handleCancel = () => {
    Keyboard.dismiss();
    if (getHasUnsavedData()) {
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
      if (getHasUnsavedData()) {
        handleCancel();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

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

  const handleScan = async () => {
    if (!isOcrAvailable()) {
      showToast(t(language, 'scan_unavailable'), 'info');
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast(t(language, 'photo_permission'), 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]) return;

      setScanning(true);
      const imageUri = result.assets[0].uri;
      const ocrResult = await scanDocument(imageUri);

      // Auto-fill form fields from OCR result
      if (ocrResult.category) { setCat(ocrResult.category); manualCatRef.current = false; }
      if (ocrResult.type) setType(ocrResult.type);
      if (ocrResult.title) { titleRef.current = ocrResult.title; setTitle(ocrResult.title); }
      if (ocrResult.date) { setDue(ocrResult.date); setPickerDate(stringToDate(ocrResult.date)); }
      if (ocrResult.amount != null) { amtRef.current = String(ocrResult.amount); setAmt(String(ocrResult.amount)); }

      // Apply smart defaults for recurrence based on detected type
      if (ocrResult.type && rec === 'none') {
        const defaults = getSmartDefaults(ocrResult.type);
        if (defaults) setRec(defaults.recurrence);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showToast(t(language, 'scan_success'));
    } catch (e) {
      showToast(t(language, 'scan_error'), 'error');
    } finally {
      setScanning(false);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!titleRef.current.trim()) e.title = t(language, 'val_title_required');
    if (!due.trim()) e.due = t(language, 'val_date_required');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) e.due = t(language, 'val_date_invalid');
    else if (isNaN(parseLocalDate(due).getTime())) e.due = t(language, 'val_date_invalid');
    else {
      const y = parseLocalDate(due).getFullYear();
      if (y < 2000 || y > 2099) e.due = t(language, 'val_date_invalid');
    }
    const normalizedAmt = amtRef.current.trim().replace(',', '.');
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
      cat, type: finalType, title: titleRef.current.trim(),
      asset: assetRef.current.trim() || undefined, due,
      amt: amtRef.current.trim() ? Number(amtRef.current.trim().replace(',', '.')) : null, rec,
      notes: notesRef.current.trim() || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      reminderDays: customReminders || undefined,
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
            {/* Modal header — Cancel | title | scan */}
            <FadeInView delay={0} style={s.modalHeader}>
              <AnimatedPressable onPress={handleCancel} haptic={false} accessibilityLabel={t(language, 'a11y_cancel')}>
                <Text style={[s.cancelText, { color: theme.primary }]}>{t(language, 'confirm_cancel')}</Text>
              </AnimatedPressable>
              <Text style={[s.headerTitle, { color: theme.text }]}>
                {effectiveEdit ? t(language, 'form_edit_title') : t(language, 'form_add_title')}
              </Text>
              {!effectiveEdit ? (
                <AnimatedPressable
                  onPress={handleScan}
                  hapticStyle="light"
                  style={{ width: 60, alignItems: 'flex-end' }}
                  accessibilityLabel={t(language, 'scan_btn')}
                  disabled={scanning}
                >
                  <Ionicons name="scan-outline" size={22} color={theme.primary} />
                </AnimatedPressable>
              ) : (
                <View style={{ width: 60 }} />
              )}
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
                      onPress={() => { manualCatRef.current = true; setCat(catId); }}
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
              {autoDetected && (
                <Text style={{ fontSize: 12, color: '#34C759', marginTop: 6, fontWeight: '500', fontFamily: fonts.medium, paddingHorizontal: 20 }}>
                  {t(language, 'auto_detected')}
                </Text>
              )}
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
                  <TextInput style={[s.inputField, { color: theme.text }]} defaultValue={title}
                    onChangeText={(v) => { titleRef.current = v; }}
                    onBlur={() => {
                      setTitle(titleRef.current); clearError('title');
                      if (!isEdit && !manualCatRef.current) {
                        const detected = autoCategorize(titleRef.current);
                        if (detected) {
                          if (detected.cat) setCat(detected.cat);
                          if (detected.type) setType(detected.type);
                          setAutoDetected(true);
                          setTimeout(() => setAutoDetected(false), 2500);
                        }
                      }
                      const dup = findDuplicate(documents, cat, type, titleRef.current, editId);
                      setDuplicateWarning(dup ? dup.title : null);
                    }}
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
                  <TextInput style={[s.inputField, { color: theme.text }]} defaultValue={asset}
                    onChangeText={(v) => { assetRef.current = v; }}
                    onBlur={() => setAsset(assetRef.current)}
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
                      <AnimatedPressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowDatePicker(false); }} haptic={false}
                        accessibilityLabel={t(language, 'form_done')} accessibilityRole="button">
                        <Text style={[s.doneText, { color: theme.primary }]}>{t(language, 'form_done')}</Text>
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
                  <TextInput style={[s.inputField, { color: theme.text }]} defaultValue={amt}
                    onChangeText={(v) => { amtRef.current = v; }}
                    onBlur={() => { setAmt(amtRef.current); clearError('amt'); }}
                    placeholder="0" placeholderTextColor={theme.textDim} keyboardType="decimal-pad"
                    returnKeyType="done" maxLength={12}
                    inputAccessoryViewID={Platform.OS === 'ios' ? 'amtKeyboardDone' : undefined}
                    accessibilityLabel={t(language, 'form_amount')}
                    aria-invalid={!!errors.amt} />
                  <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: theme.textMuted, marginLeft: 6 }}>{currency}</Text>
                </View>
                {errors.amt ? <Text style={s.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">{errors.amt}</Text> : null}
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                {/* Recurrence — 3 quick chips + Custom */}
                <View style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t(language, 'form_recurrence')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {RECURRENCE_QUICK.map((opt) => {
                      const isActive = rec === opt.value;
                      return (
                        <View key={opt.value} style={{ flex: 1 }}>
                          <AnimatedPressable
                            style={{
                              alignItems: 'center',
                              paddingVertical: 10, borderRadius: 10,
                              backgroundColor: isActive ? theme.primary : theme.inputFill,
                            }}
                            onPress={() => { setRec(opt.value); setShowRecPicker(false); }}
                            hapticStyle="selection"
                            accessibilityLabel={t(language, opt.labelKey)}
                            accessibilityState={{ selected: isActive }}
                          >
                            <Text style={{
                              fontSize: 14,
                              fontFamily: isActive ? fonts.semiBold : fonts.medium,
                              color: isActive ? '#FFF' : theme.textSecondary,
                            }}>
                              {t(language, opt.labelKey + '_short')}
                            </Text>
                          </AnimatedPressable>
                        </View>
                      );
                    })}
                    <View style={{ flex: 1 }}>
                      <AnimatedPressable
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                          paddingVertical: 10, borderRadius: 10,
                          backgroundColor: isCustomRec ? theme.primary : theme.inputFill,
                        }}
                        onPress={() => setShowRecPicker(!showRecPicker)}
                        hapticStyle="selection"
                        accessibilityLabel={t(language, 'rec_custom')}
                      >
                        <Text numberOfLines={1} style={{
                          fontSize: 13,
                          fontFamily: isCustomRec ? fonts.semiBold : fonts.medium,
                          color: isCustomRec ? '#FFF' : theme.textSecondary,
                        }}>
                          {isCustomRec ? t(language, RECURRENCE_OPTIONS.find((o) => o.value === rec)?.labelKey + '_short' || 'rec_custom') : t(language, 'rec_custom')}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color={isCustomRec ? '#FFF' : theme.textMuted} />
                      </AnimatedPressable>
                    </View>
                  </View>
                  {recAutoSet && (
                    <Text style={{ fontSize: 12, color: '#34C759', marginTop: 6, fontWeight: '500', fontFamily: fonts.medium }}>
                      {t(language, 'smart_default_applied')}
                    </Text>
                  )}
                </View>

                {/* Custom recurrence modal */}
                {showRecPicker && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <View style={[s.group, { backgroundColor: theme.card }]}>
                      {RECURRENCE_OPTIONS.map((opt, i) => (
                        <View key={opt.value}>
                          <AnimatedPressable
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, minHeight: 44 }}
                            onPress={() => { setRec(opt.value); setShowRecPicker(false); }}
                            hapticStyle="selection"
                          >
                            <Text style={{ flex: 1, fontSize: 17, fontFamily: fonts.regular, color: rec === opt.value ? theme.primary : theme.text }}>
                              {t(language, opt.labelKey)}
                            </Text>
                            {rec === opt.value && <Ionicons name="checkmark" size={20} color={theme.primary} />}
                          </AnimatedPressable>
                          {i < RECURRENCE_OPTIONS.length - 1 && (
                            <View style={{ paddingLeft: 16 }}><View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} /></View>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Reminder — auto or custom */}
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>
                <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t(language, 'form_reminder')}
                  </Text>
                  <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: theme.textMuted, marginBottom: 8 }}>
                    {t(language, 'form_reminder_auto')}: {getAutoReminderDays(rec).map(d => `${d}${t(language, 'form_reminder_days_suffix')}`).join(', ')}
                  </Text>
                  {(() => {
                    // -1 = 1 day AFTER expiry (safety net, red)
                    const allDays = [1, 3, 7, 14, 30, 60, 90, -1];
                    const row1 = allDays.slice(0, 4);
                    const row2 = allDays.slice(4);
                    const autoDefault = getAutoReminderDays(rec);
                    const isAuto = !customReminders;
                    const renderChip = (day: number) => {
                      const isOverdue = day < 0;
                      const isSelected = isAuto
                        ? autoDefault.includes(day)
                        : (customReminders || []).includes(day);
                      return (
                        <View key={day} style={{ flex: 1 }}>
                          <AnimatedPressable
                            style={{
                              alignItems: 'center', justifyContent: 'center',
                              minHeight: 36, borderRadius: 10,
                              backgroundColor: isSelected
                                ? (isOverdue ? '#FF3B30' : theme.primary)
                                : theme.inputFill,
                              opacity: isAuto && !autoDefault.includes(day) ? 0.4 : 1,
                            }}
                            onPress={() => {
                              const current = customReminders || [...autoDefault];
                              const next = current.includes(day)
                                ? current.filter(d => d !== day)
                                : [...current, day].sort((a, b) => a - b);
                              setCustomReminders(next.length > 0 ? next : null);
                            }}
                            hapticStyle="selection"
                          >
                            <Text style={{
                              fontSize: 14,
                              fontFamily: isSelected ? fonts.semiBold : fonts.medium,
                              color: isSelected ? '#FFF' : (isOverdue ? '#FF3B30' : theme.textSecondary),
                            }}>
                              {isOverdue ? `+1${t(language, 'form_reminder_days_suffix')}` : `${day}${t(language, 'form_reminder_days_suffix')}`}
                            </Text>
                          </AnimatedPressable>
                        </View>
                      );
                    };
                    return (
                      <View style={{ gap: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {row1.map(renderChip)}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {row2.map(renderChip)}
                        </View>
                      </View>
                    );
                  })()}
                  {customReminders && (
                    <AnimatedPressable
                      onPress={() => setCustomReminders(null)}
                      haptic={false}
                      style={{ marginTop: 6 }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: theme.primary }}>
                        {t(language, 'form_reminder_reset')}
                      </Text>
                    </AnimatedPressable>
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
                    <Text style={[s.cancelText, { color: theme.primary }]}>{t(language, 'confirm_cancel')}</Text>
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
                            <Ionicons name="checkmark" size={20} color={theme.primary} />
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

            {duplicateWarning && (
              <View style={{ marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FF950014', borderRadius: 10, borderWidth: 1, borderColor: '#FF950033', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="alert-circle" size={18} color="#FF9500" />
                <Text style={{ flex: 1, fontSize: 13, color: '#FF9500', fontFamily: fonts.medium }}>{t(language, 'duplicate_warning')}</Text>
              </View>
            )}

            {/* Notes */}
            <FadeInView delay={250}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'form_notes')}</Text>
              <View style={[s.group, { backgroundColor: theme.card }]}>
                <TextInput style={[s.notesInput, { color: theme.text }]} defaultValue={notes}
                  onChangeText={(v) => { notesRef.current = v; }}
                  onBlur={() => setNotes(notesRef.current)}
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
            style={[s.saveBtn, { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, overflow: 'hidden' }]}
            onPress={handleSave}
            hapticStyle="medium"
            accessibilityLabel={t(language, 'a11y_save_document')}
            scaleValue={0.97}
            disabled={saving}
          >
            <LinearGradient
              colors={['#0E8BFF', '#0A79F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
              ) : (
                <Ionicons name="checkmark" size={20} color="#FFF" style={{ marginRight: 6 }} />
              )}
              <Text style={s.saveBtnText}>
                {t(language, 'form_save')}
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>

        {/* iOS "Done" toolbar for decimal-pad keyboard (has no return key) */}
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="notesKeyboardDone">
            <View style={[s.keyboardToolbar, { backgroundColor: theme.card, borderTopColor: theme.divider }]}>
              <View style={{ flex: 1 }} />
              <AnimatedPressable onPress={Keyboard.dismiss} haptic={false}
                accessibilityLabel={t(language, 'form_done')} accessibilityRole="button">
                <Text style={[s.doneText, { color: theme.primary }]}>{t(language, 'form_done')}</Text>
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
                <Text style={[s.doneText, { color: theme.primary }]}>{t(language, 'form_done')}</Text>
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
  cancelText: { fontSize: 17, fontFamily: fonts.regular },
  headerTitle: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  largeTitle: { fontSize: 34, fontWeight: '700', fontFamily: fonts.bold, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4, letterSpacing: 0.37 },
  sectionHeader: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  chipRow: { paddingHorizontal: 16, gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 2, gap: 8 },
  catChipLabel: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium },
  pickerOverlay: { flex: 1 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  pickerTitle: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  searchBarWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: fonts.regular, paddingVertical: 0 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 44, paddingVertical: 11 },
  pickerRowText: { fontSize: 17, fontFamily: fonts.regular },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  inputRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16 },
  inputLabel: { fontSize: 17, fontFamily: fonts.regular, minWidth: 100 },
  inputField: { flex: 1, fontSize: 17, fontFamily: fonts.regular, paddingVertical: 11 },
  datePickerContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  datePickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8, paddingBottom: 4, paddingHorizontal: 4 },
  doneText: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  dividerWrap: { paddingLeft: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  notesInput: { fontSize: 17, fontFamily: fonts.regular, padding: 16, minHeight: 100 },
  errorText: { color: '#FF3B30', fontSize: 12, fontWeight: '500', fontFamily: fonts.medium, paddingHorizontal: 32, paddingTop: 4, paddingBottom: 2 },
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
    borderRadius: 16,
    overflow: 'hidden',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,14,23,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
