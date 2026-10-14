/**
 * "Plătit / Reînnoit" sheet — the one place where a document is paid, renewed
 * or closed: from the detail screen, the lists (swipe / long press) and the
 * notification's action button. It shows where the due date moves (editable)
 * and the amount before anything changes; the toast afterwards offers "Anulează".
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import type { RawDocument } from "../core/constants";
import { t, tp } from "../core/i18n";
import { formatDate, formatMoney, formatDaysRemaining } from "../core/formatters";
import { daysBetween } from "../core/dateUtils";
import { payKind, planPayment } from "../core/payment";
import type { PayAction, PayKind } from "../core/payment";
import { parseOptionalNumber } from "../core/validators";
import { docCurrency } from "../core/money";
import { subscribeLockState } from "../core/lockState";
import { useDocumentStore } from "../stores/useDocumentStore";
import { useTheme, useLanguage, useCurrency } from "../stores/useSettingsStore";
import { useToday } from "../stores/useClockStore";
import { showToast } from "../stores/useToastStore";
import { SegmentedControl } from "./settings/SettingsUI";
import { Card, DateField, Divider, FieldError, PrimaryButton, TextField } from "./journal/JournalUI";
import { AnimatedPressable } from "./AnimatedUI";
import { fonts } from "../theme/typography";

const AMOUNT_LIMITS = { decimals: 2, max: 999_999_999 };

type Mode = "pay" | "renew" | "close";

/** i18n key for the action button: Plătit / Reînnoit / Încheiat */
export function payButtonKey(doc: Pick<RawDocument, "cat" | "type">): string {
  return `pay_btn_${payKind(doc)}`;
}

export interface PaySheetOptions {
  /** Runs after the change was applied (e.g. a celebration on the detail screen) */
  onDone?: (action: PayAction) => void;
}

/**
 * Render `paySheet` once in the screen and call `openPaySheet(doc)` from any
 * button. The sheet lives inside the screen so it also works on modal screens.
 */
export function usePaySheet() {
  const [target, setTarget] = useState<{ id: string; options: PaySheetOptions; key: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const openPaySheet = useCallback((doc: Pick<RawDocument, "id">, options: PaySheetOptions = {}) => {
    setTarget((prev) => ({ id: doc.id, options, key: (prev?.key ?? 0) + 1 }));
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);
  const paySheet = target ? (
    <PaySheet key={target.key} docId={target.id} options={target.options} visible={visible} onClose={close} />
  ) : null;
  return { openPaySheet, paySheet };
}

const amountText = (amount: number | null, language: string) =>
  amount == null ? "" : language === "ro" ? String(amount).replace(".", ",") : String(amount);

function PaySheet({ docId, options, visible, onClose }: {
  docId: string;
  options: PaySheetOptions;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const today = useToday();
  // Read when the sheet opens; a payment made here closes the sheet
  const [doc] = useState(() => useDocumentStore.getState().documents.find((d) => d.id === docId));
  const plan = useMemo(() => (doc ? planPayment(doc, today) : null), [doc, today]);
  const kind: PayKind = doc ? payKind(doc) : "bill";

  const [mode, setMode] = useState<Mode>(() =>
    plan?.recurring ? "pay" : kind === "renewal" ? "renew" : "close");
  const [coverAll, setCoverAll] = useState(true);
  const [nextDue, setNextDue] = useState(() =>
    (plan?.recurring ? plan.nextAll : plan?.renewSuggestion) ?? today);
  const defaultAmount = (m: Mode) => (m === "close" && kind !== "bill" ? null : doc?.amt ?? null);
  const [amount, setAmount] = useState(() => amountText(defaultAmount(mode), language));
  const [error, setError] = useState<string | undefined>();
  const savingRef = useRef(false);

  // Locking the app closes the sheet — nothing stays on screen behind the lock
  useEffect(() => subscribeLockState((locked) => { if (locked) onClose(); }), [onClose]);

  if (!doc || !plan) return null;

  const docCur = docCurrency(doc, currency);
  const multiple = mode === "pay" && plan.periodsAll > 1;
  const periods = multiple && coverAll ? plan.periodsAll : 1;
  const parsedAmount = parseOptionalNumber(amount, AMOUNT_LIMITS);

  const switchMode = (m: string) => {
    const next = m as Mode;
    setMode(next);
    setAmount(amountText(defaultAmount(next), language));
    setError(undefined);
    if (next === "renew" && plan.renewSuggestion) setNextDue(plan.renewSuggestion);
  };

  const switchCover = (v: string) => {
    const all = v === "all";
    setCoverAll(all);
    setNextDue((all ? plan.nextAll : plan.nextOne) ?? nextDue);
  };

  const handleConfirm = () => {
    if (savingRef.current) return;
    if (Number.isNaN(parsedAmount)) {
      setError(t(language, "val_amount_positive"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    const action: PayAction =
      mode === "close" ? { kind: "close", amount: parsedAmount }
      : mode === "renew" ? { kind: "renew", nextDue, amount: parsedAmount }
      : { kind: "pay", nextDue, amount: parsedAmount, periods };
    savingRef.current = true;
    const ok = useDocumentStore.getState().applyPayment(doc.id, action);
    onClose();
    if (!ok) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const date = action.kind === "close" ? "" : formatDate(action.nextDue, language);
    const message = action.kind === "close" ? t(language, "toast_archived")
      : action.kind === "pay" && kind === "bill" ? t(language, "toast_paid_until", { date })
      : t(language, "toast_renewed_until", { date });
    showToast(message, "success", {
      label: t(language, "toast_undo"),
      onPress: () => {
        useDocumentStore.getState().undoPayment();
        showToast(t(language, "toast_undo_success"));
      },
    });
    options.onDone?.(action);
  };

  const confirmLabel =
    mode === "renew" ? "pay_confirm_new_date"
    : mode === "close" ? (kind === "bill" ? "pay_confirm_bill" : "pay_confirm_archive")
    : kind === "bill" ? "pay_confirm_bill" : "pay_confirm_renewal";
  const dateLabel = mode === "pay" && kind === "bill" ? "pay_next_due" : "pay_valid_until";
  const daysLeft = daysBetween(today, doc.due);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t(language, "confirm_cancel")} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            style={[s.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + 16 }]}
            accessibilityViewIsModal
          >
            <View style={[s.handle, { backgroundColor: theme.textDim }]} />
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={[s.title, { color: theme.text }]} accessibilityRole="header" numberOfLines={1}>
                  {t(language, payButtonKey(doc))} · {doc.title}
                </Text>
                <Text style={[s.subtitle, { color: daysLeft < 0 ? "#FF3B30" : theme.textMuted }]}>
                  {t(language, "pay_sheet_due", { date: formatDate(doc.due, language) })} · {formatDaysRemaining(daysLeft, language)}
                </Text>
              </View>
              <AnimatedPressable onPress={onClose} haptic={false} accessibilityLabel={t(language, "btn_close")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={[s.closeCircle, { backgroundColor: theme.inputFillStrong }]}>
                  <Ionicons name="close" size={16} color={theme.textSecondary} />
                </View>
              </AnimatedPressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" bounces={false} style={{ maxHeight: 520 }}>
              {!plan.recurring && (
                <View style={s.block}>
                  <SegmentedControl
                    options={[
                      { value: "renew", label: t(language, `pay_mode_renew_${kind}`) },
                      { value: "close", label: t(language, `pay_mode_close_${kind}`) },
                    ]}
                    selected={mode}
                    onSelect={switchMode}
                    theme={theme}
                    fullWidth
                  />
                </View>
              )}

              {multiple && (
                <View style={s.block}>
                  <Text style={[s.hint, { color: theme.textSecondary }]}>{tp(language, "pay_overdue_hint", plan.periodsAll)}</Text>
                  <SegmentedControl
                    options={[
                      { value: "all", label: tp(language, "pay_cover_all", plan.periodsAll) },
                      { value: "one", label: t(language, "pay_cover_one") },
                    ]}
                    selected={coverAll ? "all" : "one"}
                    onSelect={switchCover}
                    theme={theme}
                    fullWidth
                  />
                </View>
              )}

              <Card theme={theme} style={{ marginTop: 16 }}>
                {mode !== "close" && (
                  <>
                    <DateField
                      label={t(language, dateLabel)}
                      value={nextDue}
                      onChange={setNextDue}
                      minimumDate={mode === "renew" ? today : undefined}
                      theme={theme}
                      language={language}
                    />
                    <Divider theme={theme} />
                  </>
                )}
                <TextField
                  key={mode}
                  label={t(language, "pay_amount")}
                  value={amount}
                  onChangeText={(text) => { setAmount(text); if (error) setError(undefined); }}
                  placeholder={t(language, "journal_optional")}
                  keyboardType="decimal-pad"
                  maxLength={12}
                  suffix={docCur}
                  theme={theme}
                />
              </Card>
              <FieldError message={error} />

              {multiple && coverAll && typeof parsedAmount === "number" && !Number.isNaN(parsedAmount) && parsedAmount > 0 && (
                <Text style={[s.note, { color: theme.textMuted }]}>
                  {t(language, "pay_total", { total: formatMoney(parsedAmount * periods, docCur, language) })}
                </Text>
              )}
              {mode === "pay" && plan.renewal && plan.overdue && (
                <Text style={[s.note, { color: theme.textMuted }]}>{t(language, "pay_restart_hint")}</Text>
              )}
              {mode === "close" && (
                <Text style={[s.note, { color: theme.textMuted }]}>{t(language, "pay_archive_hint")}</Text>
              )}

              <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                <PrimaryButton label={t(language, confirmLabel)} icon="checkmark" onPress={handleConfirm} theme={theme} />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, opacity: 0.5, marginBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 4, gap: 12 },
  title: { fontSize: 20, fontWeight: "700", fontFamily: fonts.bold },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, marginTop: 2 },
  closeCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  block: { paddingHorizontal: 16, marginTop: 16, gap: 8 },
  hint: { fontSize: 14, fontFamily: fonts.regular, paddingHorizontal: 4 },
  note: { fontSize: 13, fontFamily: fonts.regular, lineHeight: 18, paddingHorizontal: 32, paddingTop: 8 },
});
