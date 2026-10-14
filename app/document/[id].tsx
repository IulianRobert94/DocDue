/**
 * Document Detail Screen — Apple HIG 2025
 * Modal with animated entrance, premium info card
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Image, Share, ActivityIndicator, Animated, Platform, ActionSheetIOS } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../../src/stores/useToastStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme, useLanguage, useCurrency, useSettingsStore } from '../../src/stores/useSettingsStore';
import { useEnrichedDocument, useDocumentStore } from '../../src/stores/useDocumentStore';
import { t, translateSubtype } from '../../src/core/i18n';
import { formatDate, formatMoney, formatDaysRemaining, getRecurrenceLabel } from '../../src/core/formatters';
import { addDaysToDate, getTodayString } from '../../src/core/dateUtils';
import { getScheduledReminderOffsets } from '../../src/core/enrichment';
import { CATEGORIES, STATUS_DISPLAY } from '../../src/core/constants';
import { AnimatedPressable, FadeInView, useReduceMotion } from '../../src/components/AnimatedUI';
import { deleteWithUndo } from '../../src/core/confirmActions';
import { isDemoDocument, isAtFreeLimit, countTowardFreeLimit } from '../../src/core/helpers';
import { usePaySheet, payButtonKey } from '../../src/components/PaySheet';
import { ExamplePill } from '../../src/components/ExamplePill';
import { SwipeableRow } from '../../src/components/SwipeableRow';
import { fonts } from '../../src/theme/typography';
import { ImageViewer } from '../../src/components/ImageViewer';
import { requestCalendarPermission, addDocumentToCalendar } from '../../src/services/calendar';

export default function DocumentDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const doc = useEnrichedDocument(id);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const undoDelete = useDocumentStore((s) => s.undoDelete);
  const restoreFromArchive = useDocumentStore((s) => s.restoreFromArchive);
  const deletePaymentRecord = useDocumentStore((s) => s.deletePaymentRecord);
  const isPremium = useSettingsStore((s) => s.settings.isPremium);
  const notificationsEnabled = useSettingsStore((s) => s.settings.notificationsEnabled);
  const { openPaySheet, paySheet } = usePaySheet();

  // When the next reminder for this document arrives (advance, due day or follow-up)
  const nextReminder = useMemo(() => {
    if (!doc || doc.resolved || isDemoDocument(doc) || !notificationsEnabled) return null;
    const today = getTodayString();
    return getScheduledReminderOffsets(doc)
      .map((offset) => addDaysToDate(doc.due, -offset))
      .filter((date) => date > today)
      .sort()[0] ?? null;
  }, [doc, notificationsEnabled]);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const reduceMotion = useReduceMotion();
  const congratsScale = useRef(new Animated.Value(0)).current;
  const congratsOpacity = useRef(new Animated.Value(0)).current;

  const congratsAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Cleanup on unmount: stop animations
  useEffect(() => {
    return () => {
      if (congratsAnimRef.current) congratsAnimRef.current.stop();
    };
  }, []);

  // Opened from a reminder's "Plătit" button: show the pay sheet straight away
  const autoPayRef = useRef(false);
  useEffect(() => {
    if (pay !== '1' || autoPayRef.current || !doc || doc.resolved) return;
    autoPayRef.current = true;
    const timer = setTimeout(() => openPaySheet(doc, { onDone: (action) => { if (action.kind !== 'close') playCongrats(); } }), 450);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening, with the document as it was
  }, [pay, doc?.id]);

  const playCongrats = () => {
    setShowCongrats(true);
    // With reduce motion: appear statically, keep only the gentle fade-out
    congratsScale.setValue(reduceMotion ? 1 : 0);
    congratsOpacity.setValue(1);
    const anim = Animated.sequence([
      ...(reduceMotion
        ? []
        : [Animated.spring(congratsScale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true })]),
      Animated.delay(1200),
      Animated.timing(congratsOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    congratsAnimRef.current = anim;
    anim.start(() => {
      congratsAnimRef.current = null;
      setShowCongrats(false);
    });
  };

  if (!doc) {
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        <View style={{ paddingTop: insets.top + 16, alignItems: 'center', paddingVertical: 80 }}>
          <Ionicons name="document-outline" size={40} color={theme.textDim} style={{ marginBottom: 12 }} />
          <Text style={[s.emptyText, { color: theme.textMuted }]}>{t(language, 'doc_not_found')}</Text>
          <AnimatedPressable onPress={() => router.back()} style={{ marginTop: 20 }} accessibilityLabel={t(language, 'btn_close')}>
            <Text style={{ color: theme.primaryText, fontSize: 17, fontFamily: fonts.regular }}>{t(language, 'btn_close')}</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }

  const category = CATEGORIES[doc.cat];
  const statusConfig = STATUS_DISPLAY[doc._status] || { color: '#999', labelKey: 'status_ok' };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      t(language, 'confirm_delete_title'),
      t(language, 'confirm_delete_msg', { title: doc.title }),
      [
        { text: t(language, 'confirm_cancel'), style: 'cancel' },
        { text: t(language, 'confirm_delete_btn'), style: 'destructive', onPress: () => { deleteWithUndo(doc.id, language, deleteDocument, undoDelete); router.back(); } },
      ]
    );
  };

  const handleMarkPaid = () => {
    openPaySheet(doc, { onDone: (action) => { if (action.kind !== 'close') playCongrats(); } });
  };

  const handleRestore = () => {
    if (isAtFreeLimit(countTowardFreeLimit(useDocumentStore.getState().documents), isPremium)) {
      router.push('/premium');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    restoreFromArchive(doc.id);
    showToast(t(language, 'toast_restored'));
  };

  const infoRows: { label: string; value: string; bold?: boolean; onPress?: () => void }[] = [
    ...(doc.resolved ? [{ label: t(language, 'status_archived'), value: formatDate(doc.resolved, language) }] : []),
    { label: t(language, 'detail_due'), value: formatDate(doc.due, language) },
    // Tapping what it's for lists every document for that car / home
    ...(doc.asset ? [{ label: t(language, 'form_asset'), value: doc.asset, onPress: () => router.push(`/search?q=${encodeURIComponent(doc.asset ?? '')}`) }] : []),
    ...(doc.amt ? [{ label: t(language, 'detail_amount'), value: formatMoney(doc.amt, currency, language), bold: true }] : []),
    { label: t(language, 'detail_recurrence'), value: getRecurrenceLabel(doc.rec, language) },
    ...(nextReminder ? [{ label: t(language, 'detail_next_reminder'), value: formatDate(nextReminder, language) }] : []),
  ];

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}>
        {/* Modal handle + close */}
        <FadeInView delay={0} style={s.closeRow}>
          <View style={{ width: 60 }} />
          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.20)', 'rgba(255,255,255,0.08)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.grabber}
          />
          <AnimatedPressable
            onPress={() => router.back()}
            style={{ width: 60, alignItems: 'flex-end' }}
            accessibilityLabel={t(language, 'a11y_close_modal')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            haptic={false}
          >
            <View style={[s.closeCircle, { backgroundColor: theme.inputFillStrong }]}>
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </View>
          </AnimatedPressable>
        </FadeInView>

        {/* Compact Header Card */}
        <FadeInView delay={100} style={[s.headerCard, { backgroundColor: theme.card }]}>
          <View style={[s.headerIcon, { backgroundColor: (category?.color || '#999') + '14' }]}>
            <Ionicons name={category?.iconFilled || 'document'} size={22} color={category?.color || '#999'} />
          </View>
          <View style={s.headerContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[s.headerTitle, { color: theme.text, flexShrink: 1 }]} numberOfLines={1}>{doc.title}</Text>
              {isDemoDocument(doc) && <ExamplePill language={language} />}
            </View>
            <Text style={[s.headerSubtype, { color: theme.textMuted }]} numberOfLines={1}>{translateSubtype(doc.type, language)}</Text>
            {doc.resolved ? (
              <View style={s.headerStatus}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: theme.inputFillStrong }}>
                  <Text style={[s.headerStatusText, { color: theme.textSecondary }]}>{t(language, 'status_archived')}</Text>
                </View>
              </View>
            ) : (
              <View style={s.headerStatus}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: statusConfig.color + '1A' }}>
                  <Text style={[s.headerStatusText, { color: statusConfig.color }]}>{t(language, statusConfig.labelKey)}</Text>
                </View>
                <Text style={[s.headerStatusDays, { color: statusConfig.color }]}>{formatDaysRemaining(doc._daysUntil, language)}</Text>
              </View>
            )}
          </View>
        </FadeInView>

        {/* Info Card */}
        <FadeInView delay={200} style={[s.group, { backgroundColor: theme.card }]}>
          {infoRows.map((row, i) => {
            const content = (
              <>
                <Text style={[s.infoLabel, { color: theme.textSecondary }]}>{row.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                  <Text style={[s.infoValue, { color: row.onPress ? theme.primaryText : theme.text }, row.bold && { fontWeight: '700', fontFamily: fonts.bold }]} numberOfLines={2}>
                    {row.value}
                  </Text>
                  {row.onPress && <Ionicons name="chevron-forward" size={14} color={theme.textDim} />}
                </View>
              </>
            );
            return (
            <View key={i}>
              {row.onPress ? (
                <AnimatedPressable style={s.infoRow} onPress={row.onPress} haptic={false}
                  accessibilityRole="button" accessibilityLabel={`${row.label}: ${row.value}`}>
                  {content}
                </AnimatedPressable>
              ) : (
                <View style={s.infoRow}>{content}</View>
              )}
              {i < infoRows.length - 1 && (
                <View style={{ paddingLeft: 16 }}>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                </View>
              )}
            </View>
            );
          })}
        </FadeInView>

        {/* Notes */}
        {doc.notes ? (
          <FadeInView delay={300}>
            <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'detail_notes')}</Text>
            <View style={[s.group, { backgroundColor: theme.card }]}>
              <View style={{ padding: 16 }}>
                <Text style={[s.notesText, { color: theme.text }]}>{doc.notes}</Text>
              </View>
            </View>
          </FadeInView>
        ) : null}

        {/* Attachments */}
        {doc.attachments && doc.attachments.length > 0 && (
          <FadeInView delay={350}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20 }}>
              <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'attachments')}</Text>
              {doc.attachments.length > 1 && (
                <AnimatedPressable
                  onPress={() => {
                    // Share every attachment sequentially — one share sheet per file.
                    (async () => {
                      if (!(await Sharing.isAvailableAsync())) return;
                      for (const att of doc.attachments!) {
                        await Sharing.shareAsync(att.uri).catch(() => {});
                      }
                    })();
                  }}
                  hapticStyle="light"
                  accessibilityLabel={t(language, 'share_all_attachments')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  haptic={false}
                >
                  <Text style={{ color: theme.primaryText, fontSize: 15, fontFamily: fonts.regular }}>{t(language, 'share_all_attachments')}</Text>
                </AnimatedPressable>
              )}
            </View>
            <View style={[s.group, { backgroundColor: theme.card, padding: 12 }]}>
              <View style={s.attachGrid}>
                {doc.attachments.map((att) => (
                  <AnimatedPressable
                    key={att.id}
                    style={s.attachItem}
                    onPress={() => {
                      const viewLabel = att.type === 'image' ? t(language, 'open_file') : t(language, 'open_file');
                      const shareLabel = t(language, 'share_file');
                      const cancelLabel = t(language, 'confirm_cancel');
                      if (Platform.OS === 'ios') {
                        ActionSheetIOS.showActionSheetWithOptions(
                          { options: [cancelLabel, viewLabel, shareLabel], cancelButtonIndex: 0 },
                          (idx) => {
                            if (idx === 1) {
                              if (att.type === 'image') setViewImage(att.uri);
                              else Sharing.shareAsync(att.uri).catch(() => {});
                            } else if (idx === 2) {
                              Sharing.shareAsync(att.uri).catch(() => {});
                            }
                          }
                        );
                      } else {
                        Alert.alert(att.name, undefined, [
                          { text: cancelLabel, style: 'cancel' },
                          { text: viewLabel, onPress: () => {
                            if (att.type === 'image') setViewImage(att.uri);
                            else Sharing.shareAsync(att.uri).catch(() => {});
                          }},
                          { text: shareLabel, onPress: () => Sharing.shareAsync(att.uri).catch(() => {}) },
                        ]);
                      }
                    }}
                    scaleValue={0.95}
                    accessibilityLabel={att.name}
                  >
                    {att.type === 'image' ? (
                      <Image source={{ uri: att.uri }} style={s.attachThumb} accessibilityLabel={att.name} accessibilityRole="image" onError={() => {}} />
                    ) : (
                      <View style={[s.attachThumb, s.attachFile, { backgroundColor: theme.inputFill }]}>
                        <Ionicons name="document-text" size={28} color="#FF3B30" />
                        <Text style={[s.attachExt, { color: theme.textMuted }]} numberOfLines={1}>
                          {att.name.split('.').pop()?.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={[s.attachName, { color: theme.textMuted }]} numberOfLines={1}>
                      {att.name}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          </FadeInView>
        )}

        {/* Payment History */}
        {doc.paymentHistory && doc.paymentHistory.length > 0 && (
          <FadeInView delay={360}>
            <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>
              {t(language, 'payment_history')} ({doc.paymentHistory.length})
            </Text>
            <View style={[s.group, { backgroundColor: theme.card }]}>
              {doc.paymentHistory.map((payment, i) => (
                <View key={`${payment.date}-${payment.dueDate}-${i}`}>
                  <SwipeableRow
                    onDelete={() => {
                      deletePaymentRecord(doc.id, i);
                      showToast(t(language, 'toast_payment_deleted'), 'info');
                    }}
                    confirmTitle={t(language, 'payment_delete_title')}
                    confirmMessage={t(language, 'payment_delete_msg', { date: formatDate(payment.date, language) })}
                    confirmCancel={t(language, 'confirm_cancel')}
                    confirmDelete={t(language, 'confirm_delete_btn')}
                    deleteLabel={t(language, 'detail_delete')}
                  >
                    <View style={[s.infoRow, { backgroundColor: theme.card }]}>
                      <Text style={[s.infoLabel, { color: theme.textSecondary }]}>
                        {formatDate(payment.date, language)}
                      </Text>
                      <Text style={[s.infoValue, { color: theme.text }]}>
                        {payment.amt != null ? formatMoney(payment.amt, currency, language) : '—'}
                      </Text>
                    </View>
                  </SwipeableRow>
                  {i < (doc.paymentHistory?.length ?? 0) - 1 && (
                    <View style={{ paddingLeft: 16 }}>
                      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                    </View>
                  )}
                </View>
              ))}
              {doc.paymentHistory.some((p) => p.amt != null) && (
                <>
                  <View style={{ paddingLeft: 16 }}>
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                  </View>
                  <View style={s.infoRow}>
                    <Text style={[s.infoLabel, { color: theme.text, fontWeight: '600', fontFamily: fonts.semiBold }]}>
                      {t(language, 'total_paid')}
                    </Text>
                    <Text style={[s.infoValue, { color: theme.text, fontWeight: '700', fontFamily: fonts.bold }]}>
                      {formatMoney(
                        doc.paymentHistory.reduce((sum, p) => sum + (p.amt || 0), 0),
                        currency,
                        language,
                      )}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </FadeInView>
        )}

        {/* Actions */}
        <FadeInView delay={400} style={s.actionsSection}>
          <View style={[s.group, { backgroundColor: theme.card }]}>
            {doc.resolved ? (
              <AnimatedPressable style={s.actionRow} onPress={handleRestore} accessibilityLabel={t(language, 'archive_restore')} hapticStyle="medium">
                <Ionicons name="arrow-undo" size={18} color={theme.primary} style={{ marginRight: 6 }} />
                <Text style={[s.actionText, { color: theme.primaryText }]}>{t(language, 'archive_restore')}</Text>
              </AnimatedPressable>
            ) : (
              <AnimatedPressable style={s.actionRow} onPress={handleMarkPaid} accessibilityLabel={t(language, payButtonKey(doc))} hapticStyle="medium">
                <Ionicons name="checkmark-circle" size={18} color="#34C759" style={{ marginRight: 6 }} />
                <Text style={[s.actionText, { color: '#34C759' }]}>{t(language, payButtonKey(doc))}</Text>
              </AnimatedPressable>
            )}
            {!doc.resolved && (<>
            <View style={{ paddingLeft: 16 }}>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
            </View>
            <AnimatedPressable
              style={s.actionRow}
              onPress={async () => {
                setCalendarLoading(true);
                try {
                  const granted = await requestCalendarPermission();
                  if (!granted) {
                    Alert.alert(t(language, 'alert_notice'), t(language, 'cal_permission_denied'));
                    return;
                  }
                  const added = await addDocumentToCalendar(doc, language);
                  if (added) {
                    showToast(t(language, 'toast_calendar'));
                  } else {
                    showToast(t(language, 'cal_error'), 'error');
                  }
                } catch {
                  showToast(t(language, 'cal_error'), 'error');
                } finally {
                  setCalendarLoading(false);
                }
              }}
              accessibilityLabel={t(language, 'cal_add')}
            >
              {calendarLoading ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 6 }} />
              ) : (
                <Ionicons name="calendar-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
              )}
              <Text style={[s.actionText, { color: theme.primaryText }]}>{t(language, 'cal_add')}</Text>
            </AnimatedPressable>
            </>)}
          </View>

          <View style={[s.group, { backgroundColor: theme.card }]}>
            <AnimatedPressable style={s.actionRow} onPress={() => router.push(`/form?editId=${doc.id}`)} accessibilityLabel={t(language, 'a11y_edit_document')}>
              <Ionicons name="create-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: theme.primaryText }]}>{t(language, 'detail_edit')}</Text>
            </AnimatedPressable>
            <View style={{ paddingLeft: 16 }}>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
            </View>
            <AnimatedPressable
              style={s.actionRow}
              onPress={() => router.push(`/form?dupCat=${doc.cat}&dupType=${encodeURIComponent(doc.type)}&dupTitle=${encodeURIComponent(doc.title)}&dupAsset=${encodeURIComponent(doc.asset || '')}&dupAmt=${encodeURIComponent(String(doc.amt || ''))}&dupRec=${encodeURIComponent(doc.rec)}&dupNotes=${encodeURIComponent(doc.notes || '')}`)}
              accessibilityLabel={t(language, 'detail_duplicate')}
            >
              <Ionicons name="copy-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: theme.primaryText }]}>{t(language, 'detail_duplicate')}</Text>
            </AnimatedPressable>
            <View style={{ paddingLeft: 16 }}>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
            </View>
            <AnimatedPressable
              style={s.actionRow}
              onPress={() => {
                const catLabel = t(language, category?.labelKey || '');
                const summary = t(language, 'share_summary', {
                  title: doc.title,
                  due: formatDate(doc.due, language),
                  amount: doc.amt ? formatMoney(doc.amt, currency, language) : '—',
                  recurrence: getRecurrenceLabel(doc.rec, language),
                  category: catLabel,
                  type: translateSubtype(doc.type, language),
                });
                Share.share({ message: summary, title: doc.title }).catch(() => {});
              }}
              accessibilityLabel={t(language, 'share_document')}
            >
              <Ionicons name="share-outline" size={18} color={theme.primary} style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: theme.primaryText }]}>{t(language, 'share_document')}</Text>
            </AnimatedPressable>
            <View style={{ paddingLeft: 16 }}>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
            </View>
            <AnimatedPressable style={s.actionRow} onPress={handleDelete} accessibilityLabel={t(language, 'a11y_delete_document')} hapticStyle="medium">
              <Ionicons name="trash-outline" size={18} color="#FF3B30" style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: '#FF3B30' }]}>{t(language, 'detail_delete')}</Text>
            </AnimatedPressable>
          </View>
        </FadeInView>
      </ScrollView>

      {/* Congratulations overlay */}
      {showCongrats && (
        <Animated.View
          style={[s.congratsOverlay, { opacity: congratsOpacity }]}
          pointerEvents="none"
        >
          <Animated.View style={{ transform: [{ scale: congratsScale }], alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={72} color="#34C759" />
            <Text style={s.congratsText}>{t(language, 'congrats_paid')}</Text>
          </Animated.View>
        </Animated.View>
      )}

      {/* Image Viewer — outside ScrollView to avoid clipping */}
      {viewImage && (
        <ImageViewer
          visible={!!viewImage}
          uri={viewImage}
          onClose={() => setViewImage(null)}
        />
      )}
      {paySheet}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  closeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 4 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  closeCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerCard: { marginHorizontal: 16, marginTop: 16, marginBottom: 8, padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  headerIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', fontFamily: fonts.extraBold, letterSpacing: 0.35 },
  headerSubtype: { fontSize: 14, fontFamily: fonts.regular, marginTop: 2 },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  headerStatusText: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  headerStatusDays: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold },
  sectionHeader: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: 13 },
  infoLabel: { fontSize: 17, fontFamily: fonts.regular },
  infoValue: { fontSize: 17, fontFamily: fonts.regular, textAlign: 'right' },
  notesText: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 22 },
  actionsSection: { paddingTop: 24, gap: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, minHeight: 44, justifyContent: 'center' },
  actionText: { fontSize: 17, fontFamily: fonts.regular },
  emptyText: { fontSize: 15, fontFamily: fonts.regular },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  attachItem: { width: 80, alignItems: 'center' },
  attachThumb: { width: 72, height: 72, borderRadius: 10 },
  attachFile: { alignItems: 'center', justifyContent: 'center' },
  attachExt: { fontSize: 9, fontWeight: '700', fontFamily: fonts.bold, marginTop: 2 },
  attachName: { fontSize: 11, fontFamily: fonts.regular, marginTop: 4, textAlign: 'center' },
  congratsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: 'rgba(5,10,20,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  congratsText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.bold,
    marginTop: 16,
    letterSpacing: 0.35,
  },
});
