/**
 * DocDue — Shadow System
 *
 * 3 consistent shadow levels for cards and elevated elements.
 * Uses dark-themed shadows (low opacity, larger spread).
 */

import { Platform } from "react-native";

export const shadowSm = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  android: { elevation: 2 },
  default: {},
}) as Record<string, unknown>;

export const shadowMd = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  android: { elevation: 4 },
  default: {},
}) as Record<string, unknown>;

export const shadowLg = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  android: { elevation: 8 },
  default: {},
}) as Record<string, unknown>;
