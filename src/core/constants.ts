/**
 * DocDue — Constants & Configuration
 *
 * Acest fișier conține TOATE constantele aplicației:
 * - Categorii de documente (vehicule, locuință, etc.)
 * - Opțiuni pentru recurență, sortare, monedă, limbă
 * - Configurări de timing și storage keys
 * - Culorile pentru statusul documentelor
 *
 * PORTAT 1:1 din v10 — nu se modifică logica.
 */

// ─── Timing & Config ────────────────────────────────────

export const DATA_VERSION = 12;
export const MS_PER_DAY = 86_400_000;
export const DEFAULT_WARNING_DAYS = 14;
export const QUICK_PREVIEW_LIMIT = 3;
export const PAYMENT_WINDOW_DAYS = 30;
export const STORAGE_KEY_DOCUMENTS = "dt12_docs";
export const STORAGE_KEY_SETTINGS = "dt12_settings";
export const STORAGE_KEY_DOCUMENTS_LEGACY = "dt11_docs";
export const STORAGE_KEY_SETTINGS_LEGACY = "dt11_settings";
export const MAX_ATTACHMENTS = 5;

// ─── TypeScript Types ───────────────────────────────────

export type DocumentStatus = "expired" | "warning" | "ok";
export type RecurrenceValue = "none" | "weekly" | "monthly" | "annual";
export type SortField = "urgency" | "date" | "amount" | "name";
export type SortDirection = "asc" | "desc";
export type CurrencyCode = "RON" | "EUR" | "USD";
export type LanguageCode = "ro" | "en";
export type ThemeMode = "dark";

export type CategoryId = "vehicule" | "personal" | "casa" | "financiar";

import type { IconName } from "../types";
export type { IconName };

export interface RecurrenceOption {
  value: RecurrenceValue;
  labelKey: string;
  days: number;
}

export interface SortOption {
  value: SortField;
  labelKey: string;
  toggleable: boolean; // can toggle asc/desc
}

export interface CurrencyOption {
  value: CurrencyCode;
  label: string;
  symbol: string;
}

export interface LanguageOption {
  value: LanguageCode;
  label: string;
}

export interface Category {
  id: CategoryId;
  labelKey: string;
  icon: IconName;
  iconFilled: IconName;
  color: string;
  subtypes: string[];
}

export interface StatusDisplayConfig {
  color: string;
  background: string;
  labelKey: string;
  icon: IconName;
}

/** Atașament (fișier local — poză sau PDF) */
export interface Attachment {
  id: string;
  uri: string;         // Cale locală în documentDirectory
  name: string;        // Numele original al fișierului
  type: 'image' | 'pdf' | 'other';
  size?: number;       // Dimensiune în bytes
}

/** O plată înregistrată (snapshot la momentul marcării "Plătit") */
export interface PaymentRecord {
  date: string;      // YYYY-MM-DD — când a apăsat "Plătit"
  dueDate: string;   // scadența care a fost plătită
  amt: number | null; // suma la momentul plății
}

/** Documentul brut (cum e salvat în storage, fără câmpuri calculate) */
export interface RawDocument {
  id: string;
  cat: CategoryId;
  type: string;
  title: string;
  asset?: string;
  due: string; // "YYYY-MM-DD"
  amt: number | null;
  rec: RecurrenceValue;
  notes?: string;
  attachments?: Attachment[];
  paymentHistory?: PaymentRecord[];
}

/** Documentul îmbogățit (cu câmpuri calculate la runtime) */
export interface EnrichedDocument extends RawDocument {
  _daysUntil: number;
  _status: DocumentStatus;
}

export interface AppSettings {
  theme: ThemeMode;
  currency: CurrencyCode;
  language: LanguageCode;
  reminderDays: number[];
  notificationsEnabled: boolean;
  biometricEnabled: boolean;
  lastBackupDate: string | null;
  includeAttachmentsInBackup: boolean;
  isPremium: boolean;
  firstOpenDate: string | null;
  reviewPrompted: boolean;
}

// ─── Recurrence Options ─────────────────────────────────

export const RECURRENCE_OPTIONS: RecurrenceOption[] = [
  { value: "none",    labelKey: "rec_none",    days: 0 },
  { value: "weekly",  labelKey: "rec_weekly",  days: 7 },
  { value: "monthly", labelKey: "rec_monthly", days: 30 },
  { value: "annual",  labelKey: "rec_annual",  days: 365 },
];

// ─── Sort Options ───────────────────────────────────────

export const SORT_OPTIONS: SortOption[] = [
  { value: "urgency", labelKey: "sort_urgency", toggleable: false },
  { value: "date",    labelKey: "sort_date",    toggleable: true },
  { value: "amount",  labelKey: "sort_amount",  toggleable: true },
  { value: "name",    labelKey: "sort_name",    toggleable: false },
];

// ─── Currency Options ───────────────────────────────────

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { value: "RON", label: "RON (lei)", symbol: "lei" },
  { value: "EUR", label: "EUR (€)",   symbol: "€" },
  { value: "USD", label: "USD ($)",   symbol: "$" },
];

// ─── Language Options ───────────────────────────────────

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "ro", label: "Română" },
  { value: "en", label: "English" },
];

// ─── Warning & Reminder Options ─────────────────────────

export const REMINDER_DAYS_OPTIONS = [1, 3, 7, 14] as const;

// ─── Categories ─────────────────────────────────────────

export const CATEGORIES: Record<CategoryId, Category> = {
  vehicule: {
    id: "vehicule",
    labelKey: "cat_vehicule",
    icon: "car-outline",
    iconFilled: "car",
    color: "#007AFF",

    subtypes: [
      "RCA", "ITP", "CASCO", "Rovignetă", "Impozit auto", "Revizie service",
      "Carte verde", "Asigurare CMR", "Copie conformă",
      "Tahograf calibrare", "Verificare ADR", "Altele",
    ],
  },
  personal: {
    id: "personal",
    labelKey: "cat_personal",
    icon: "people-outline",
    iconFilled: "people",
    color: "#AF52DE",

    subtypes: [
      "Carte de identitate", "Pașaport", "Permis conducere",
      "Fișă medicală", "Asigurare sănătate", "Asigurare viață",
      "Contract de muncă", "Atestat profesional", "Card tahograf",
      "Certificat ADR", "Aviz psihologic", "Altele",
    ],
  },
  casa: {
    id: "casa",
    labelKey: "cat_casa",
    icon: "home-outline",
    iconFilled: "home",
    color: "#34C759",

    subtypes: [
      "Curent electric", "Gaz", "Apă", "Internet", "Telefonie mobilă",
      "Întreținere", "Contract chirie", "Impozit locuință",
      "Asigurare PAD", "Asigurare facultativă", "Revizie centrală", "Verificare gaze",
      "TV", "Telefon fix", "Gunoi",
      "Streaming video", "Streaming muzică", "Cloud storage",
      "Domeniu web", "Hosting", "Licență software", "Altele",
    ],
  },
  financiar: {
    id: "financiar",
    labelKey: "cat_financiar",
    icon: "briefcase-outline",
    iconFilled: "briefcase",
    color: "#FF9500",

    subtypes: [
      "Amendă", "Rată credit", "Rată leasing",
      "Impozit ANAF", "CAS/CASS", "Impozit venit", "Declarație unică",
      "Contract client", "Contract furnizor", "Asigurare profesională",
      "Autorizație", "Certificat înregistrare", "Licență transport",
      "Certificat competență", "Altele",
    ],
  },
};

// ─── Status Display ─────────────────────────────────────

export const STATUS_DISPLAY: Record<DocumentStatus, StatusDisplayConfig> = {
  expired: { color: "#FF3B30", background: "#FF3B3012", labelKey: "status_expired", icon: "close-circle" },
  warning: { color: "#FF9500", background: "#FF950012", labelKey: "status_warning", icon: "alert-circle" },
  ok:      { color: "#34C759", background: "#34C75912", labelKey: "status_ok",      icon: "checkmark-circle" },
};

// ─── Default Settings ───────────────────────────────────

export const FREE_DOCUMENT_LIMIT = 10;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  currency: "RON",
  language: "ro",
  reminderDays: [7, 3, 1],
  notificationsEnabled: false,
  biometricEnabled: false,
  lastBackupDate: null,
  includeAttachmentsInBackup: false,
  isPremium: false,
  firstOpenDate: null,
  reviewPrompted: false,
};
