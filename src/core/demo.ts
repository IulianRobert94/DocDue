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
  const offset = (days: number) => addDaysToDate(getTodayString(), days);

  return [
    // ─── Vehicule ─────────────────────────────────────
    { id: generateId(), cat: "vehicule", type: "RCA", title: "RCA — Dacia Duster", asset: "B-99-ABC", due: offset(-5), amt: 1850, rec: "annual", notes: "Omniasig, poliță RCA-2024-88431" },
    { id: generateId(), cat: "vehicule", type: "ITP", title: "ITP — Dacia Duster", asset: "B-99-ABC", due: offset(22), amt: 180, rec: "annual", notes: "Stație AutoCheck, Bd. Timișoara" },
    { id: generateId(), cat: "vehicule", type: "Rovignetă", title: "Rovignetă 12 luni", asset: "B-99-ABC", due: offset(95), amt: 28, rec: "annual", notes: "erovinieta.ro" },
    { id: generateId(), cat: "vehicule", type: "CASCO", title: "CASCO — Dacia Duster", asset: "B-99-ABC", due: offset(180), amt: 3200, rec: "annual", notes: "Allianz, franșiză 300€" },
    { id: generateId(), cat: "vehicule", type: "RCA", title: "RCA — Volvo FH 500", asset: "B-55-TIR", due: offset(8), amt: 6500, rec: "annual", notes: "Euroins, flotă" },
    { id: generateId(), cat: "vehicule", type: "Revizie service", title: "Revizie 100k km — Volvo FH", asset: "B-55-TIR", due: offset(12), amt: 4500, rec: "none", notes: "Volvo Truck Center" },
    { id: generateId(), cat: "vehicule", type: "Tahograf calibrare", title: "Calibrare tahograf", asset: "B-55-TIR", due: offset(45), amt: 650, rec: "annual", notes: "Service autorizat RAR" },

    // ─── Casă & Utilități ─────────────────────────────
    { id: generateId(), cat: "casa", type: "Curent electric", title: "Factură curent", asset: "Apartament 1", due: offset(4), amt: 320, rec: "monthly", notes: "Enel, contract activ", paymentHistory: [
      { date: addDaysToDate(getTodayString(), -90), dueDate: addDaysToDate(getTodayString(), -87), amt: 295 },
      { date: addDaysToDate(getTodayString(), -59), dueDate: addDaysToDate(getTodayString(), -57), amt: 310 },
      { date: addDaysToDate(getTodayString(), -28), dueDate: addDaysToDate(getTodayString(), -26), amt: 320 },
    ] },
    { id: generateId(), cat: "casa", type: "Gaz", title: "Factură gaz", asset: "Apartament 1", due: offset(11), amt: 185, rec: "monthly", notes: "E.ON" },
    { id: generateId(), cat: "casa", type: "Internet", title: "Internet + TV", asset: "Apartament 1", due: offset(18), amt: 55, rec: "monthly", notes: "Digi 1Gbps" },
    { id: generateId(), cat: "casa", type: "Asigurare PAD", title: "Asigurare PAD", asset: "Apartament 1", due: offset(62), amt: 130, rec: "annual", notes: "PAID România" },
    { id: generateId(), cat: "casa", type: "Întreținere", title: "Întreținere bloc", asset: "Apartament 1", due: offset(-2), amt: 480, rec: "monthly", notes: "Asociația sc. B" },
    { id: generateId(), cat: "casa", type: "Telefonie mobilă", title: "Vodafone RED", asset: "Telefon personal", due: offset(9), amt: 45, rec: "monthly", notes: "30GB" },
    { id: generateId(), cat: "casa", type: "Domeniu web", title: "example-site.ro", asset: "Website", due: offset(72), amt: 55, rec: "annual", notes: "ROTLD" },

    // ─── Personal ─────────────────────────────────────
    { id: generateId(), cat: "personal", type: "Permis conducere", title: "Permis cat. B", asset: "Titular", due: offset(340), amt: null, rec: "none", notes: "Reînnoire la 10 ani" },
    { id: generateId(), cat: "personal", type: "Carte de identitate", title: "Carte de identitate", asset: "Titular", due: offset(28), amt: null, rec: "none", notes: "Programare Ev. Populației" },
    { id: generateId(), cat: "personal", type: "Fișă medicală", title: "Fișă medicală — Angajat 1", asset: "Angajat 1 (șofer)", due: offset(5), amt: 250, rec: "annual", notes: "Medicina muncii" },

    // ─── Business & Financiar ─────────────────────────
    { id: generateId(), cat: "financiar", type: "Licență transport", title: "Licență transport marfă", asset: "Firma Demo SRL", due: offset(200), amt: null, rec: "none", notes: "ARR, valabilă 10 ani" },
    { id: generateId(), cat: "financiar", type: "Contract client", title: "Contract — Client principal", asset: "Firma Demo SRL", due: offset(35), amt: null, rec: "annual", notes: "Reînnoire anuală" },
    { id: generateId(), cat: "financiar", type: "Rată leasing", title: "Leasing Volvo FH 500", asset: "B-55-TIR", due: offset(6), amt: 2800, rec: "monthly", notes: "Leasing, rata 31/48", paymentHistory: [
      { date: addDaysToDate(getTodayString(), -60), dueDate: addDaysToDate(getTodayString(), -55), amt: 2800 },
      { date: addDaysToDate(getTodayString(), -29), dueDate: addDaysToDate(getTodayString(), -24), amt: 2800 },
    ] },
    { id: generateId(), cat: "financiar", type: "Impozit ANAF", title: "Impozit venit trim.", asset: "Firma Demo SRL", due: offset(-1), amt: 4200, rec: "monthly", notes: "Declarația 100" },
  ];
}
