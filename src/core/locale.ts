/**
 * DocDue — Device locale defaults
 *
 * Picks the first-launch language and currency from the phone's locale, so a
 * user outside Romania isn't greeted in Romanian with prices in lei.
 * Romanian stays the fallback (Romania-first app). Saved settings always win.
 */

import type { CurrencyCode, LanguageCode } from "./constants";

/** Countries/territories whose currency is the euro (2026, incl. Bulgaria). */
const EURO_REGIONS = new Set([
  "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
  "AD", "MC", "SM", "VA", "ME", "XK",
]);

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "";
  } catch {
    return "";
  }
}

/**
 * Language + currency for a BCP-47 locale such as "ro-RO", "de-DE" or
 * "sr-Latn-RS". Defaults to the phone's locale.
 */
export function detectDeviceDefaults(locale: string = deviceLocale()): { language: LanguageCode; currency: CurrencyCode } {
  const parts = locale.replace(/_/g, "-").split("-").filter(Boolean);
  const lang = (parts[0] || "").toLowerCase();
  const region = parts.slice(1).reverse().find((p) => /^[A-Za-z]{2}$/.test(p))?.toUpperCase();

  if (!lang || lang === "ro") return { language: "ro", currency: "RON" };
  // An English phone set to Romania (common in the main market) still pays in lei
  if (region === "RO") return { language: "en", currency: "RON" };
  return { language: "en", currency: region && EURO_REGIONS.has(region) ? "EUR" : "USD" };
}
