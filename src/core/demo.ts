/**
 * DocDue — Demo Data
 *
 * Bilingual demo documents for first launch.
 * Realistic examples across all 4 categories:
 *   vehicule, casa, personal, financiar
 */

import type { RawDocument, LanguageCode } from "./constants";
import { getTodayString, addDaysToDate } from "./dateUtils";
import { generateId } from "./helpers";

export const DEMO_ID_PREFIX = "demo_";

const DEMO_TEXT: Record<string, Record<LanguageCode, string>> = {
  // Titles
  t_rca: { ro: "RCA — Dacia Duster", en: "Car Insurance — Dacia Duster" },
  t_itp: { ro: "ITP — Dacia Duster", en: "Vehicle Inspection — Dacia Duster" },
  t_casco: { ro: "CASCO — Dacia Duster", en: "Comprehensive Insurance — Dacia Duster" },
  t_rovig: { ro: "Rovignetă 12 luni", en: "Road Tax 12 months" },
  t_intret: { ro: "Întreținere bloc", en: "Building maintenance" },
  t_curent: { ro: "Factură curent Enel", en: "Electricity bill Enel" },
  t_internet: { ro: "Internet + TV Digi", en: "Internet + TV Digi" },
  t_pad: { ro: "Asigurare PAD locuință", en: "Home insurance PAD" },
  t_ci: { ro: "Carte de identitate", en: "National ID card" },
  t_permis: { ro: "Permis auto cat. B", en: "Driver's license cat. B" },
  t_fisa: { ro: "Fișă medicală", en: "Medical certificate" },
  t_anaf: { ro: "Impozit venit trimestrial", en: "Quarterly income tax" },
  t_leasing: { ro: "Leasing auto — rata 31/48", en: "Car leasing — payment 31/48" },
  t_contract: { ro: "Contract servicii IT", en: "IT services contract" },
  // Notes
  n_rca: { ro: "Omniasig, poliță RCA-2024-88431", en: "Omniasig, policy RCA-2024-88431" },
  n_itp: { ro: "Stație AutoCheck, Bd. Timișoara", en: "AutoCheck station, Timișoara Blvd." },
  n_casco: { ro: "Allianz, franșiză 300€", en: "Allianz, 300€ deductible" },
  n_rovig: { ro: "erovinieta.ro", en: "erovinieta.ro" },
  n_intret: { ro: "Asociația sc. B, et. 3", en: "Building association B, floor 3" },
  n_curent: { ro: "Contract Enel", en: "Enel contract" },
  n_internet: { ro: "Digi Fiberlink 1000", en: "Digi Fiberlink 1000" },
  n_pad: { ro: "PAID România", en: "PAID Romania" },
  n_ci: { ro: "Programare Ev. Populației, sector 3", en: "Appointment at Population Office, district 3" },
  n_permis: { ro: "Valabil 10 ani", en: "Valid for 10 years" },
  n_fisa: { ro: "Medicina muncii — dr. Ionescu", en: "Occupational medicine — Dr. Ionescu" },
  n_anaf: { ro: "Declarația 100, trim. I", en: "Tax declaration 100, Q1" },
  n_leasing: { ro: "BT Leasing", en: "BT Leasing" },
  n_contract: { ro: "Reînnoire anuală — Client ABC", en: "Annual renewal — Client ABC" },
  // Assets
  a_apt: { ro: "Apartament Titan", en: "Titan Apartment" },
  a_owner: { ro: "Titular", en: "Owner" },
  a_biz: { ro: "PFA Demo", en: "Freelance Demo" },
};

function d(key: string, lang: LanguageCode): string {
  return DEMO_TEXT[key]?.[lang] ?? DEMO_TEXT[key]?.ro ?? key;
}

/**
 * Generate a complete set of demo documents in the given language.
 * Each document has a due date relative to today.
 */
export function createDemoDocuments(lang: LanguageCode = "ro"): RawDocument[] {
  const today = getTodayString();
  const offset = (days: number) => addDaysToDate(today, days);

  const plate = "B-99-ABC";
  const apt = d("a_apt", lang);
  const owner = d("a_owner", lang);
  const biz = d("a_biz", lang);

  const demoId = () => `${DEMO_ID_PREFIX}${generateId()}`;

  return [
    // ─── Vehicule (blue) ──────────────────────────────
    { id: demoId(), cat: "vehicule", type: "RCA", title: d("t_rca", lang), asset: plate, due: offset(-3), amt: 1850, rec: "annual", notes: d("n_rca", lang) },
    { id: demoId(), cat: "vehicule", type: "ITP", title: d("t_itp", lang), asset: plate, due: offset(18), amt: 180, rec: "annual", notes: d("n_itp", lang) },
    { id: demoId(), cat: "vehicule", type: "CASCO", title: d("t_casco", lang), asset: plate, due: offset(145), amt: 3200, rec: "annual", notes: d("n_casco", lang) },
    { id: demoId(), cat: "vehicule", type: "Rovignetă", title: d("t_rovig", lang), asset: plate, due: offset(85), amt: 28, rec: "annual", notes: d("n_rovig", lang) },

    // ─── Casă & Utilități (green) ─────────────────────
    { id: demoId(), cat: "casa", type: "Întreținere", title: d("t_intret", lang), asset: apt, due: offset(-1), amt: 480, rec: "monthly", notes: d("n_intret", lang) },
    { id: demoId(), cat: "casa", type: "Curent electric", title: d("t_curent", lang), asset: apt, due: offset(5), amt: 295, rec: "monthly", notes: d("n_curent", lang), paymentHistory: [
      { date: offset(-62), dueDate: offset(-60), amt: 280 },
      { date: offset(-31), dueDate: offset(-29), amt: 295 },
    ] },
    { id: demoId(), cat: "casa", type: "Internet", title: d("t_internet", lang), asset: apt, due: offset(21), amt: 55, rec: "monthly", notes: d("n_internet", lang) },
    { id: demoId(), cat: "casa", type: "Asigurare PAD", title: d("t_pad", lang), asset: apt, due: offset(68), amt: 130, rec: "annual", notes: d("n_pad", lang) },

    // ─── Personal (purple) ────────────────────────────
    { id: demoId(), cat: "personal", type: "Carte de identitate", title: d("t_ci", lang), asset: owner, due: offset(25), amt: null, rec: "none", notes: d("n_ci", lang) },
    { id: demoId(), cat: "personal", type: "Permis conducere", title: d("t_permis", lang), asset: owner, due: offset(290), amt: null, rec: "none", notes: d("n_permis", lang) },
    { id: demoId(), cat: "personal", type: "Fișă medicală", title: d("t_fisa", lang), asset: owner, due: offset(3), amt: 250, rec: "annual", notes: d("n_fisa", lang) },

    // ─── Financiar (orange) ───────────────────────────
    { id: demoId(), cat: "financiar", type: "Impozit ANAF", title: d("t_anaf", lang), asset: biz, due: offset(-2), amt: 4200, rec: "monthly", notes: d("n_anaf", lang) },
    { id: demoId(), cat: "financiar", type: "Rată leasing", title: d("t_leasing", lang), asset: plate, due: offset(7), amt: 1450, rec: "monthly", notes: d("n_leasing", lang), paymentHistory: [
      { date: offset(-61), dueDate: offset(-58), amt: 1450 },
      { date: offset(-30), dueDate: offset(-27), amt: 1450 },
    ] },
    { id: demoId(), cat: "financiar", type: "Contract client", title: d("t_contract", lang), asset: biz, due: offset(42), amt: null, rec: "annual", notes: d("n_contract", lang) },
  ];
}
