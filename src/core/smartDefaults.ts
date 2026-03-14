/**
 * DocDue — Smart Defaults
 *
 * When a user selects a document subtype, suggest default recurrence.
 * This reduces friction when adding documents.
 */

import { CATEGORIES } from "./constants";
import type { RecurrenceValue, CategoryId } from "./constants";

interface SmartDefault {
  recurrence: RecurrenceValue;
}

/**
 * Map of subtype → smart defaults.
 * Keys are Romanian subtypes (as stored in CATEGORIES).
 */
const SUBTYPE_DEFAULTS: Record<string, SmartDefault> = {
  // Vehicule — mostly annual
  "RCA": { recurrence: "annual" },
  "CASCO": { recurrence: "annual" },
  "ITP": { recurrence: "annual" },
  "Rovignetă": { recurrence: "annual" },
  "Impozit auto": { recurrence: "annual" },
  "Revizie service": { recurrence: "annual" },
  "Tahograf calibrare": { recurrence: "annual" },
  "Copie conformă": { recurrence: "annual" },
  "Verificare ADR": { recurrence: "annual" },
  "Asigurare CMR": { recurrence: "annual" },
  "Carte verde": { recurrence: "annual" },

  // Personal — mostly multi-year (no recurrence or annual)
  "Permis conducere": { recurrence: "none" },
  "Carte de identitate": { recurrence: "none" },
  "Pașaport": { recurrence: "none" },
  "Atestat profesional": { recurrence: "annual" },
  "Card tahograf": { recurrence: "none" },
  "Fișă medicală": { recurrence: "annual" },
  "Certificat ADR": { recurrence: "none" },
  "Aviz psihologic": { recurrence: "annual" },
  "Contract de muncă": { recurrence: "annual" },
  "Asigurare viață": { recurrence: "annual" },
  "Asigurare sănătate": { recurrence: "annual" },

  // Casa — mostly monthly
  "Curent electric": { recurrence: "monthly" },
  "Gaz": { recurrence: "monthly" },
  "Apă": { recurrence: "monthly" },
  "Internet": { recurrence: "monthly" },
  "TV": { recurrence: "monthly" },
  "Telefon fix": { recurrence: "monthly" },
  "Gunoi": { recurrence: "monthly" },
  "Întreținere": { recurrence: "monthly" },
  "Asigurare PAD": { recurrence: "annual" },
  "Asigurare facultativă": { recurrence: "annual" },
  "Contract chirie": { recurrence: "monthly" },
  "Impozit locuință": { recurrence: "annual" },
  "Revizie centrală": { recurrence: "annual" },
  "Verificare gaze": { recurrence: "annual" },
  "Telefonie mobilă": { recurrence: "monthly" },
  "Streaming video": { recurrence: "monthly" },
  "Streaming muzică": { recurrence: "monthly" },
  "Cloud storage": { recurrence: "monthly" },
  "Domeniu web": { recurrence: "annual" },
  "Hosting": { recurrence: "monthly" },
  "Licență software": { recurrence: "annual" },

  // Financiar
  "Certificat înregistrare": { recurrence: "none" },
  "Licență transport": { recurrence: "annual" },
  "Certificat competență": { recurrence: "none" },
  "Autorizație": { recurrence: "annual" },
  "Asigurare profesională": { recurrence: "annual" },
  "Contract client": { recurrence: "annual" },
  "Contract furnizor": { recurrence: "annual" },
  "Rată credit": { recurrence: "monthly" },
  "Rată leasing": { recurrence: "monthly" },
  "Impozit ANAF": { recurrence: "monthly" },
  "Amendă": { recurrence: "none" },
  "CAS/CASS": { recurrence: "monthly" },
  "Impozit venit": { recurrence: "annual" },
  "Declarație unică": { recurrence: "annual" },
};

/**
 * Get smart default recurrence for a document subtype.
 * Returns null if no default is found.
 */
export function getSmartDefaults(subtype: string): SmartDefault | null {
  return SUBTYPE_DEFAULTS[subtype] || null;
}

/**
 * Auto-detect category and type from a document title.
 * Example: "RCA Ford Focus" → { cat: 'vehicule', type: 'RCA' }
 */
export function autoCategorize(title: string): { cat?: CategoryId; type?: string } | null {
  if (!title || title.length < 2) return null;
  const lower = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Check common abbreviations first (higher priority, more precise)
  const KEYWORD_MAP: Record<string, { cat: CategoryId; type: string }> = {
    'rca': { cat: 'vehicule', type: 'RCA' },
    'itp': { cat: 'vehicule', type: 'ITP' },
    'casco': { cat: 'vehicule', type: 'CASCO' },
    'rovigneta': { cat: 'vehicule', type: 'Rovignetă' },
    'rovinieta': { cat: 'vehicule', type: 'Rovignetă' },
    'carte verde': { cat: 'vehicule', type: 'Carte verde' },
    'tahograf': { cat: 'vehicule', type: 'Tahograf calibrare' },
    'curent': { cat: 'casa', type: 'Curent electric' },
    'gaz': { cat: 'casa', type: 'Gaz' },
    'apa': { cat: 'casa', type: 'Apă' },
    'internet': { cat: 'casa', type: 'Internet' },
    'chirie': { cat: 'casa', type: 'Contract chirie' },
    'intretinere': { cat: 'casa', type: 'Întreținere' },
    'pasaport': { cat: 'personal', type: 'Pașaport' },
    'buletin': { cat: 'personal', type: 'Carte de identitate' },
    'permis': { cat: 'personal', type: 'Permis conducere' },
    'amenda': { cat: 'financiar', type: 'Amendă' },
    'rata': { cat: 'financiar', type: 'Rată credit' },
    'leasing': { cat: 'financiar', type: 'Rată leasing' },
    'anaf': { cat: 'financiar', type: 'Impozit ANAF' },
    'cas': { cat: 'financiar', type: 'CAS/CASS' },
    'cass': { cat: 'financiar', type: 'CAS/CASS' },
  };

  for (const [keyword, result] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) return result;
  }

  // Check each category's subtypes for keyword match
  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    for (const subtype of cat.subtypes) {
      if (subtype === 'Altele') continue;
      const subtypeLower = subtype.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(subtypeLower)) {
        return { cat: catId as CategoryId, type: subtype };
      }
    }
  }

  return null;
}
