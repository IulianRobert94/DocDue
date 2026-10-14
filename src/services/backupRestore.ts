/**
 * DocDue — Backup restore helpers
 *
 * Rewrites attachment files from a backup's base64 payload into the current
 * app sandbox and remaps each attachment's URI to the new location.
 */

import * as FileSystem from "expo-file-system/legacy";

import { generateId } from "../core/helpers";
import type { Attachment, RawDocument } from "../core/constants";

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

/** A plain file name we can safely place in the attachments folder. */
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

/**
 * Make restored attachments point only at files that exist in this app's
 * attachments folder. Returns new document objects (inputs aren't modified).
 *
 * - A file already in the folder is kept as-is.
 * - A file saved under an older app folder path (iOS changes it across
 *   devices / reinstalls) is re-pointed to the current folder by file name.
 * - Anything else — missing files, web links, paths outside the app from a
 *   crafted backup — is dropped, so the app never loads remote content or
 *   later deletes files outside its own folder.
 */
export async function resolveRestoredAttachments(docs: RawDocument[]): Promise<RawDocument[]> {
  const resolved: RawDocument[] = [];
  for (const doc of docs) {
    if (!doc.attachments?.length) {
      resolved.push(doc);
      continue;
    }
    const kept: Attachment[] = [];
    for (const att of doc.attachments) {
      const fileName = typeof att.uri === "string" ? att.uri.split("/").pop() ?? "" : "";
      if (!SAFE_FILE_NAME.test(fileName) || fileName.includes("..")) continue;
      const localUri = `${ATTACHMENTS_DIR}${fileName}`;
      try {
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists) kept.push({ ...att, uri: localUri });
      } catch {
        // Unreadable — drop this attachment, keep the document
      }
    }
    resolved.push({ ...doc, attachments: kept.length > 0 ? kept : undefined });
  }
  return resolved;
}
