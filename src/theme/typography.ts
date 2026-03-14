/**
 * DocDue — Typography System (Inter)
 *
 * Maps font weights to explicit Inter font families.
 * React Native requires fontFamily per weight (no CSS shorthand).
 */

export const fonts = {
  regular:    "Inter_400Regular",
  medium:     "Inter_500Medium",
  semiBold:   "Inter_600SemiBold",
  bold:       "Inter_700Bold",
  extraBold:  "Inter_800ExtraBold",
} as const;

/** Get the correct Inter fontFamily for a given weight */
export function fontFamily(weight: "400" | "500" | "600" | "700" | "800"): string {
  switch (weight) {
    case "400": return fonts.regular;
    case "500": return fonts.medium;
    case "600": return fonts.semiBold;
    case "700": return fonts.bold;
    case "800": return fonts.extraBold;
  }
}
