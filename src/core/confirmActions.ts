/**
 * Shared confirmation dialogs for document actions (mark-as-paid, delete with undo).
 * Used by alerts, search, category, and document detail screens to avoid duplication.
 */

import { Alert } from 'react-native';
import { t } from './i18n';
import { showToast } from '../stores/useToastStore';
import type { EnrichedDocument, LanguageCode } from './constants';
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

/**
 * Build the secondaryAction config for SwipeableRow's mark-as-paid action.
 * Returns undefined for "ok" status documents (no action needed).
 */
export function buildMarkAsPaidAction(
  item: EnrichedDocument,
  language: LanguageCode,
  markAsPaid: (doc: EnrichedDocument) => void,
) {
  if (item._status !== 'expired' && item._status !== 'warning') return undefined;

  const isRecurring = item.rec !== 'none';
  const icon: IconName = isRecurring ? 'checkmark-circle' : 'checkmark-done';
  return {
    label: t(language, isRecurring ? 'confirm_paid_btn' : 'confirm_resolved_btn'),
    icon,
    color: '#34C759',
    onPress: () => {
      const title = t(language, isRecurring ? 'confirm_paid_title' : 'confirm_resolved_title');
      const msg = t(language, isRecurring ? 'confirm_paid_msg' : 'confirm_resolved_msg');
      const btn = t(language, isRecurring ? 'confirm_paid_btn' : 'confirm_resolved_btn');
      Alert.alert(title, msg, [
        { text: t(language, 'confirm_cancel'), style: 'cancel' },
        { text: btn, onPress: () => markAsPaid(item) },
      ]);
    },
  };
}
