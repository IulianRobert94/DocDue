/**
 * Document Form — Apple HIG 2025 v12
 * Modal form: compact DateTimePicker on iOS
 * Sticky bottom save bar + header cancel/save
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Alert,
  Platform, Keyboard, InputAccessoryView, BackHandler,
  ActivityIndicator, Modal, KeyboardAvoidingView, Animated, Linking, ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { useTheme, useLanguage, useCurrency, useSettingsStore } from '../src/stores/useSettingsStore';
import { useDocumentStore, useEnrichedDocument } from '../src/stores/useDocumentStore';
import { t, tp, translateSubtype } from '../src/core/i18n';
import { parseLocalDate, addDaysToDate, addMonthsKeepingDay, getTodayString } from '../src/core/dateUtils';
import { formatDate, getRecurrenceLabel } from '../src/core/formatters';
import { CATEGORIES, RECURRENCE_QUICK, RECURRENCE_OPTIONS, MAX_ATTACHMENTS } from '../src/core/constants';
import type { CategoryId, RecurrenceValue, RawDocument, Attachment } from '../src/core/constants';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable, FadeInView, useReduceMotion } from '../src/components/AnimatedUI';
import { RowDivider } from '../src/components/settings/SettingsUI';
import { AttachmentPicker, deleteAttachmentFiles, saveImageAttachment } from '../src/components/AttachmentPicker';
import { autoCategorize, resolveRecurrenceForType } from '../src/core/smartDefaults';
import { getAutoReminderDays } from '../src/core/enrichment';
import { findDuplicate, isAtFreeLimit, countTowardFreeLimit, isDemoDocument } from '../src/core/helpers';
import { autoTitle, companionTypes, dateShortcuts, knownAssets, legalDueDate, upcomingReminderDates } from '../src/core/formHelpers';
import { matchesSearch } from '../src/core/search';
import { validateDocument } from '../src/core/validators';
import { fonts } from '../src/theme/typography';
import { isOcrAvailable, scanDocument, hasExtractedData } from '../src/services/ocr';
import * as ImagePicker from 'expo-image-picker';
import { showToast } from '../src/stores/useToastStore';
import { getNotificationPermissionStatus, requestNotificationPermission, syncAllNotifications } from '../src/services/notifications';

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

  const { editId, cat: catParam, dupCat, dupType, dupTitle, dupAsset, dupAmt, dupRec, dupNotes, prefillTitle, prefillDue, prefillAsset, prefillType } = useLocalSearchParams<{
    editId?: string; cat?: string;
    dupCat?: string; dupType?: string; dupTitle?: string; dupAsset?: string; dupAmt?: string; dupRec?: string; dupNotes?: string;
    prefillTitle?: string; prefillDue?: string; prefillAsset?: string; prefillType?: string;
  }>();
  const existingDoc = useEnrichedDocument(editId);
  const addDocument = useDocumentStore((s) => s.addDocument);
  const updateDocument = useDocumentStore((s) => s.updateDocument);
  const customSubtypes = useSettingsStore((s) => s.settings.customSubtypes);
  const updateSetting = useSettingsStore((s) => s.updateSetting);

  const isEdit = !!editId;

  // If editing a document that no longer exists, fall back to add mode
  const effectiveEdit = isEdit && !!existingDoc;


  const [cat, setCat] = useState<CategoryId>(existingDoc?.cat || (dupCat as CategoryId) || (catParam as CategoryId) || 'vehicule');
  const initCat = existingDoc?.cat || (catParam as CategoryId) || 'vehicule';
  const initSubtypes = CATEGORIES[initCat]?.subtypes || [];
  const initCustom = customSubtypes?.[initCat] || [];
  const isCustomType = existingDoc?.type ? !initSubtypes.includes(existingDoc.type) && !initCustom.includes(existingDoc.type) : false;
  const [type, setType] = useState<string>(isCustomType ? 'Altele' : (existingDoc?.type || dupType || prefillType || ''));
  const [customType, setCustomType] = useState<string>(isCustomType ? (existingDoc?.type || '') : '');
  const [title, setTitle] = useState<string>(
    existingDoc?.title || prefillTitle || (dupTitle ? `${dupTitle} ${t(language, 'copy_suffix')}` : '')
  );
  const [asset, setAsset] = useState<string>(existingDoc?.asset || dupAsset || prefillAsset || '');
  // Smart default: +30 days for new docs (today is rarely the right due date)
  const defaultDue = existingDoc?.due
    || (prefillDue && !isNaN(parseLocalDate(prefillDue).getTime()) ? prefillDue : null)
    || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return dateToString(d);
    })();
  const [due, setDue] = useState<string>(defaultDue);
  // Where the due date came from: a guess (+30 days) the user should check, a
  // legal deadline, or the user / the document itself
  const [dueSource, setDueSource] = useState<'default' | 'legal' | 'user'>(
    existingDoc?.due || defaultDue !== addDaysToDate(getTodayString(), 30) ? 'user' : 'default');
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
  const originalAttachmentIds = useRef(new Set((existingDoc?.attachments || []).map((a) => a.id)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const reduceMotion = useReduceMotion();
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [recAutoSet, setRecAutoSet] = useState(false);
  const recAutoSetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [autoDetected, setAutoDetected] = useState(false);
  // Picked by the user (counts as unsaved input)
  const manualCatRef = useRef(false);
  // Opened from a category screen or with a prefilled title: auto-detect may
  // refine the type but never moves the document to another category
  const catLockedRef = useRef(!!prefillTitle || !!catParam || !!prefillType);
  // Cars / homes already used, offered as one-tap choices
  const assetSuggestions = useMemo(() => knownAssets(useDocumentStore.getState().documents.filter((d) => !isDemoDocument(d))), []);
  const [assetKey, setAssetKey] = useState(0);
  // The text fields are uncontrolled (Fabric): a scan that fills them remounts them
  const [amtKey, setAmtKey] = useState(0);
  const [titleKey, setTitleKey] = useState(0);
  // Reminders can't arrive: notifications off in the app, or denied in system settings
  const notificationsEnabled = useSettingsStore((s) => s.settings.notificationsEnabled);
  const [permDenied, setPermDenied] = useState(false);
  useEffect(() => {
    getNotificationPermissionStatus().then((status) => setPermDenied(status === 'denied')).catch(() => {});
  }, []);
  // What the user chose themselves (vs. values the form filled in)
  const typeTouchedRef = useRef(false);
  const dueTouchedRef = useRef(false);
  const recTouchedRef = useRef(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const [typeSearchKey, setTypeSearchKey] = useState(0);
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
  // Opens on the due date shown in the form (not today)
  const [pickerDate, setPickerDate] = useState<Date>(stringToDate(defaultDue));

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
  const getHasUnsavedData = () => {
    if (isEdit) {
      const effectiveType = type === 'Altele' ? (customType.trim() || 'Altele') : type;
      return (titleRef.current.trim() !== (existingDoc?.title || '') ||
        assetRef.current.trim() !== (existingDoc?.asset || '') ||
        amtRef.current.trim() !== (existingDoc?.amt ? String(existingDoc.amt) : '') ||
        notesRef.current.trim() !== (existingDoc?.notes || '') ||
        cat !== (existingDoc?.cat || 'vehicule') ||
        effectiveType !== (existingDoc?.type || '') ||
        due !== defaultDue ||
        rec !== (existingDoc?.rec || 'none') ||
        JSON.stringify(customReminders) !== JSON.stringify(existingDoc?.reminderDays || null) ||
        attachments.length !== (existingDoc?.attachments?.length || 0));
    }
    // New document: only what the user entered or chose counts — values the
    // form filled in itself (default type, due date, smart recurrence) don't,
    // so cancelling an untouched form doesn't ask "discard changes?".
    return (titleRef.current.trim().length > 0 ||
      assetRef.current.trim().length > 0 ||
      amtRef.current.trim().length > 0 ||
      notesRef.current.trim().length > 0 ||
      attachments.length > 0 ||
      customReminders !== null ||
      manualCatRef.current || typeTouchedRef.current || dueTouchedRef.current || recTouchedRef.current);
  };

  const cleanupNewAttachments = () => {
    // Delete files for attachments added during this session (not in original)
    const added = attachments.filter((a) => !originalAttachmentIds.current.has(a.id));
    if (added.length > 0) deleteAttachmentFiles(added);
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    if (getHasUnsavedData()) {
      Alert.alert(
        t(language, 'confirm_discard_title'),
        t(language, 'confirm_discard_msg'),
        [
          { text: t(language, 'confirm_cancel'), style: 'cancel' },
          { text: t(language, 'confirm_discard_btn'), style: 'destructive', onPress: () => { cleanupNewAttachments(); router.back(); } },
        ]
      );
    } else {
      cleanupNewAttachments();
      router.back();
    }
  };

  // Android back button: same unsaved-data check as Cancel. The listener is
  // registered once, so it reads the handler from a ref that every render
  // refreshes — otherwise it would only ever see the first render's state.
  const onHardwareBackRef = useRef<() => boolean>(() => false);
  onHardwareBackRef.current = () => {
    if (getHasUnsavedData()) {
      handleCancel();
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => onHardwareBackRef.current());
    return () => sub.remove();
  }, []);

  /** Smart recurrence (and a legal deadline) for a type the user picked or the form pre-filled (new docs only). */
  const applyTypeDefaults = (sub: string) => {
    if (isEdit) return;
    const legal = legalDueDate(sub, getTodayString());
    if (legal && dueSource !== 'user') {
      setDue(legal); setPickerDate(stringToDate(legal)); setDueSource('legal');
    } else if (!legal && dueSource === 'legal') {
      const guess = addDaysToDate(getTodayString(), 30);
      setDue(guess); setPickerDate(stringToDate(guess)); setDueSource('default');
    }
    const next = resolveRecurrenceForType(sub, rec, recTouchedRef.current);
    if (next === rec) return;
    setRec(next);
    if (recAutoSetTimer.current) clearTimeout(recAutoSetTimer.current);
    setRecAutoSet(true);
    recAutoSetTimer.current = setTimeout(() => setRecAutoSet(false), 2000);
  };

  // A type passed in ("Adaugă și ITP…") gets its smart defaults like a picked one:
  // recurrence and, for local taxes, the legal deadline
  useEffect(() => {
    if (!isEdit && prefillType && !dupRec) applyTypeDefaults(prefillType);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the form opens
  }, []);

  // A type from another category doesn't fit: clear it so the user picks one
  // (silently taking the first type saved "Curent electric · Lunar" for anything in Casă)
  useEffect(() => {
    if (!isEdit && type && type !== 'Altele' && !subtypes.includes(type)) {
      setType('');
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
      dueTouchedRef.current = true;
      setDueSource('user');
      setPickerDate(selectedDate);
      setDue(dateToString(selectedDate));
      clearError('due');
    }
  };

  /** "+1 an" etc.: the date that many months from today */
  const pickDateShortcut = (months: number) => {
    const today = getTodayString();
    const date = addMonthsKeepingDay(today, months, Number(today.slice(8, 10)));
    dueTouchedRef.current = true;
    setDueSource('user');
    setDue(date);
    setPickerDate(stringToDate(date));
    clearError('due');
  };

  const pickAsset = (label: string) => {
    assetRef.current = label;
    setAsset(label);
    setAssetKey((k) => k + 1); // the field is uncontrolled: remount it with the new text
  };

  const clearError = (key: string) => {
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  /** User picked a subtype — apply its smart recurrence (new documents only) */
  const handleSubtypeSelect = (sub: string) => {
    typeTouchedRef.current = true;
    setAutoDetected(false);
    setType(sub);
    applyTypeDefaults(sub);
  };

  /** Camera or gallery (a screenshot of a PDF works too), then read the document */
  const handleScan = () => {
    if (!isOcrAvailable()) {
      showToast(t(language, 'scan_unavailable'), 'info');
      return;
    }
    const options = [t(language, 'confirm_cancel'), t(language, 'from_camera'), t(language, 'from_gallery')];
    const pick = (fromCamera: boolean) => { scanFrom(fromCamera).catch(() => {}); };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0, title: t(language, 'scan_btn') },
        (idx) => { if (idx === 1) pick(true); else if (idx === 2) pick(false); },
      );
    } else {
      Alert.alert(t(language, 'scan_btn'), undefined, [
        { text: options[0], style: 'cancel' },
        { text: options[1], onPress: () => pick(true) },
        { text: options[2], onPress: () => pick(false) },
      ]);
    }
  };

  const scanFrom = async (fromCamera: boolean) => {
    try {
      const { status } = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast(t(language, fromCamera ? 'camera_permission' : 'photo_permission'), 'error');
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]) return;

      setScanning(true);
      const asset = result.assets[0];
      const ocrResult = await scanDocument(asset.uri);

      // Keep the photo with the document — no need to take it twice
      if (attachments.length < MAX_ATTACHMENTS) {
        saveImageAttachment(asset, editId).then((att) => setAttachments((prev) => [...prev, att])).catch(() => {});
      }

      // Editing (renewal): only the new date and amount; a new document gets everything
      if (!effectiveEdit) {
        if (ocrResult.category) { setCat(ocrResult.category); catLockedRef.current = false; }
        if (ocrResult.type) { setType(ocrResult.type); applyTypeDefaults(ocrResult.type); }
        if (ocrResult.title) { titleRef.current = ocrResult.title; setTitle(ocrResult.title); setTitleKey((k) => k + 1); }
      }
      if (ocrResult.date) { dueTouchedRef.current = true; setDueSource('user'); setDue(ocrResult.date); setPickerDate(stringToDate(ocrResult.date)); }
      if (ocrResult.amount != null) { amtRef.current = String(ocrResult.amount); setAmt(String(ocrResult.amount)); setAmtKey((k) => k + 1); }

      // Don't claim success when the photo yielded nothing to fill in
      if (!hasExtractedData(ocrResult)) {
        showToast(t(language, 'scan_nothing_found'), 'info');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Say exactly what was filled in, so the user checks it
      const filled = [
        !effectiveEdit && ocrResult.type ? translateSubtype(ocrResult.type, language) : null,
        ocrResult.date ? formatDate(ocrResult.date, language) : null,
        ocrResult.amount != null ? `${ocrResult.amount} ${currency}` : null,
      ].filter(Boolean).join(' · ');
      showToast(filled ? t(language, 'scan_filled', { fields: filled }) : t(language, 'scan_success'));
    } catch {
      showToast(t(language, 'scan_error'), 'error');
    } finally {
      setScanning(false);
    }
  };

  const validate = (finalTitle: string): boolean => {
    const e: Record<string, string> = {};
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
    // Defense-in-depth: the shared validator must also pass. (It was previously
    // unused/dead code; routing saves through it makes its rules — and its test
    // coverage — actually guard the production save path.)
    const sharedErrors = validateDocument({
      title: finalTitle,
      due,
      cat,
      amt: amtRef.current.trim() ? Number(amtRef.current.trim().replace(',', '.')) : null,
    }, language);
    if (sharedErrors.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(t(language, 'alert_error'), sharedErrors[0]);
      return false;
    }
    return true;
  };

  /**
   * Never asked for notifications yet (e.g. onboarding skipped)? Ask now, in
   * context — right after the user saved a real document.
   */
  const askForRemindersIfNeeded = (): Promise<boolean> =>
    getNotificationPermissionStatus().then((status) => {
      if (status !== 'undetermined') return false;
      Alert.alert(t(language, 'notif_ask_title'), t(language, 'notif_ask_msg'), [
        { text: t(language, 'notif_ask_later'), style: 'cancel' },
        {
          text: t(language, 'notif_allow_btn'),
          onPress: () => {
            requestNotificationPermission().catch(() => false).then((granted) => {
              useSettingsStore.getState().updateSetting('notificationsEnabled', granted);
              if (granted) {
                syncAllNotifications(useDocumentStore.getState().documents, language, {
                  discreet: useSettingsStore.getState().settings.biometricEnabled,
                }).catch(() => {});
              }
            });
          },
        },
      ]);
      return true;
    }).catch(() => false);

  /** Just added a car document: offer the usual ones still missing for that car */
  const suggestCompanions = (types: string[], forAsset: string) => {
    const premium = useSettingsStore.getState().settings.isPremium;
    if (types.length === 0 || isAtFreeLimit(countTowardFreeLimit(useDocumentStore.getState().documents), premium)) return;
    Alert.alert(t(language, 'companion_title', { asset: forAsset }), undefined, [
      ...types.slice(0, 3).map((companion) => ({
        text: t(language, 'companion_add', { type: translateSubtype(companion, language) }),
        onPress: () => router.push(`/form?cat=vehicule&prefillType=${encodeURIComponent(companion)}&prefillAsset=${encodeURIComponent(forAsset)}`),
      })),
      { text: t(language, 'companion_later'), style: 'cancel' as const },
    ]);
  };

  const handleSave = () => {
    if (savingRef.current) return; // Prevent double-tap
    // Enforce the free-tier limit at the save layer, not just the add-tab button —
    // otherwise Duplicate / category-add routes into this form bypass it.
    if (!effectiveEdit) {
      const isPremium = useSettingsStore.getState().settings.isPremium;
      const docCount = countTowardFreeLimit(useDocumentStore.getState().documents);
      if (isAtFreeLimit(docCount, isPremium)) {
        router.push('/premium');
        return;
      }
    }
    const sanitizedCustomType = customType.trim().replace(/[^\p{L}\p{N}\s\-.,()]/gu, '').trim();
    // No type picked: take it from the title when it fits the category, else "Altele"
    const detectedType = !type ? autoCategorize(titleRef.current) : null;
    const resolvedType = type || (detectedType?.cat === cat && detectedType.type ? detectedType.type : 'Altele');
    const finalType = resolvedType === 'Altele' ? (sanitizedCustomType || 'Altele') : resolvedType;
    const finalRec = !effectiveEdit && !type ? resolveRecurrenceForType(finalType, rec, recTouchedRef.current) : rec;
    // The title is optional: "RCA — Dacia Duster" from the type and what it's for
    const finalTitle = titleRef.current.trim() || autoTitle(finalType, assetRef.current, language);
    if (!validate(finalTitle)) return;
    savingRef.current = true;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Auto-save new custom subtype for future use
    if (type === 'Altele' && sanitizedCustomType && sanitizedCustomType !== 'Altele') {
      const existing = customSubtypes?.[cat] || [];
      if (!existing.includes(sanitizedCustomType) && !presetSubtypes.includes(sanitizedCustomType)) {
        updateSetting('customSubtypes', { ...customSubtypes, [cat]: [...existing, sanitizedCustomType] });
      }
    }
    const docData: Omit<RawDocument, 'id'> = {
      cat, type: finalType, title: finalTitle,
      asset: assetRef.current.trim() || undefined, due,
      amt: amtRef.current.trim() ? Number(amtRef.current.trim().replace(',', '.')) : null, rec: finalRec,
      notes: notesRef.current.trim() || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      reminderDays: customReminders || undefined,
      // Remember the picked day of month — only when the date was (re)chosen,
      // so saving an edit doesn't overwrite it with a month-end clamped day
      ...(!effectiveEdit || due !== existingDoc?.due ? { dueDay: Number(due.slice(8, 10)) } : {}),
    };
    try {
      if (effectiveEdit && existingDoc) {
        updateDocument({ ...docData, id: existingDoc.id });
        // Clean up files for attachments that were removed during edit
        const savedIds = new Set(attachments.map((a) => a.id));
        const removed = (existingDoc.attachments || []).filter((a) => !savedIds.has(a.id));
        if (removed.length > 0) deleteAttachmentFiles(removed);
      } else {
        addDocument(docData);
      }
      const companions = effectiveEdit ? [] : companionTypes(cat, assetRef.current, useDocumentStore.getState().documents);
      const savedAsset = assetRef.current.trim();
      // Show success animation then navigate back
      // With reduce motion: appear statically, keep only the gentle fade-out
      setShowSuccess(true);
      successScale.setValue(reduceMotion ? 1 : 0);
      successOpacity.setValue(1);
      Animated.sequence([
        ...(reduceMotion
          ? []
          : [Animated.spring(successScale, { toValue: 1, speed: 12, bounciness: 8, useNativeDriver: true })]),
        Animated.delay(400),
        Animated.timing(successOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        router.back();
        if (effectiveEdit) return;
        // One question at a time: reminders permission first (once ever), else the missing car documents
        askForRemindersIfNeeded().then((asked) => {
          if (!asked) setTimeout(() => suggestCompanions(companions, savedAsset), 350);
        });
      });
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
              <AnimatedPressable onPress={handleCancel} haptic={false} accessibilityLabel={t(language, 'a11y_cancel')} hitSlop={12}>
                <Text style={[s.cancelText, { color: theme.primaryText }]}>{t(language, 'confirm_cancel')}</Text>
              </AnimatedPressable>
              <Text style={[s.headerTitle, { color: theme.text }]}>
                {effectiveEdit ? t(language, 'form_edit_title') : t(language, 'form_add_title')}
              </Text>
              <View style={{ width: 60 }} />
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
                      onPress={() => {
                        manualCatRef.current = true;
                        catLockedRef.current = true;
                        setAutoDetected(false);
                        setCat(catId);
                        // Choose the type right away instead of getting a silent default
                        if (catId !== cat && !effectiveEdit) { setTypeSearch(''); setShowTypePicker(true); }
                      }}
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
              {autoDetected && type ? (
                <Text style={{ fontSize: 13, color: '#34C759', marginTop: 6, fontWeight: '500', fontFamily: fonts.medium, paddingHorizontal: 20 }}>
                  {t(language, 'auto_detected_as', { type: translateSubtype(type, language), rec: getRecurrenceLabel(rec, language) })}
                </Text>
              ) : null}
            </FadeInView>

            {/* General — consolidated card: Type, Title, Asset, Date, Amount, Recurrence */}
            <FadeInView delay={200}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'settings_general')}</Text>
              <View style={[s.group, { backgroundColor: theme.card }]}>
                {/* Scan — fills the form from a photo (a new policy when renewing, too) */}
                <AnimatedPressable style={s.inputRow} onPress={handleScan} disabled={scanning} hapticStyle="light"
                  accessibilityRole="button" accessibilityLabel={t(language, 'scan_btn')}>
                  {scanning
                    ? <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 10 }} />
                    : <Ionicons name="scan-outline" size={20} color={theme.primary} style={{ marginRight: 10 }} />}
                  <View style={{ flex: 1, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 17, fontFamily: fonts.regular, color: theme.primaryText }}>{t(language, 'scan_btn')}</Text>
                    <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: theme.textMuted, marginTop: 1 }}>
                      {t(language, effectiveEdit ? 'scan_hint_edit' : 'scan_hint')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </AnimatedPressable>
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>
                {/* Type row — tappable, opens modal */}
                <AnimatedPressable style={s.inputRow} onPress={() => { setTypeSearch(''); setShowTypePicker(true); }} haptic={false} accessibilityLabel={t(language, 'form_type')} accessibilityRole="button"
                  accessibilityValue={{ text: type === 'Altele' ? (customType.trim() || translateSubtype('Altele', language)) : (type ? translateSubtype(type, language) : '') }}>
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
                  <TextInput key={`title-${titleKey}`} style={[s.inputField, { color: theme.text }]} defaultValue={title}
                    onChangeText={(v) => { titleRef.current = v; }}
                    onBlur={() => {
                      setTitle(titleRef.current); clearError('title');
                      // Never overrides a type the user picked, nor moves the document out
                      // of a category they chose — it can only refine the type within it
                      if (!isEdit && !typeTouchedRef.current) {
                        const detected = autoCategorize(titleRef.current);
                        if (detected?.type && (!catLockedRef.current || detected.cat === cat)) {
                          if (detected.cat && !catLockedRef.current) setCat(detected.cat);
                          setType(detected.type);
                          applyTypeDefaults(detected.type);
                          setAutoDetected(true);
                        }
                      }
                      const dup = findDuplicate(useDocumentStore.getState().documents, cat, type, titleRef.current, editId);
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
                  <TextInput key={`asset-${assetKey}`} style={[s.inputField, { color: theme.text }]} defaultValue={asset}
                    onChangeText={(v) => { assetRef.current = v; }}
                    onBlur={() => setAsset(assetRef.current)}
                    placeholder={t(language, 'form_asset_placeholder')} placeholderTextColor={theme.textDim}
                    returnKeyType="next" onSubmitEditing={Keyboard.dismiss}
                    maxLength={100}
                    accessibilityLabel={t(language, 'form_asset')} />
                </View>
                {assetSuggestions.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                    contentContainerStyle={s.assetChips}>
                    {assetSuggestions.slice(0, 8).map((label) => {
                      const selected = asset.trim().toLowerCase() === label.toLowerCase();
                      return (
                        <AnimatedPressable key={label} onPress={() => pickAsset(label)} hapticStyle="selection"
                          style={[s.assetChip, { backgroundColor: selected ? theme.primary + '22' : theme.inputFill, borderColor: selected ? theme.primary : 'transparent' }]}
                          accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}>
                          <Text style={[s.assetChipText, { color: selected ? theme.primaryText : theme.textSecondary }]} numberOfLines={1}>{label}</Text>
                        </AnimatedPressable>
                      );
                    })}
                  </ScrollView>
                )}
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                {/* Date — tap to show picker, Done to dismiss */}
                <AnimatedPressable style={s.inputRow} onPress={() => setShowDatePicker(true)} haptic={false} accessibilityLabel={t(language, 'form_due')} accessibilityRole="button"
                  accessibilityValue={{ text: due ? formatDate(due, language) : '' }}>
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
                        <Text style={[s.doneText, { color: theme.primaryText }]}>{t(language, 'form_done')}</Text>
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
                <View style={s.dateExtras}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {dateShortcuts(type, rec).map((months) => (
                      <AnimatedPressable key={months} onPress={() => pickDateShortcut(months)} hapticStyle="selection"
                        style={[s.shortcutChip, { backgroundColor: theme.inputFill }]} accessibilityRole="button">
                        <Text style={[s.shortcutText, { color: theme.textSecondary }]}>
                          {months % 12 === 0 ? tp(language, 'date_plus_years', months / 12) : tp(language, 'date_plus_months', months)}
                        </Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                  {!effectiveEdit && dueSource !== 'user' && (
                    <Text style={[s.dueHint, { color: dueSource === 'legal' ? theme.textMuted : '#FF9500' }]}>
                      {t(language, dueSource === 'legal' ? 'form_due_legal' : 'form_due_check')}
                    </Text>
                  )}
                </View>
                <View style={s.dividerWrap}><View style={[s.divider, { backgroundColor: theme.divider }]} /></View>

                <View style={s.inputRow}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>{t(language, 'form_amount')}</Text>
                  <TextInput key={`amt-${amtKey}`} style={[s.inputField, { color: theme.text }]} defaultValue={amt}
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
                            onPress={() => { recTouchedRef.current = true; setRec(opt.value); setShowRecPicker(false); }}
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
                            onPress={() => { recTouchedRef.current = true; setRec(opt.value); setShowRecPicker(false); }}
                            hapticStyle="selection"
                          >
                            <Text style={{ flex: 1, fontSize: 17, fontFamily: fonts.regular, color: rec === opt.value ? theme.primaryText : theme.text }}>
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
                  {(() => {
                    const autoDefault = getAutoReminderDays(rec);
                    const selectedDays = customReminders || autoDefault;
                    const renderChip = (day: number) => {
                      const isSelected = selectedDays.includes(day);
                      return (
                        <View key={day} style={{ flex: 1 }}>
                          <AnimatedPressable
                            style={{
                              alignItems: 'center', justifyContent: 'center',
                              minHeight: 36, borderRadius: 10,
                              backgroundColor: isSelected ? theme.primary : theme.inputFill,
                            }}
                            onPress={() => {
                              const current = customReminders || [...autoDefault];
                              const next = current.includes(day)
                                ? current.filter(d => d !== day)
                                : [...current, day].sort((a, b) => a - b);
                              setCustomReminders(next.length > 0 ? next : null);
                            }}
                            hapticStyle="selection"
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={t(language, 'form_reminder_a11y', { days: tp(language, 'reminder_chip', day) })}
                          >
                            <Text style={{
                              fontSize: 14,
                              fontFamily: isSelected ? fonts.semiBold : fonts.medium,
                              color: isSelected ? '#FFF' : theme.textSecondary,
                            }}>
                              {tp(language, 'reminder_chip', day)}
                            </Text>
                          </AnimatedPressable>
                        </View>
                      );
                    };
                    const dates = upcomingReminderDates(due, selectedDays, getTodayString()).map((d) => formatDate(d, language));
                    const joined = dates.length > 1
                      ? `${dates.slice(0, -1).join(', ')} ${t(language, 'list_and')} ${dates[dates.length - 1]}`
                      : dates[0];
                    return (
                      <View style={{ gap: 8 }}>
                        <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: theme.textMuted }}>{t(language, 'form_reminder_before')}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {[1, 3, 7, 14].map(renderChip)}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {[30, 60, 90].map(renderChip)}
                        </View>
                        <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: theme.textSecondary }}>
                          {dates.length > 0 ? t(language, 'form_reminder_when', { dates: joined }) : t(language, 'form_reminder_when_none')}
                        </Text>
                        {(!notificationsEnabled || permDenied) && (
                          <AnimatedPressable
                            onPress={() => {
                              if (permDenied) { Linking.openSettings().catch(() => {}); return; }
                              requestNotificationPermission().catch(() => false).then((granted) => {
                                if (granted) useSettingsStore.getState().updateSetting('notificationsEnabled', true);
                                else setPermDenied(true);
                              });
                            }}
                            haptic={false}
                            accessibilityRole="button"
                          >
                            <Text style={{ fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, color: '#FF9500' }}>
                              {t(language, 'notif_off_hint')} <Text style={{ color: theme.primaryText, fontFamily: fonts.semiBold }}>{t(language, 'notif_off_enable')}</Text>
                            </Text>
                          </AnimatedPressable>
                        )}
                      </View>
                    );
                  })()}
                  {customReminders && (
                    <AnimatedPressable
                      onPress={() => setCustomReminders(null)}
                      haptic={false}
                      style={{ marginTop: 6 }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: theme.primaryText }}>
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
                    <Text style={[s.cancelText, { color: theme.primaryText }]}>{t(language, 'confirm_cancel')}</Text>
                  </AnimatedPressable>
                  <Text style={[s.pickerTitle, { color: theme.text }]} accessibilityRole="header">{t(language, 'form_type')}</Text>
                  <View style={{ width: 60 }} />
                </View>

                {/* Search bar */}
                <View style={[s.searchBarWrap, { backgroundColor: theme.inputFill }]}>
                  <Ionicons name="search" size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    key={`type-search-${typeSearchKey}`}
                    style={[s.searchInput, { color: theme.text }]}
                    defaultValue=""
                    onChangeText={setTypeSearch}
                    placeholder={t(language, 'form_search_type')}
                    placeholderTextColor={theme.textDim}
                    returnKeyType="done"
                    accessibilityLabel={t(language, 'form_search_type')}
                  />
                  {typeSearch.length > 0 && (
                    <AnimatedPressable onPress={() => { setTypeSearch(''); setTypeSearchKey((k) => k + 1); }} haptic={false}
                      accessibilityLabel={t(language, 'a11y_clear_search')} accessibilityRole="button">
                      <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                    </AnimatedPressable>
                  )}
                </View>

                {/* Subtype list */}
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                  <View style={[s.group, { backgroundColor: theme.card, marginTop: 8 }]}>
                    {/* No diacritics needed, everyday words work ("buletin", "pasaport", "rovinieta") */}
                    {subtypes.filter((sub) => matchesSearch({ title: sub, type: sub }, typeSearch)).map((sub, idx, arr) => (
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
                <Text style={[s.doneText, { color: theme.primaryText }]}>{t(language, 'form_done')}</Text>
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
                <Text style={[s.doneText, { color: theme.primaryText }]}>{t(language, 'form_done')}</Text>
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
  dateExtras: { paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  shortcutChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  shortcutText: { fontSize: 13, fontFamily: fonts.medium },
  dueHint: { fontSize: 12, fontFamily: fonts.medium },
  assetChips: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  assetChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, maxWidth: 180 },
  assetChipText: { fontSize: 13, fontFamily: fonts.medium },
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
