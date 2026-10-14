/**
 * DocDue — Widget Update Service
 *
 * Updates the home screen widget with current document data.
 * Called after store hydration and document mutations.
 *
 * Uses expo-widgets reloadAll when available (dev build).
 * Fails silently in Expo Go (native module not available).
 */

import { NativeModules } from "react-native";
import type { RawDocument } from "../core/constants";
import { enrichDocument } from "../core/enrichment";

// Check once at module load — avoids noisy require errors in Expo Go
const hasWidgetModule = !!NativeModules.ExpoWidgets;

/**
 * Update the widget snapshot with current document data.
 * Triggers a widget reload so iOS/Android re-renders with fresh data.
 */
export function updateWidgetData(documents: RawDocument[]): void {
  if (!hasWidgetModule) return;

  try {
    // Not installed yet (widgets are planned) — required lazily, only when the native module exists
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WidgetModule = require("expo-widgets");
    if (!WidgetModule?.reloadAllTimelines) return;

    const enriched = documents.filter((d) => !d.resolved).map((d) => enrichDocument(d));
    const urgent = enriched.filter(
      (d) => d._status === "expired" || d._status === "warning"
    );

    // NOTE: the DocDueWidget component (src/widgets/) also expects a localized
    // `labels` object, but that widget is WIP / not bundled, so we intentionally
    // omit it here. When the widget is enabled, add labels built from i18n.
    const widgetData = {
      urgentCount: urgent.length,
      expiredCount: enriched.filter((d) => d._status === "expired").length,
      warningCount: enriched.filter((d) => d._status === "warning").length,
      totalDocs: documents.length,
      docs: enriched
        .sort((a, b) => a._daysUntil - b._daysUntil)
        .slice(0, 5)
        .map((d) => ({
          title: d.title,
          days: d._daysUntil,
          status: d._status,
        })),
    };

    if (WidgetModule.setWidgetData) {
      WidgetModule.setWidgetData("DocDueWidget", JSON.stringify(widgetData));
    }

    WidgetModule.reloadAllTimelines();
  } catch {
    // Silent — widget native module unavailable
  }
}
