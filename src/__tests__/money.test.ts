/**
 * Tests for amounts in several currencies: each document can have its own,
 * and totals are shown per currency — never added together.
 */

import { docCurrency, formatTotals, sumByCurrency } from "../core/money";

describe("docCurrency", () => {
  it("uses the document's own currency", () => {
    expect(docCurrency({ currency: "EUR" }, "RON")).toBe("EUR");
  });

  it("falls back to the app currency (older documents have none)", () => {
    expect(docCurrency({}, "RON")).toBe("RON");
  });

  it("ignores a currency it doesn't know (a damaged backup)", () => {
    expect(docCurrency({ currency: "XYZ" as never }, "RON")).toBe("RON");
  });
});

describe("sumByCurrency + formatTotals", () => {
  it("adds up per currency and lists them, lei first", () => {
    const totals = sumByCurrency([
      { amt: 400, currency: "EUR" }, { amt: 845, currency: undefined }, { amt: 2605, currency: "RON" }, { amt: null, currency: "USD" },
    ], "RON");
    expect(totals).toEqual({ RON: 3450, EUR: 400 });
    expect(formatTotals(totals, "ro")).toBe("3.450 lei · 400 €");
  });

  it("nothing to add up → empty text", () => {
    expect(formatTotals(sumByCurrency([], "RON"), "ro")).toBe("");
  });
});
