# DocDue project guidance

Expo/React Native document-expiry app with Romanian/English UI and an intentional dark-navy theme. Use installed package versions; SDK upgrades are separate work.

- Store `RawDocument` values, not calculated `_daysUntil` / `_status` fields. Use `enrichDocument()` and `stripEnrichedFields()`, preserving `paymentHistory`.
- Store mutations already persist data and reschedule notifications/widget updates. Reuse them; do not add competing persistence calls.
- Parse stored YYYY-MM-DD dates with `parseLocalDate()` to preserve calendar-date semantics across time zones.
- Reuse constants/types in `src/core/constants.ts`, translation helpers in `src/core/i18n.ts`, and existing `AnimatedUI` components.
- Preserve the dark theme, semantic status/category colors, and automatic warning thresholds unless changing them is requested.
- Load spreadsheets through the existing `getXLSX()` helper rather than a static xlsx import.
- Preserve native-service fallbacks in Expo Go. Do not change purchase entitlements or store configuration under an unrelated feature task.

Verification: `npx tsc --noEmit` and `npm test`, selecting relevant Jest tests for focused changes. Use the installed tools; no SDK upgrade is needed just to verify a small edit. Inspect test isolation before assuming tests cannot reach external services.

Consult the relevant architecture/service section of CLAUDE.md only when needed. Treat historical feature counts or deployment facts as context to verify against code, not current guarantees.
