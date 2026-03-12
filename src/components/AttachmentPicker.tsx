/**
 * AttachmentPicker — Add & manage document attachments
 *
 * Supports photos (camera/gallery) and files (PDF, etc.)
 * Stores files locally in documentDirectory/attachments/
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActionSheetIOS,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";

import { generateId } from "../core/helpers";
import { t } from "../core/i18n";
import { MAX_ATTACHMENTS } from "../core/constants";
import type { Attachment } from "../core/constants";
import type { LanguageCode } from "../core/constants";
import type { AppTheme } from "../theme/colors";
import { AnimatedPressable } from "./AnimatedUI";

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

/** Ensure attachments directory exists */
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
  }
}

/** Copy a file to the attachments directory and return the new URI */
async function copyToAttachments(sourceUri: string, fileName: string): Promise<string> {
  await ensureDir();
  const destUri = `${ATTACHMENTS_DIR}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

/** Get file extension from URI or name */
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "heic", "heif", "webp", "bmp", "pdf"]);

function getExtension(name: string): string {
  const parts = name.split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  return ALLOWED_EXTENSIONS.has(ext) ? ext : "";
}

/** Determine attachment type from extension */
function getAttachmentType(name: string): Attachment["type"] {
  const ext = getExtension(name);
  if (["jpg", "jpeg", "png", "gif", "heic", "heif", "webp", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

interface AttachmentPickerProps {
  attachments: Attachment[];
  onAdd: (attachment: Attachment) => void;
  onRemove: (id: string) => void;
  theme: AppTheme;
  language: LanguageCode;
  documentId?: string;
}

export function AttachmentPicker({
  attachments,
  onAdd,
  onRemove,
  theme,
  language,
  documentId,
}: AttachmentPickerProps) {
  const atLimit = attachments.length >= MAX_ATTACHMENTS;

  const handleAddPhoto = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t(language, "confirm_cancel"), t(language, "from_camera"), t(language, "from_gallery")],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickFromCamera();
          if (buttonIndex === 2) pickFromGallery();
        }
      );
    } else {
      // Android: use Alert.alert for camera/gallery choice
      Alert.alert(
        t(language, "add_photo"),
        undefined,
        [
          { text: t(language, "confirm_cancel"), style: "cancel" },
          { text: t(language, "from_camera"), onPress: pickFromCamera },
          { text: t(language, "from_gallery"), onPress: pickFromGallery },
        ]
      );
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t(language, "alert_notice"), t(language, "photo_permission"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t(language, "alert_notice"), t(language, "photo_permission"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      const id = generateId();
      const ext = getExtension(asset.uri) || "jpg";
      const fileName = `${documentId || "new"}_${id}.${ext}`;
      const uri = await copyToAttachments(asset.uri, fileName);
      const attachment: Attachment = {
        id,
        uri,
        name: asset.fileName || fileName,
        type: "image",
        size: asset.fileSize,
      };
      onAdd(attachment);
    } catch (e) {
      Alert.alert(t(language, "attachment_error"));
    }
  };

  const handleAddFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      const id = generateId();
      const ext = getExtension(file.name) || "file";
      const fileName = `${documentId || "new"}_${id}.${ext}`;
      const uri = await copyToAttachments(file.uri, fileName);
      const attachment: Attachment = {
        id,
        uri,
        name: file.name,
        type: getAttachmentType(file.name),
        size: file.size ?? undefined,
      };
      onAdd(attachment);
    } catch (e) {
      Alert.alert(t(language, "attachment_error"));
    }
  };

  const handleRemove = (att: Attachment) => {
    // Delete the file
    FileSystem.deleteAsync(att.uri, { idempotent: true }).catch(() => {});
    onRemove(att.id);
  };

  return (
    <View>
      {/* Thumbnails */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailRow}
        >
          {attachments.map((att) => (
            <View key={att.id} style={styles.thumbnailWrap}>
              {att.type === "image" ? (
                <Image source={{ uri: att.uri }} style={styles.thumbnail} accessibilityLabel={att.name} />
              ) : (
                <View style={[styles.thumbnail, styles.fileThumbnail, { backgroundColor: theme.inputFill }]} accessibilityLabel={att.name}>
                  <Ionicons
                    name={att.type === "pdf" ? "document-text" : "document-outline"}
                    size={24}
                    color={att.type === "pdf" ? "#FF3B30" : theme.textMuted}
                  />
                  <Text style={[styles.fileExt, { color: theme.textMuted }]} numberOfLines={1}>
                    {getExtension(att.name).toUpperCase()}
                  </Text>
                </View>
              )}
              <AnimatedPressable
                style={[styles.removeBtn, { backgroundColor: theme.card }]}
                onPress={() => handleRemove(att)}
                hapticStyle="light"
                accessibilityLabel={t(language, "remove_attachment")}
              >
                <Ionicons name="close-circle-sharp" size={22} color="#FF3B30" />
              </AnimatedPressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Action buttons */}
      {!atLimit && (
        <View style={styles.buttonRow}>
          <AnimatedPressable
            style={[styles.addBtn, { backgroundColor: theme.inputFill }]}
            onPress={handleAddPhoto}
            hapticStyle="light"
            accessibilityLabel={t(language, "add_photo")}
          >
            <Ionicons name="camera-outline" size={18} color="#007AFF" />
            <Text style={[styles.addBtnText, { color: "#007AFF" }]}>
              {t(language, "add_photo")}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.addBtn, { backgroundColor: theme.inputFill }]}
            onPress={handleAddFile}
            hapticStyle="light"
            accessibilityLabel={t(language, "add_file")}
          >
            <Ionicons name="attach-outline" size={18} color="#007AFF" />
            <Text style={[styles.addBtnText, { color: "#007AFF" }]}>
              {t(language, "add_file")}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      {atLimit && (
        <Text style={[styles.limitText, { color: theme.textMuted }]}>
          {t(language, "attachment_limit")}
        </Text>
      )}
    </View>
  );
}

/** Delete all attachment files for a document */
export async function deleteAttachmentFiles(attachments?: Attachment[]) {
  if (!attachments || attachments.length === 0) return;
  for (const att of attachments) {
    try {
      await FileSystem.deleteAsync(att.uri, { idempotent: true });
    } catch {
      // Ignore errors — file may already be gone
    }
  }
}

const styles = StyleSheet.create({
  thumbnailRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  thumbnailWrap: {
    position: "relative",
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  fileThumbnail: {
    alignItems: "center",
    justifyContent: "center",
  },
  fileExt: {
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },
  removeBtn: {
    position: "absolute",
    top: -10,
    right: -10,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "500",
  },
  limitText: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
