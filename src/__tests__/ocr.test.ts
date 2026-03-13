/**
 * DocDue — OCR Parsing Tests
 *
 * Tests for date extraction, amount extraction, document type matching,
 * Romanian number parsing, and title extraction from OCR text.
 */

import {
  extractDate,
  extractAmount,
  parseRomanianNumber,
  matchDocumentType,
  extractTitle,
} from "../services/ocr";

// ─── extractDate ────────────────────────────────────────

describe("extractDate", () => {
  it("extracts DD.MM.YYYY format", () => {
    const result = extractDate("Scadență: 15.06.2026");
    expect(result).toBe("2026-06-15");
  });

  it("extracts DD/MM/YYYY format", () => {
    const result = extractDate("Data: 01/12/2025");
    expect(result).toBe("2025-12-01");
  });

  it("extracts DD-MM-YYYY format", () => {
    const result = extractDate("Expirare 25-03-2027");
    expect(result).toBe("2027-03-25");
  });

  it("returns null for no dates", () => {
    expect(extractDate("No dates here")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(extractDate("")).toBeNull();
  });

  it("prefers future dates over past dates", () => {
    // Use a date far enough in the future to always be future
    const result = extractDate("Old: 01.01.2021\nNew: 15.06.2035");
    expect(result).toBe("2035-06-15");
  });

  it("picks nearest future date when multiple future dates exist", () => {
    const result = extractDate("First: 01.01.2035\nSecond: 01.06.2035\nThird: 01.01.2036");
    expect(result).toBe("2035-01-01");
  });

  it("rejects invalid month (13)", () => {
    expect(extractDate("Date: 15.13.2025")).toBeNull();
  });

  it("rejects invalid day (32)", () => {
    expect(extractDate("Date: 32.01.2025")).toBeNull();
  });

  it("rejects year too far in the past", () => {
    expect(extractDate("Date: 15.06.1999")).toBeNull();
  });

  it("rejects year too far in the future", () => {
    const farFuture = new Date().getFullYear() + 31;
    expect(extractDate(`Date: 15.06.${farFuture}`)).toBeNull();
  });

  it("handles single-digit day and month", () => {
    const result = extractDate("Scadență: 5.3.2030");
    expect(result).toBe("2030-03-05");
  });

  it("extracts from multi-line OCR text", () => {
    const text = `POLIȚA DE ASIGURARE RCA
Nr. 12345
Valabilitate: 01.01.2026 - 31.12.2026
Suma: 1.250,00 RON`;
    const result = extractDate(text);
    // Should pick a future date
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns latest past date when within 1 year, null when older", () => {
    // Dates older than 1 year should return null (irrelevant for document tracking)
    const oldResult = extractDate("Date1: 01.06.2021\nDate2: 15.03.2022");
    expect(oldResult).toBeNull();

    // Recent past date (within 1 year) should be returned
    const now = new Date();
    const recentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const lastYear = now.getFullYear() - 1;
    const recentResult = extractDate(`Date: 15.${recentMonth}.${lastYear + 1}`);
    // This date is in the current year — should be found (either future or recent past)
    expect(recentResult).not.toBeNull();
  });
});

// ─── parseRomanianNumber ────────────────────────────────

describe("parseRomanianNumber", () => {
  it("parses Romanian format 1.234,56", () => {
    expect(parseRomanianNumber("1.234,56")).toBe(1234.56);
  });

  it("parses English format 1,234.56", () => {
    expect(parseRomanianNumber("1,234.56")).toBe(1234.56);
  });

  it("parses simple decimal 123.45", () => {
    expect(parseRomanianNumber("123.45")).toBe(123.45);
  });

  it("parses large Romanian format 12.345,67", () => {
    expect(parseRomanianNumber("12.345,67")).toBe(12345.67);
  });

  it("returns null for NaN", () => {
    expect(parseRomanianNumber("abc")).toBeNull();
  });

  it("returns null for zero or negative in English format", () => {
    expect(parseRomanianNumber("0.00")).toBeNull();
  });

  it("parses comma-only decimal 250,50", () => {
    expect(parseRomanianNumber("250,50")).toBe(250.50);
  });
});

// ─── extractAmount ──────────────────────────────────────

describe("extractAmount", () => {
  it("extracts amount with RON suffix", () => {
    const result = extractAmount("Total: 250.00 RON");
    expect(result).toBe(250);
  });

  it("extracts amount with lei suffix", () => {
    const result = extractAmount("Suma: 1.250,00 lei");
    expect(result).toBe(1250);
  });

  it("extracts amount with EUR prefix", () => {
    const result = extractAmount("EUR 99.99");
    expect(result).toBe(99.99);
  });

  it("extracts amount with € symbol", () => {
    const result = extractAmount("€ 50.00");
    expect(result).toBe(50);
  });

  it("extracts amount with $ symbol", () => {
    const result = extractAmount("Price: 29.99 $");
    expect(result).toBe(29.99);
  });

  it("extracts amount after Total:", () => {
    const result = extractAmount("Total: 150.00");
    expect(result).toBe(150);
  });

  it("extracts amount after Suma:", () => {
    const result = extractAmount("Suma: 320.50");
    expect(result).toBe(320.50);
  });

  it("returns null for no amounts", () => {
    expect(extractAmount("No money here")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(extractAmount("")).toBeNull();
  });

  it("extracts Romanian format amount", () => {
    const result = extractAmount("Plata: 2.500,00 RON");
    expect(result).toBe(2500);
  });
});

// ─── matchDocumentType ──────────────────────────────────

describe("matchDocumentType", () => {
  it("matches RCA document", () => {
    const result = matchDocumentType("POLIȚA DE ASIGURARE RCA");
    expect(result.category).toBe("vehicule");
    expect(result.type).toBe("RCA");
  });

  it("matches ITP document", () => {
    const result = matchDocumentType("CERTIFICAT DE INSPECȚIE TEHNICĂ PERIODICĂ");
    expect(result.category).toBe("vehicule");
  });

  it("matches Carte de identitate", () => {
    const result = matchDocumentType("CARTE DE IDENTITATE");
    expect(result.category).toBe("personal");
    expect(result.type).toBe("Carte de identitate");
  });

  it("matches Pașaport", () => {
    const result = matchDocumentType("PAȘAPORT ELECTRONIC");
    expect(result.category).toBe("personal");
  });

  it("matches Factura", () => {
    const result = matchDocumentType("FACTURĂ FISCALĂ");
    expect(result.category).toBe("casa");
  });

  it("matches IMPOZIT via abbreviations", () => {
    const result = matchDocumentType("DECLARAȚIE IMPOZIT PE VENIT");
    expect(result.category).toBe("financiar");
  });

  it("matches AMENDĂ via abbreviations", () => {
    const result = matchDocumentType("AMENDĂ CONTRAVENȚIONALĂ");
    expect(result.category).toBe("financiar");
    expect(result.type).toBe("Amendă");
  });

  it("matches LEASING", () => {
    const result = matchDocumentType("CONTRACT LEASING AUTO");
    expect(result.category).toBe("financiar");
  });

  it("matches CREDIT", () => {
    const result = matchDocumentType("CONTRACT DE CREDIT IPOTECAR");
    expect(result.category).toBe("financiar");
  });

  it("matches PERMIS DE CONDUCERE", () => {
    const result = matchDocumentType("PERMIS DE CONDUCERE CATEGORIA B");
    expect(result.category).toBe("personal");
  });

  it("returns null for unrecognized text", () => {
    const result = matchDocumentType("Random text with no keywords");
    expect(result.category).toBeNull();
    expect(result.type).toBeNull();
  });

  it("returns null for empty text", () => {
    const result = matchDocumentType("");
    expect(result.category).toBeNull();
  });

  it("is case-insensitive", () => {
    const result = matchDocumentType("polita rca");
    expect(result.category).toBe("vehicule");
  });

  it("matches subtypes from CATEGORIES (e.g. Curent electric)", () => {
    const result = matchDocumentType("Factura curent electric luna martie");
    expect(result.category).toBe("casa");
    expect(result.type).toBe("Curent electric");
  });

  it("prefers longer keyword matches", () => {
    // "Asigurare CMR" should match before just "Asigurare"
    const result = matchDocumentType("ASIGURARE CMR TRANSPORT");
    expect(result.type).toBe("Asigurare CMR");
  });
});

// ─── extractTitle ───────────────────────────────────────

describe("extractTitle", () => {
  it("returns line containing detected type", () => {
    const text = "Header\nPolița RCA Nr 12345\nAlte detalii";
    const result = extractTitle(text, "RCA");
    expect(result).toBe("Polița RCA Nr 12345");
  });

  it("returns first substantial line when no type detected", () => {
    const text = "123\nSC EXAMPLE SRL\nBucuresti";
    const result = extractTitle(text, null);
    expect(result).toBe("SC EXAMPLE SRL");
  });

  it("returns detected type when no lines match", () => {
    const text = "ab\ncd";
    const result = extractTitle(text, "RCA");
    expect(result).toBe("RCA");
  });

  it("returns null for empty text and no type", () => {
    expect(extractTitle("", null)).toBeNull();
  });

  it("skips lines that are just numbers", () => {
    const text = "12345\n67890\nActual Title Here";
    const result = extractTitle(text, null);
    expect(result).toBe("Actual Title Here");
  });

  it("skips very short lines", () => {
    const text = "ab\ncd\nA Real Document Title";
    const result = extractTitle(text, null);
    expect(result).toBe("A Real Document Title");
  });

  it("skips lines longer than 80 chars", () => {
    const longLine = "A".repeat(81);
    const text = `${longLine}\nNormal Title`;
    const result = extractTitle(text, null);
    expect(result).toBe("Normal Title");
  });
});
