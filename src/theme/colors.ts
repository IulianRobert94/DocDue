/**
 * DocDue — Theme System (Dark Navy / Fintech)
 *
 * Revolut Business–inspired dark navy palette.
 * Single dark theme — no light mode.
 */

import type { ThemeMode } from "../core/constants";

export interface AppTheme {
  primary: string;
  primaryLight: string;
  primaryDim: string;
  background: string;
  card: string;
  cardBorder: string;
  surface: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  inputBackground: string;
  inputBorder: string;
  border: string;
  divider: string;
  overlay: string;
  inputFill: string;
  inputFillSubtle: string;
  inputFillStrong: string;
  barBackground: string;
  grabber: string;
}

/**
 * Dark Navy palette — always returns the dark fintech theme.
 * The `mode` parameter is kept for API compatibility but ignored.
 */
export function createTheme(_mode?: ThemeMode): AppTheme {
  return {
    primary:         "#0A79F1",
    primaryLight:    "#0A79F114",
    primaryDim:      "#0A79F108",
    background:      "#0A0E17",
    card:            "#141C2C",
    cardBorder:      "#1E2A3D",
    surface:         "#111827",
    text:            "#F0F2F5",
    textSecondary:   "#8E98AB",
    textMuted:       "#5A6478",
    textDim:         "#3D4756",
    inputBackground: "#141C2C",
    inputBorder:     "#1E2A3D",
    border:          "#1E2A3D",
    divider:         "#1C2638",
    overlay:         "rgba(5,10,20,0.75)",
    inputFill:       "rgba(20,40,70,0.5)",
    inputFillSubtle: "rgba(20,40,70,0.2)",
    inputFillStrong: "rgba(20,40,70,0.6)",
    barBackground:   "rgba(13,20,35,0.96)",
    grabber:         "rgba(30,50,80,0.4)",
  };
}
