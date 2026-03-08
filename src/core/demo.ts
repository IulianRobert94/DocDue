/**
 * DocDue — Demo Data
 *
 * Date demonstrative pentru prima rulare a aplicației.
 * Conțin exemple realiste din toate cele 4 categorii:
 *   vehicule, casa, personal, financiar
 */

import type { RawDocument } from "./constants";
import { getTodayString, addDaysToDate } from "./dateUtils";
import { generateId } from "./helpers";

/**
 * Generează un set complet de documente demonstrative.
 *
 * Fiecare document are o scadență relativă la ziua curentă
 * (ex: offset(-5) = expirat de 5 zile, offset(22) = peste 22 de zile).
 */
export function createDemoDocuments(): RawDocument[] {
  const today = getTodayString();
  const offset = (days: number) => addDaysToDate(today, days);

  const plate = "B-99-ABC";
  const apt = "Apartament Titan";
  const owner = "Titular";
  const biz = "PFA Demo";

  return [
    // ─── Vehicule (blue) ──────────────────────────────
    // 1 expired + 1 warning + 2 ok = shows urgency
    { id: generateId(), cat: "vehicule", type: "RCA", title: "RCA — Dacia Duster", asset: plate, due: offset(-3), amt: 1850, rec: "annual", notes: "Omniasig, poliță RCA-2024-88431" },
    { id: generateId(), cat: "vehicule", type: "ITP", title: "ITP — Dacia Duster", asset: plate, due: offset(18), amt: 180, rec: "annual", notes: "Stație AutoCheck, Bd. Timișoara" },
    { id: generateId(), cat: "vehicule", type: "CASCO", title: "CASCO — Dacia Duster", asset: plate, due: offset(145), amt: 3200, rec: "annual", notes: "Allianz, franșiză 300€" },
    { id: generateId(), cat: "vehicule", type: "Rovignetă", title: "Rovignetă 12 luni", asset: plate, due: offset(85), amt: 28, rec: "annual", notes: "erovinieta.ro" },

    // ─── Casă & Utilități (green) ─────────────────────
    // 1 expired + 1 warning + 2 ok = variety
    { id: generateId(), cat: "casa", type: "Întreținere", title: "Întreținere bloc", asset: apt, due: offset(-1), amt: 480, rec: "monthly", notes: "Asociația sc. B, et. 3" },
    { id: generateId(), cat: "casa", type: "Curent electric", title: "Factură curent Enel", asset: apt, due: offset(5), amt: 295, rec: "monthly", notes: "Contract Enel", paymentHistory: [
      { date: offset(-62), dueDate: offset(-60), amt: 280 },
      { date: offset(-31), dueDate: offset(-29), amt: 295 },
    ] },
    { id: generateId(), cat: "casa", type: "Internet", title: "Internet + TV Digi", asset: apt, due: offset(21), amt: 55, rec: "monthly", notes: "Digi Fiberlink 1000" },
    { id: generateId(), cat: "casa", type: "Asigurare PAD", title: "Asigurare PAD locuință", asset: apt, due: offset(68), amt: 130, rec: "annual", notes: "PAID România" },

    // ─── Personal (purple) ────────────────────────────
    // 1 warning + 1 ok = important personal docs
    { id: generateId(), cat: "personal", type: "Carte de identitate", title: "Carte de identitate", asset: owner, due: offset(25), amt: null, rec: "none", notes: "Programare Ev. Populației, sector 3" },
    { id: generateId(), cat: "personal", type: "Permis conducere", title: "Permis auto cat. B", asset: owner, due: offset(290), amt: null, rec: "none", notes: "Valabil 10 ani" },
    { id: generateId(), cat: "personal", type: "Fișă medicală", title: "Fișă medicală", asset: owner, due: offset(3), amt: 250, rec: "annual", notes: "Medicina muncii — dr. Ionescu" },

    // ─── Financiar (orange) ───────────────────────────
    // 1 expired + 1 warning + 1 ok = business documents
    { id: generateId(), cat: "financiar", type: "Impozit ANAF", title: "Impozit venit trimestrial", asset: biz, due: offset(-2), amt: 4200, rec: "monthly", notes: "Declarația 100, trim. I" },
    { id: generateId(), cat: "financiar", type: "Rată leasing", title: "Leasing auto — rata 31/48", asset: plate, due: offset(7), amt: 1450, rec: "monthly", notes: "BT Leasing", paymentHistory: [
      { date: offset(-61), dueDate: offset(-58), amt: 1450 },
      { date: offset(-30), dueDate: offset(-27), amt: 1450 },
    ] },
    { id: generateId(), cat: "financiar", type: "Contract client", title: "Contract servicii IT", asset: biz, due: offset(42), amt: null, rec: "annual", notes: "Reînnoire anuală — Client ABC" },
  ];
}
