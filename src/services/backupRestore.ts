/**
 * DocDue — Backup restore helpers
 *
 * Rewrites attachment files from a backup's base64 payload into the current
 * app sandbox and remaps each attachment's URI to the new location.
 */

import * as FileSystem from "expo-file-system/legacy";

import { generateId } from "../core/helpers";
import type { RawDocument } from "../core/constants";

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB base64 limit

/**
 * Write backed-up attachment files to disk and update each attachment's URI
 * in place. Mutates the passed documents.
 *
 * Files are written under FRESH unique filenames — never the filename from
 * the backup. "Replace all" restore runs right after clearAll(), which
 * deletes the old attachment files asynchronously without awaiting; reusing
 * the old filename would let an in-flight delete land after the write and
 * silently remove the just-restored file.
 */
export async function restoreAttachmentFiles(
  docs: RawDocument[],
  attachmentsData: Record<string, string>,
): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
  }
  for (const doc of docs) {
    if (!doc.attachments) continue;
    for (const att of doc.attachments) {
      const key = `${doc.id}_${att.id}`;
      const base64 = attachmentsData[key];
      if (!base64 || base64.length >= MAX_ATTACHMENT_SIZE) continue;
      const oldFileName = att.uri?.split("/").pop();
      if (!oldFileName || oldFileName.includes("..")) continue;
      // Keep the original extension (sanitized); the name itself is new
      const extMatch = oldFileName.match(/\.([A-Za-z0-9]{1,8})$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : "dat";
      const newUri = `${ATTACHMENTS_DIR}${generateId()}.${ext}`;
      try {
        await FileSystem.writeAsStringAsync(newUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        att.uri = newUri; // remap to current sandbox
      } catch {
        // Skip failed writes — the document is still restored without this file
      }
    }
  }
}
