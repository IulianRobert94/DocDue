/**
 * Tests for search matching — the way people actually type in Romanian.
 */

import { matchesSearch } from "../core/search";
import type { RawDocument } from "../core/constants";

const doc = (over: Partial<RawDocument> = {}): RawDocument => ({
  id: "1", cat: "vehicule", type: "Rovignetă", title: "Rovignetă Logan", asset: "B-99-ABC",
  due: "2026-12-01", amt: 28, rec: "annual", ...over,
});

describe("matchesSearch", () => {
  it("a spelling variant without diacritics finds it: 'rovinieta' → Rovignetă", () => {
    expect(matchesSearch(doc({ title: "Vinietă" }), "rovinieta")).toBe(true);
  });

  it("everyday words find the type: 'buletin' → an ID card", () => {
    expect(matchesSearch(doc({ cat: "personal", type: "Carte de identitate", title: "CI Andrei", asset: undefined }), "buletin")).toBe(true);
  });

  it("several words in any order: 'dacia rca' → 'RCA — Dacia Duster'", () => {
    expect(matchesSearch(doc({ type: "RCA", title: "RCA — Dacia Duster" }), "dacia rca")).toBe(true);
  });

  it.each(["b99abc", "B 99 ABC", "99"])("a plate typed as '%s' is found", (query) => {
    expect(matchesSearch(doc(), query)).toBe(true);
  });

  it("English type names work too: 'passport'", () => {
    expect(matchesSearch(doc({ cat: "personal", type: "Pașaport", title: "Pașaport Ana", asset: undefined }), "passport")).toBe(true);
  });

  it("notes are searched", () => {
    expect(matchesSearch(doc({ notes: "Polița de la Groupama" }), "groupama")).toBe(true);
  });

  it("every word has to match: 'rca bmw' doesn't find the Dacia", () => {
    expect(matchesSearch(doc({ type: "RCA", title: "RCA — Dacia Duster" }), "rca bmw")).toBe(false);
  });

  it("an empty query matches everything", () => {
    expect(matchesSearch(doc(), "   ")).toBe(true);
  });
});
