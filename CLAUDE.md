# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start                # Dev server (Expo Go or dev client)
npx expo start --ios          # iOS simulator
npx expo start --android      # Android emulator
npx tsc --noEmit              # Type-check (no output files)
npx jest                      # Run all tests
npx jest --testPathPattern=core  # Run specific test file
```

## Architecture

**DocDue** — Expo Router + React Native app for tracking document expiration dates (insurance, IDs, bills, contracts). Bilingual (Romanian/English). Dark-only design inspired by Revolut Business fintech aesthetic. Bundle ID: `com.docdueapp`. Contact: andreiiulianrobert@gmail.com.

### Data Flow

```
RawDocument (AsyncStorage, "dt12_docs")
  → enrichDocument(doc)
  → EnrichedDocument { ...doc, _daysUntil, _status }
  → screens consume via useEnrichedDocuments() hook
```

`RawDocument` is the storage format (no calculated fields). `EnrichedDocument` adds `_daysUntil` (days until due) and `_status` ("expired" | "warning" | "ok") computed at runtime. The `_` prefix marks ephemeral fields that must be stripped before saving (via `stripEnrichedFields`).

Documents also support `paymentHistory: PaymentRecord[]` — snapshots of past payments preserved through enrichment/strip cycles. The `markAsPaid` store action either advances the due date (recurring) or resolves the document (one-time), appending a payment record.

### State Management — Zustand + AsyncStorage

Two stores, both hydrated in `app/_layout.tsx` on launch:

- **useDocumentStore** (`src/stores/useDocumentStore.ts`): CRUD for documents. Exports memoized selectors: `useEnrichedDocuments()`, `useGlobalStats()`, `useCategoryStats()`. Every mutation auto-persists to AsyncStorage and reschedules notifications + widget data.
- **useSettingsStore** (`src/stores/useSettingsStore.ts`): User preferences (language, currency, notifications, biometric). Exports derived hooks: `useTheme()`, `useLanguage()`, `useCurrency()`. Auto-persists on every `updateSetting()` call. New settings fields auto-migrate via `{ ...DEFAULT_SETTINGS, ...parsed }` spread on hydration.

### Routing — File-Based (Expo Router)

- `app/(tabs)/` — 5-tab bottom navigation: home, alerts, add (center button → form modal), search, settings
- `app/category/[id].tsx` — Category detail (dynamic route)
- `app/document/[id].tsx` — Document detail modal
- `app/form.tsx` — Create/edit document modal (smart defaults auto-fill recurrence by subtype)
- `app/onboarding.tsx` — 4-slide first-run experience (requests notification permission on slide 3)
- `app/analytics.tsx` — Financial analytics (PRO-gated)
- `app/premium.tsx` — Premium upsell screen
- `app/privacy.tsx` — Privacy policy viewer (renders bilingual sections from i18n)
- `app/_layout.tsx` — Root: hydrates stores, handles onboarding check, notification deep links, quick actions, morning digest scheduling, review prompt

### Premium / PRO Gating

Free tier: max 5 documents. PRO (`settings.isPremium`): unlimited documents + backup/restore + Excel export/import + analytics. The add-tab center button checks document count and routes to `/premium` if limit reached. Backup/export features in settings are gated with `isPremium` checks.

**IAP Integration**: RevenueCat (`react-native-purchases`) is integrated in `src/services/iap.ts`. When API keys are configured, the premium screen shows real pricing tiers + restore purchases. When not configured (API keys start with `YOUR_`), it falls back to early access mode (free unlock). To go live: create RevenueCat account, add products, replace keys in `iap.ts`.

### Four Document Categories

Defined in `CATEGORIES` (`src/core/constants.ts`), each with `id`, `icon`, `color`, `subtypes[]`:
- `vehicule` (blue #007AFF) — RCA, ITP, CASCO, road tax, etc.
- `casa` (green #34C759) — utilities, rent, home insurance, subscriptions
- `personal` (purple #AF52DE) — ID, passport, driver's license, medical
- `financiar` (orange #FF9500) — business contracts, taxes, leasing, fines

### Theme — Dark Navy Only

Single dark theme (no light mode). Defined in `src/theme/colors.ts` via `createTheme()` returning an `AppTheme` object. Navy fintech palette: background `#0A0E17`, cards `#131B2B`, borders `#1E2A3D`. Hardcoded dark rgba values throughout screens use navy tones like `rgba(20,40,70,0.5)` instead of iOS system grays. `useTheme()` always returns the dark theme. `theme.isDark` is always `true` — any remaining ternaries can be simplified to the dark branch.

### i18n

Custom implementation in `src/core/i18n.ts`. No library — just a dictionary + `t(lang, key, params?)` function. Supports `{placeholder}` interpolation. Subtype translation via `translateSubtype(value, lang)`. Fallback chain: requested language → Romanian → raw key.

### Date Handling

**Critical**: Never use `new Date("YYYY-MM-DD")` — it parses as UTC midnight, which shifts to the previous day in UTC+2 (Romania). Always use `parseLocalDate()` from `src/core/dateUtils.ts` which constructs dates via `new Date(year, month-1, day)`.

### Core Modules

- `constants.ts` — Single source of truth: all types (`RawDocument`, `EnrichedDocument`, `AppSettings`, `CategoryId`), categories, options, colors, storage keys (`dt12_docs`, `dt12_settings`)
- `enrichment.ts` — `enrichDocument()`, `stripEnrichedFields()`, `sortDocumentsByField()`
- `dateUtils.ts` — `parseLocalDate()`, `calculateDaysUntil()`, `addDaysToDate()`, `addMonthsToDate()`
- `healthScore.ts` — Document health score 0–100 (displayed on home screen). Algorithm: 100 base, −20 per expired, −5 × urgency per warning, +5 bonus if all ok. Color: red ≤40, orange ≤70, green >70
- `smartDefaults.ts` — Maps 80+ subtypes to default recurrence (e.g., RCA → annual, utilities → monthly)
- `formatters.ts` — `formatDate()`, `formatMoney()`, `formatDaysRemaining()`
- `validators.ts` — `validateDocument()` returns error messages array
- `migration.ts` — Handles v0 (plain array) and v1+ (object with version) stored data formats
- `i18n.ts` — 100+ bilingual keys (RO/EN)

### Services

- `notifications.ts` — Local push at 9:00 AM, max 60 queued. Includes smart contextual tips per document type and `scheduleMorningDigest()` for daily health score summary
- `calendar.ts` — Add due dates to device calendar
- `ocr.ts` — ML Kit OCR for auto-filling form fields from photos (on-device, no network). Requires dev build — graceful fallback in Expo Go
- `widgetService.ts` — Home screen widget data (pushes to expo-widgets in dev build, silent no-op in Expo Go)
- `iap.ts` — RevenueCat integration for in-app purchases (premium subscriptions + restore)
- `reviewPrompt.ts` — App Store review prompt after 7 days + 3 documents

### Key Components

- `AnimatedUI.tsx` — `AnimatedPressable` (scale + haptic), `FadeInView`, `AnimatedSection`
- `BiometricGate.tsx` — Face ID / Touch ID wrapper (controlled by `biometricEnabled` setting)
- `SwipeableRow.tsx` — Swipe-to-delete with animated action buttons (ReanimatedSwipeable)
- `ErrorBoundary.tsx` — Crash fallback UI
- `confirmActions.ts` (`src/core/`) — Shared mark-as-paid confirmation dialog builder used by alerts, search, and category screens

## Key Conventions

- Path alias: `@/*` → `./src/*` (configured in tsconfig + babel + jest)
- All constants, types, and interfaces live in `src/core/constants.ts` — single source of truth
- Styles: React Native `StyleSheet.create()`, no CSS/Tailwind. Theme via `useTheme()` hook + inline style merging: `style={[s.card, { backgroundColor: theme.card }]}`
- Animations: React Native Reanimated via reusable wrappers in `AnimatedUI.tsx`
- Settings UI: iOS grouped table view pattern with `SegmentedControl` for few options, chip rows for many options
- Warning threshold: auto-computed from document recurrence via `getWarningDaysForRecurrence()` (weekly=3d, monthly=7d, annual/none=30d). No user-facing setting — this is intentional for simpler UX
- Status colors are semantic and constant: `#FF3B30` (expired/red), `#FF9500` (warning/orange), `#34C759` (ok/green). Never change these
- Category colors are brand identity: `#007AFF`, `#AF52DE`, `#34C759`, `#FF9500`. Never change these
- Store mutations have side effects: auto-persist to AsyncStorage → reschedule notifications → update widget data. No manual persistence needed
- Tests live in `src/__tests__/core.test.ts` (112 tests covering date utils, validation, enrichment, migration, formatters, health score, smart defaults, i18n)
