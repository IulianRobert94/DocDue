/**
 * Document Detail Screen — Apple HIG 2025
 * Modal with animated entrance, premium info card
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Image, Share, ActivityIndicator, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';

import { useTheme, useLanguage, useCurrency } from '../../src/stores/useSettingsStore';
import { useEnrichedDocument, useDocumentStore } from '../../src/stores/useDocumentStore';
import { t, translateSubtype } from '../../src/core/i18n';
import { formatDate, formatMoney, formatDaysRemaining, getRecurrenceLabel } from '../../src/core/formatters';
import { CATEGORIES, STATUS_DISPLAY } from '../../src/core/constants';
import { AnimatedPressable, FadeInView } from '../../src/components/AnimatedUI';
import { ImageViewer } from '../../src/components/ImageViewer';
import { requestCalendarPermission, addDocumentToCalendar } from '../../src/services/calendar';

export default function DocumentDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const language = useLanguage();
  const currency = useCurrency();
  const doc = useEnrichedDocument(id);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const markAsPaid = useDocumentStore((s) => s.markAsPaid);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const congratsScale = useRef(new Animated.Value(0)).current;
  const congratsOpacity = useRef(new Animated.Value(0)).current;

  const markingRef = useRef(false);
  const congratsAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Stop congrats animation on unmount to prevent background resource usage
  useEffect(() => {
    return () => {
      if (congratsAnimRef.current) congratsAnimRef.current.stop();
    };
  }, []);

  const playCongrats = () => {
    setShowCongrats(true);
    congratsScale.setValue(0);
    congratsOpacity.setValue(1);
    const anim = Animated.sequence([
      Animated.spring(congratsScale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
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
            <Text style={{ color: '#007AFF', fontSize: 17 }}>{t(language, 'btn_close')}</Text>
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
        { text: t(language, 'confirm_delete_btn'), style: 'destructive', onPress: () => { deleteDocument(doc.id); router.back(); } },
      ]
    );
  };

  const handleMarkPaid = () => {
    if (markingRef.current) return;
    markingRef.current = true;
    const isRecurring = doc.rec !== 'none';
    Alert.alert(
      t(language, isRecurring ? 'confirm_paid_title' : 'confirm_resolved_title'),
      t(language, isRecurring ? 'confirm_paid_msg' : 'confirm_resolved_msg'),
      [
        { text: t(language, 'confirm_cancel'), style: 'cancel', onPress: () => { markingRef.current = false; } },
        {
          text: t(language, isRecurring ? 'confirm_paid_btn' : 'confirm_resolved_btn'),
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            const result = markAsPaid(doc);
            if (result === 'paid_next') {
              playCongrats();
            } else {
              // One-time doc is deleted — go back immediately to avoid
              // "not found" flashing behind the congrats overlay
              router.back();
            }
            markingRef.current = false;
          },
        },
      ],
      { cancelable: true, onDismiss: () => { markingRef.current = false; } }
    );
  };

  const infoRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: t(language, 'detail_due'), value: formatDate(doc.due, language) },
    ...(doc.asset ? [{ label: t(language, 'form_asset'), value: doc.asset }] : []),
    ...(doc.amt ? [{ label: t(language, 'detail_amount'), value: formatMoney(doc.amt, currency, language), bold: true }] : []),
    { label: t(language, 'detail_recurrence'), value: getRecurrenceLabel(doc.rec, language) },
  ];

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}>
        {/* Modal handle + close */}
        <FadeInView delay={0} style={s.closeRow}>
          <View style={{ width: 60 }} />
          <View style={[s.grabber, { backgroundColor: theme.grabber }]} />
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
            <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>{doc.title}</Text>
            <Text style={[s.headerSubtype, { color: theme.textMuted }]} numberOfLines={1}>{translateSubtype(doc.type, language)}</Text>
            <View style={s.headerStatus}>
              <View style={[s.headerStatusDot, { backgroundColor: statusConfig.color }]} />
              <Text style={[s.headerStatusText, { color: statusConfig.color }]}>{t(language, statusConfig.labelKey)}</Text>
              <Text style={[s.headerStatusDays, { color: statusConfig.color }]}>{formatDaysRemaining(doc._daysUntil, language)}</Text>
            </View>
          </View>
        </FadeInView>

        {/* Info Card */}
        <FadeInView delay={200} style={[s.group, { backgroundColor: theme.card }]}>
          {infoRows.map((row, i) => (
            <View key={i}>
              <View style={s.infoRow}>
                <Text style={[s.infoLabel, { color: theme.textSecondary }]}>{row.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                  <Text style={[s.infoValue, { color: theme.text }, row.bold && { fontWeight: '700' }]} numberOfLines={2}>
                    {row.value}
                  </Text>
                </View>
              </View>
              {i < infoRows.length - 1 && (
                <View style={{ paddingLeft: 16 }}>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
                </View>
              )}
            </View>
          ))}
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
            <Text style={[s.sectionHeader, { color: theme.textSecondary }]}>{t(language, 'attachments')}</Text>
            <View style={[s.group, { backgroundColor: theme.card, padding: 12 }]}>
              <View style={s.attachGrid}>
                {doc.attachments.map((att) => (
                  <AnimatedPressable
                    key={att.id}
                    style={s.attachItem}
                    onPress={() => {
                      if (att.type === 'image') {
                        setViewImage(att.uri);
                      } else {
                        Sharing.shareAsync(att.uri).catch(() => {});
                      }
                    }}
                    scaleValue={0.95}
                    accessibilityLabel={t(language, 'open_file')}
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
                <View key={i}>
                  <View style={s.infoRow}>
                    <Text style={[s.infoLabel, { color: theme.textSecondary }]}>
                      {formatDate(payment.date, language)}
                    </Text>
                    <Text style={[s.infoValue, { color: theme.text }]}>
                      {payment.amt != null ? formatMoney(payment.amt, currency, language) : '—'}
                    </Text>
                  </View>
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
                    <Text style={[s.infoLabel, { color: theme.text, fontWeight: '600' }]}>
                      {t(language, 'total_paid')}
                    </Text>
                    <Text style={[s.infoValue, { color: theme.text, fontWeight: '700' }]}>
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
            <AnimatedPressable style={s.actionRow} onPress={handleMarkPaid} accessibilityLabel={t(language, 'a11y_mark_paid')} hapticStyle="medium">
              <Ionicons name="checkmark-circle" size={18} color="#34C759" style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: '#34C759' }]}>
                {doc.rec !== 'none' ? t(language, 'detail_pay_next') : t(language, 'detail_resolved')}
              </Text>
            </AnimatedPressable>
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
                  await addDocumentToCalendar(doc, language);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  Alert.alert(t(language, 'alert_success'), t(language, 'cal_added'));
                } catch (e) {
                  Alert.alert(t(language, 'cal_error'));
                } finally {
                  setCalendarLoading(false);
                }
              }}
              accessibilityLabel={t(language, 'cal_add')}
            >
              {calendarLoading ? (
                <ActivityIndicator size="small" color="#007AFF" style={{ marginRight: 6 }} />
              ) : (
                <Ionicons name="calendar-outline" size={18} color="#007AFF" style={{ marginRight: 6 }} />
              )}
              <Text style={[s.actionText, { color: '#007AFF' }]}>{t(language, 'cal_add')}</Text>
            </AnimatedPressable>
          </View>

          <View style={[s.group, { backgroundColor: theme.card }]}>
            <AnimatedPressable style={s.actionRow} onPress={() => router.push(`/form?editId=${doc.id}`)} accessibilityLabel={t(language, 'a11y_edit_document')}>
              <Ionicons name="create-outline" size={18} color="#007AFF" style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: '#007AFF' }]}>{t(language, 'detail_edit')}</Text>
            </AnimatedPressable>
            <View style={{ paddingLeft: 16 }}>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.divider }} />
            </View>
            <AnimatedPressable
              style={s.actionRow}
              onPress={() => router.push(`/form?dupCat=${doc.cat}&dupType=${encodeURIComponent(doc.type)}&dupTitle=${encodeURIComponent(doc.title)}&dupAsset=${encodeURIComponent(doc.asset || '')}&dupAmt=${doc.amt || ''}&dupRec=${doc.rec}&dupNotes=${encodeURIComponent(doc.notes || '')}`)}
              accessibilityLabel={t(language, 'detail_duplicate')}
            >
              <Ionicons name="copy-outline" size={18} color="#007AFF" style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: '#007AFF' }]}>{t(language, 'detail_duplicate')}</Text>
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
              <Ionicons name="share-outline" size={18} color="#007AFF" style={{ marginRight: 6 }} />
              <Text style={[s.actionText, { color: '#007AFF' }]}>{t(language, 'share_document')}</Text>
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
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  closeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 4 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  closeCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerCard: { marginHorizontal: 16, marginTop: 16, marginBottom: 8, padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: 0.35 },
  headerSubtype: { fontSize: 14, marginTop: 2 },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  headerStatusDot: { width: 8, height: 8, borderRadius: 4 },
  headerStatusText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerStatusDays: { fontSize: 13, fontWeight: '600' },
  sectionHeader: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: 11 },
  infoLabel: { fontSize: 17 },
  infoValue: { fontSize: 17, textAlign: 'right' },
  notesText: { fontSize: 15, lineHeight: 22 },
  actionsSection: { paddingTop: 24, gap: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, minHeight: 44, justifyContent: 'center' },
  actionText: { fontSize: 17 },
  emptyText: { fontSize: 15 },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  attachItem: { width: 80, alignItems: 'center' },
  attachThumb: { width: 72, height: 72, borderRadius: 10 },
  attachFile: { alignItems: 'center', justifyContent: 'center' },
  attachExt: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  attachName: { fontSize: 11, marginTop: 4, textAlign: 'center' },
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
    marginTop: 16,
    letterSpacing: 0.35,
  },
});
