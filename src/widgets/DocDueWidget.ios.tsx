/**
 * DocDue Home Screen Widget
 *
 * Shows urgent document count and upcoming deadlines.
 * Uses @expo/ui SwiftUI components for native widget rendering.
 *
 * Requires dev build (npx expo prebuild).
 */

import { Text, VStack, HStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetBase } from "expo-widgets";

// ─── Widget Props ───────────────────────────────────────

export type DocDueWidgetProps = {
  urgentCount: number;
  expiredCount: number;
  warningCount: number;
  totalDocs: number;
  docs: Array<{
    title: string;
    days: number;
    status: "expired" | "warning" | "ok";
  }>;
  /** Localized labels passed from the main app */
  labels: {
    urgent: string;       // "urgent" / "urgente"
    urgentDocs: string;   // "urgent docs" / "documente urgente"
    expired: string;      // "expired" / "expirate"
    dueSoon: string;      // "due soon" / "scadente"
    overdue: string;      // "overdue" / "depășit"
    today: string;        // "Today!" / "Astăzi!"
    daysLeft: string;     // "left" / "rămase"
    allOk: string;        // "All documents OK" / "Toate documentele OK"
  };
};

// ─── Status colors ──────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  expired: "#FF3B30",
  warning: "#FF9500",
  ok: "#34C759",
};

// ─── Widget Component ───────────────────────────────────

const DocDueWidgetComponent = (
  props: WidgetBase<DocDueWidgetProps>
) => {
  "widget";

  const { urgentCount, expiredCount, warningCount, docs, family, labels } = props;

  // ── Small Widget: Count + Next document ──
  if (family === "systemSmall") {
    return (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text
          modifiers={[
            font({ weight: "bold", size: 32 }),
            foregroundStyle(urgentCount > 0 ? "#FF3B30" : "#34C759"),
          ]}
        >
          {urgentCount}
        </Text>
        <Text
          modifiers={[
            font({ size: 13 }),
            foregroundStyle("#8E8E93"),
          ]}
        >
          {urgentCount === 1 ? labels.urgent : labels.urgentDocs}
        </Text>
        {docs.length > 0 && (
          <VStack modifiers={[padding({ top: 8 })]}>
            <Text
              modifiers={[
                font({ weight: "semibold", size: 12 }),
                foregroundStyle(STATUS_COLOR[docs[0].status] || "#8E8E93"),
              ]}
            >
              {docs[0].days < 0
                ? `${Math.abs(docs[0].days)}d ${labels.overdue}`
                : docs[0].days === 0
                ? labels.today
                : `${docs[0].days}d ${labels.daysLeft}`}
            </Text>
            <Text
              modifiers={[
                font({ size: 11 }),
                foregroundStyle("#AEAEB2"),
              ]}
            >
              {docs[0].title.length > 20
                ? docs[0].title.substring(0, 18) + "..."
                : docs[0].title}
            </Text>
          </VStack>
        )}
      </VStack>
    );
  }

  // ── Medium Widget: Count + List of next 3 docs ──
  return (
    <HStack modifiers={[padding({ all: 12 })]}>
      <VStack modifiers={[padding({ trailing: 12 })]}>
        <Text
          modifiers={[
            font({ weight: "bold", size: 36 }),
            foregroundStyle(urgentCount > 0 ? "#FF3B30" : "#34C759"),
          ]}
        >
          {urgentCount}
        </Text>
        <Text
          modifiers={[
            font({ size: 12 }),
            foregroundStyle("#8E8E93"),
          ]}
        >
          {labels.urgent}
        </Text>
        {expiredCount > 0 && (
          <Text
            modifiers={[
              font({ size: 11 }),
              foregroundStyle("#FF3B30"),
            ]}
          >
            {expiredCount} {labels.expired}
          </Text>
        )}
        {warningCount > 0 && (
          <Text
            modifiers={[
              font({ size: 11 }),
              foregroundStyle("#FF9500"),
            ]}
          >
            {warningCount} {labels.dueSoon}
          </Text>
        )}
      </VStack>
      <VStack>
        {docs.slice(0, 3).map((doc, i) => (
          <HStack key={i} modifiers={[padding({ vertical: 2 })]}>
            <Text
              modifiers={[
                font({ weight: "semibold", size: 12 }),
                foregroundStyle(STATUS_COLOR[doc.status] || "#8E8E93"),
              ]}
            >
              {doc.days < 0
                ? `${Math.abs(doc.days)}d`
                : doc.days === 0
                ? labels.today
                : `${doc.days}d`}
            </Text>
            <Text
              modifiers={[
                font({ size: 12 }),
                foregroundStyle("#FFFFFF"),
                padding({ leading: 6 }),
              ]}
            >
              {doc.title.length > 25
                ? doc.title.substring(0, 23) + "..."
                : doc.title}
            </Text>
          </HStack>
        ))}
        {docs.length === 0 && (
          <Text
            modifiers={[
              font({ size: 13 }),
              foregroundStyle("#8E8E93"),
            ]}
          >
            {labels.allOk}
          </Text>
        )}
      </VStack>
    </HStack>
  );
};

// ─── Create and export widget ───────────────────────────

const DocDueWidget = createWidget<DocDueWidgetProps>(
  "DocDueWidget",
  DocDueWidgetComponent
);

export default DocDueWidget;
