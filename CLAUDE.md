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
npm run lint                  # ESLint (eslint-config-expo); errors fail CI
npm run verify                # typecheck + lint + tests — same as CI (.github/workflows/ci.yml)
```

ESLint warnings left on purpose: 19 `react-hooks/exhaustive-deps` (each needs a behavior review before changing deps). `src/widgets/**` is excluded from lint and tsc (planned feature, packages not installed).

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

Documents also support `paymentHistory: PaymentRecord[]` — snapshots of past payments preserved through enrichment/strip cycles. The `markAsPaid` store action either advances the due date (recurring) or resolves the document (one-time), appending a payment record. Month-based recurrences keep the user's chosen day via `dueDay` (31 Jan → 28 Feb → 31 Mar). `updateDocument` **merges** the given fields onto the stored document (keys set to `undefined` clear a field), so edits never drop `paymentHistory` / `resolved`.

First launch seeds 8 example documents (id prefix `demo_`, `isDemoDocument()`): they don't count toward the free limit, never produce notifications, and "Șterge exemplele" removes only them (`removeDemoDocuments`). An example the user edits or pays gets `userEdited: true` (and one renamed before that flag existed no longer matches `DEMO_TITLES`) — from then on it's a normal document.

### State Management — Zustand + AsyncStorage

Stores hydrated in `app/_layout.tsx` on launch (the app UI stays on a spinner until init finishes). Hydration uses `readStorageKey()` (`src/services/storage.ts`): a failed or timed-out read is **not** "nothing saved" — nothing is written (storage or notification sync) before a successful load, and after a failed one persistence stays blocked for the session (`isDocumentLoadFailed()`); unreadable JSON is copied to a `*_corrupt_backup` key.

- **useDocumentStore** (`src/stores/useDocumentStore.ts`): CRUD for documents. Exports memoized selectors: `useEnrichedDocuments()`, `useEnrichedDocument(id)`, `useGlobalStats(precomputed?)`, `useCategoryStats(precomputed?)`. Stats hooks accept optional precomputed enriched docs to avoid redundant enrichment. Every mutation auto-persists to AsyncStorage and reschedules notifications + widget data.
- **useSettingsStore** (`src/stores/useSettingsStore.ts`): User preferences (language, currency, notifications, biometric). Exports derived hooks: `useTheme()`, `useLanguage()`, `useCurrency()`. Auto-persists on every `updateSetting()` call. New settings fields auto-migrate via `{ ...DEFAULT_SETTINGS, ...parsed }` spread on hydration. First launch takes language/currency from the device locale (`src/core/locale.ts`).
- **useItemStore** (`src/stores/useItemStore.ts`): Maintenance journal ("Jurnal întreținere", key `dt12_items`) — `TrackedItem`s with an `installs[]` history (only the last install may be open). Actions: `addItem`, `replaceCurrent`, `markBroken`, `startNewInstall`, `deleteInstall`, `updateItem`, `deleteItem`, `replaceAllItems`/`mergeItems` (backup). Pure math in `src/core/lifespan.ts`. No notifications, free for everyone.
- **useClockStore** (`src/stores/useClockStore.ts`): `today` ("YYYY-MM-DD"), refreshed at midnight and on app foreground. Date-derived memos (`useEnrichedDocuments`, journal screens) depend on it so day counts never freeze.

### Routing — File-Based (Expo Router)

- `app/(tabs)/` — 5-tab bottom navigation: home, alerts, add (center button → form modal), search, settings
- `app/category/[id].tsx` — Category detail (dynamic route)
- `app/document/[id].tsx` — Document detail modal
- `app/form.tsx` — Create/edit document modal (smart defaults auto-fill recurrence by subtype — also when the type is pre-filled; accepts `prefillTitle` / `prefillDue` / `prefillAsset` params)
- `app/items/index.tsx`, `app/items/[id].tsx` — Maintenance journal list (grouped by asset) and item detail (stats, estimate, history)
- `app/item-form.tsx`, `app/item-event.tsx` — Journal modals: add/edit item; record replace / broke / new install
- `app/onboarding.tsx` — 4-slide first-run experience (asks for notification permission on slide 3 or when finishing from the last slide; Skip doesn't — the document form asks in context after the first real document is saved)
- `app/analytics.tsx` — Financial analytics (PRO-gated)
- `app/premium.tsx` — Premium upsell screen
- `app/privacy.tsx` — Privacy policy viewer (renders bilingual sections from i18n)
- `app/_layout.tsx` — Root: hydrates stores, handles onboarding check, notification deep links, quick actions, morning digest scheduling, review prompt

### Premium / PRO Gating

Free tier: 10 of the user's own active documents — `countTowardFreeLimit()` ignores example and resolved documents; `isAtFreeLimit()` is the single gate (form save, add tab, quick action). PRO (`settings.isPremium`, one-time purchase): unlimited documents + backup/restore + Excel export/import + analytics. Backup/export features in settings are gated with `isPremium` checks. Backups include the maintenance journal (`items`).

**IAP Integration**: `react-native-iap` connects directly to Apple StoreKit / Google Play Billing via `src/services/iap.ts`. Product ID: `com.docdueapp.pro.lifetime` (non-consumable). When the store connection succeeds, the premium screen shows real pricing + restore purchases. When the store is unavailable the premium screen shows "not available" + Restore — there is no free unlock (removed in d1a0b3d). The product is live in both stores (29,99 lei / $5.99 iOS).

### Four Document Categories

Defined in `CATEGORIES` (`src/core/constants.ts`), each with `id`, `icon`, `color`, `subtypes[]`:
- `vehicule` (blue #007AFF) — RCA, ITP, CASCO, road tax, etc.
- `casa` (green #34C759) — utilities, rent, home insurance, subscriptions
- `personal` (purple #AF52DE) — ID, passport, driver's license, medical
- `financiar` (orange #FF9500) — business contracts, taxes, leasing, fines

### Theme — Dark Navy Only

Single dark theme (no light mode). Defined in `src/theme/colors.ts` via `createTheme()` returning an `AppTheme` object. Navy fintech palette: background `#0A0E17`, cards `#131B2B`, borders `#1E2A3D`. Hardcoded dark rgba values throughout screens use navy tones like `rgba(20,40,70,0.5)` instead of iOS system grays. `useTheme()` always returns the dark theme. `theme.isDark` is always `true` — any remaining ternaries can be simplified to the dark branch.

### i18n

Custom implementation in `src/core/i18n.ts`. No library — just a dictionary + `t(lang, key, params?)` function. Supports `{placeholder}` interpolation. Subtype translation via `translateSubtype(value, lang)`. Fallback chain: requested language → Romanian → raw key. Counts use `tp(lang, key, n)` with `key_one` / `key_few` / `key_other` forms (Romanian CLDR rules: "1 zi", "7 zile", "20 de zile"). The parity test compares the RO and EN dictionaries directly (keys and placeholders), so every key must exist in both. iOS permission prompts are localized via `locales/*.json` (app.json `locales`).

### Date Handling

**Critical**: Never use `new Date("YYYY-MM-DD")` — it parses as UTC midnight, which shifts to the previous day in UTC+2 (Romania). Always use `parseLocalDate()` from `src/core/dateUtils.ts` which constructs dates via `new Date(year, month-1, day)`.

### Core Modules

- `constants.ts` — Single source of truth: all types (`RawDocument`, `EnrichedDocument`, `AppSettings`, `CategoryId`), categories, options, colors, storage keys (`dt12_docs`, `dt12_settings`)
- `enrichment.ts` — `enrichDocument()`, `stripEnrichedFields()`, `sortDocumentsByField()`
- `dateUtils.ts` — `parseLocalDate()`, `calculateDaysUntil()`, `daysBetween()`, `addDaysToDate()`, `addMonthsToDate()`, `addMonthsKeepingDay()`, `toDateString()`
- `lifespan.ts` — Maintenance journal math: `getItemStats()` (durations, averages, km, cost, `estimatedNext`), `formatDuration()`, `formatEstimateWhen()`, `sortItems()`, `groupItemsByAsset()`, `isValidItem()`
- `analytics.ts` — `computeAnalytics()` behind the Analytics screen (history includes archived one-time payments)
- `locale.ts` — `detectDeviceDefaults()` for first-launch language/currency
- `healthScore.ts` — Document health score 0–100 (displayed on home screen). Algorithm: 100 base, −20 per expired, −5 × urgency per warning, +5 bonus if all ok. Color: red ≤40, orange ≤70, green >70
- `smartDefaults.ts` — Maps ~60 subtypes to default recurrence (e.g., RCA → annual, utilities → monthly); `resolveRecurrenceForType()` applies it unless the user picked a recurrence
- `formatters.ts` — `formatDate()`, `formatMoney()`, `formatDaysRemaining()`
- `validators.ts` — `validateDocument()` returns error messages array; `parseOptionalNumber()` for optional numeric fields
- `migration.ts` — Handles v0 (plain array) and v1+ (object with version) stored data formats
- `i18n.ts` — ~550 bilingual keys (RO/EN), `t()`, `tp()`, `pluralCategory()`

### Services

- `notifications.ts` — Local push at 9:00 AM, max 60 queued. **Always schedule through `syncAllNotifications(docs, lang)`** — it serializes runs and coalesces overlapping calls (reminders → digest → weekly). Rescheduling cancels only document reminders and keeps valid snoozes. Reminder data carries `due`; `shouldApplyMarkPaid()` ignores a stale "Plătit" tap. Reminder offsets may be negative (-1 = 1 day after expiry). Example documents never notify.
- `storage.ts` — `readStorageKey()`: read with timeout + one retry, distinguishing "empty" from "failed"
- `backupRestore.ts` — `restoreAttachmentFiles()` (base64 → fresh files) and `resolveRestoredAttachments()` (keeps only files inside the app's attachments folder)
- `calendar.ts` — Add due dates to device calendar
- `ocr.ts` — ML Kit OCR for auto-filling form fields from photos (on-device, no network). Requires dev build — graceful fallback in Expo Go
- `widgetService.ts` — Home screen widget data (pushes to expo-widgets in dev build, silent no-op in Expo Go)
- `iap.ts` — In-app purchases via react-native-iap (one-time PRO purchase + restore, direct Apple/Google connection)
- `reviewPrompt.ts` — App Store review prompt once the user has ≥ 5 real documents, ≥ 3 days after first open

### Key Components

- `AnimatedUI.tsx` — `AnimatedPressable` (scale + haptic), `FadeInView`, `AnimatedSection`
- `BiometricGate.tsx` — Face ID / Touch ID wrapper (controlled by `biometricEnabled` setting). On iOS the lock/cover renders in `FullWindowOverlay` (a subview of the key window, attached at mount — so it's keyed by lock mode + pathname to re-attach on top); app content is hidden from screen readers while locked. Notification taps and Quick Actions defer navigation until unlock. `lockState.ts` exposes `subscribeLockState()` (the image viewer closes itself on lock). Turning the lock off requires authentication.
- `journal/JournalUI.tsx` — Shared journal building blocks (`NavBar`, `Card`, `TextField`, `DateField`, `PrimaryButton`, `SecondaryButton`, `StatRow`); `journal/JournalHomeCard.tsx` — home entry
- `SwipeableRow.tsx` — Swipe-to-delete with animated action buttons (ReanimatedSwipeable)
- `ErrorBoundary.tsx` — Crash fallback UI
- `confirmActions.ts` (`src/core/`) — Shared mark-as-paid confirmation dialog builder used by alerts, search, and category screens

## Key Conventions

- Path alias: `@/*` → `./src/*` is configured (tsconfig + babel + jest) but the code uses relative imports — follow that
- Typed routes: after adding a route file, regenerate `.expo/types/router.d.ts` (the dev server does it, or `EXPO_ROUTER_APP_ROOT="$PWD/app" node -e "require('expo-router/build/typed-routes').regenerateDeclarations(require('path').resolve('.expo/types')); setTimeout(()=>{},1500)"`)
- All constants, types, and interfaces live in `src/core/constants.ts` — single source of truth
- Styles: React Native `StyleSheet.create()`, no CSS/Tailwind. Theme via `useTheme()` hook + inline style merging: `style={[s.card, { backgroundColor: theme.card }]}`
- Animations: React Native Reanimated via reusable wrappers in `AnimatedUI.tsx`
- Settings UI: iOS grouped table view pattern with `SegmentedControl` for few options, chip rows for many options
- Warning threshold: auto-computed from document recurrence via `getWarningDaysForRecurrence()` (weekly=3d, monthly=7d, annual/none=30d). No user-facing setting — this is intentional for simpler UX
- Status colors are semantic and constant: `#FF3B30` (expired/red), `#FF9500` (warning/orange), `#34C759` (ok/green). Never change these
- Category colors are brand identity: `#007AFF`, `#AF52DE`, `#34C759`, `#FF9500`. Never change these
- Store mutations have side effects: auto-persist to AsyncStorage → `syncAllNotifications` → update widget data. No manual persistence needed
- Tests live in `src/__tests__/` (~620 tests across 7 files: core, stores, services, ocr, hydration, lifespan, items). Node environment, no component tests — keep logic in `src/core` / stores where it can be tested
- The repo lives on an iCloud-synced Desktop: if `tsc`/`jest` hang at 0% CPU, macOS has evicted `node_modules` files — run `npm ci` (or move the repo out of iCloud)
- xlsx is lazy-loaded in `DataSection.tsx` via `getXLSX()` to save ~1MB from initial bundle — always use `const XLSX = await getXLSX()` instead of static import
- **Security**: When you find a security vulnerability, flag it immediately with a WARNING comment and suggest a secure alternative. Never implement insecure patterns even if asked
