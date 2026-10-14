/**
 * Shared document actions for the lists (alerts, search, category): delete
 * with undo, the swipe "Plătit / Reînnoit" action and the long-press menu.
 * Paying always goes through the pay sheet, so the user sees the new date.
 */

import { Alert, ActionSheetIOS, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { t } from './i18n';
import { payKind } from './payment';
import { showToast } from '../stores/useToastStore';
import type { RawDocument, LanguageCode } from './constants';
import type { IconName } from '../types';

/**
 * Delete a document and show an undo toast.
 * Consolidates the delete+undo pattern used across all screens.
 */
export function deleteWithUndo(
  id: string,
  language: LanguageCode,
  deleteDocument: (id: string) => void,
  undoDelete: () => void,
) {
  deleteDocument(id);
  showToast(t(language, 'toast_deleted'), 'info', {
    label: t(language, 'toast_undo'),
    onPress: () => { undoDelete(); showToast(t(language, 'toast_undo_success')); },
  });
}

/** SwipeableRow's secondary action: opens the pay sheet for the document. */
export function buildMarkAsPaidAction<T extends RawDocument>(
  item: T,
  language: LanguageCode,
  openPay: (doc: T) => void,
) {
  const kind = payKind(item);
  const icon: IconName = kind === 'bill' ? 'checkmark-circle' : 'checkmark-done';
  return {
    label: t(language, `pay_btn_${kind}`),
    icon,
    color: '#34C759',
    onPress: () => openPay(item),
  };
}

/** Long-press menu shared by every list: pay / edit / delete (with confirmation). */
export function showDocumentMenu<T extends RawDocument>(
  item: T,
  language: LanguageCode,
  handlers: { onPay: (doc: T) => void; onEdit: (doc: T) => void; onDelete: (doc: T) => void },
) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const payLabel = t(language, `pay_btn_${payKind(item)}`);
  const confirmDelete = () => {
    Alert.alert(t(language, 'confirm_delete_title'), t(language, 'confirm_delete_msg', { title: item.title }), [
      { text: t(language, 'confirm_cancel'), style: 'cancel' },
      { text: t(language, 'confirm_delete_btn'), style: 'destructive', onPress: () => handlers.onDelete(item) },
    ]);
  };
  if (Platform.OS === 'ios') {
    const options = [t(language, 'confirm_cancel'), payLabel, t(language, 'detail_edit'), t(language, 'detail_delete')];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 0, destructiveButtonIndex: 3, title: item.title },
      (idx) => {
        if (idx === 1) handlers.onPay(item);
        else if (idx === 2) handlers.onEdit(item);
        else if (idx === 3) confirmDelete();
      },
    );
  } else {
    Alert.alert(item.title, undefined, [
      { text: t(language, 'confirm_cancel'), style: 'cancel' },
      { text: payLabel, onPress: () => handlers.onPay(item) },
      { text: t(language, 'detail_edit'), onPress: () => handlers.onEdit(item) },
      { text: t(language, 'detail_delete'), style: 'destructive', onPress: confirmDelete },
    ]);
  }
}
