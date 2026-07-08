export type ThemeMode = "light" | "dark";

export const semanticBrandingColorKeys = [
  "brandColor",
  "primaryBackgroundColor",
  "primaryForegroundColor",
  "backgroundColor",
  "surfaceColor",
  "surfaceRaisedColor",
  "inputBackgroundColor",
  "inputBorderColor",
  "inputFocusColor",
  "borderColor",
  "textColor",
  "textSecondaryColor",
  "textMutedColor",
  "iconBackgroundColor",
  "iconForegroundColor",
  "selectionBackgroundColor",
  "selectionBorderColor",
  "selectionForegroundColor",
  "authorizeButtonColor",
  "authorizeButtonForegroundColor",
  "warningColor",
  "dangerColor",
] as const;

export type SemanticBrandingColorKey = (typeof semanticBrandingColorKeys)[number];

export const legacyBrandingColorKeys = [
  "backgroundGradientStart",
  "backgroundGradientEnd",
  "backgroundAngle",
  "primary",
  "primaryHover",
  "primaryLight",
  "primaryDark",
  "secondary",
  "secondaryHover",
  "success",
  "error",
  "warning",
  "info",
  "text",
  "textSecondary",
  "textMuted",
  "border",
  "cardBackground",
  "cardShadow",
  "inputBackground",
  "inputBorder",
  "inputFocus",
] as const;

export type LegacyBrandingColorKey = (typeof legacyBrandingColorKeys)[number];
export type BrandingColorKey = SemanticBrandingColorKey | LegacyBrandingColorKey;
export type BrandingColors = Record<string, string>;

export const defaultLightSemanticBrandingColors: Record<SemanticBrandingColorKey, string> = {
  brandColor: "#6600cc",
  primaryBackgroundColor: "#6600cc",
  primaryForegroundColor: "#ffffff",
  backgroundColor: "#f3f4f6",
  surfaceColor: "#ffffff",
  surfaceRaisedColor: "#f8fafc",
  inputBackgroundColor: "#ffffff",
  inputBorderColor: "#cbd5e1",
  inputFocusColor: "#6600cc",
  borderColor: "#e2e8f0",
  textColor: "#111827",
  textSecondaryColor: "#334155",
  textMutedColor: "#475569",
  iconBackgroundColor: "#f8fafc",
  iconForegroundColor: "#6600cc",
  selectionBackgroundColor: "#f3f4f6",
  selectionBorderColor: "#6600cc",
  selectionForegroundColor: "#111827",
  authorizeButtonColor: "#16a34a",
  authorizeButtonForegroundColor: "#ffffff",
  warningColor: "#d97706",
  dangerColor: "#dc2626",
};

export const defaultDarkSemanticBrandingColors: Record<SemanticBrandingColorKey, string> = {
  brandColor: "#aec1e0",
  primaryBackgroundColor: "#c5d3e8",
  primaryForegroundColor: "#1f2937",
  backgroundColor: "#0f172a",
  surfaceColor: "#111827",
  surfaceRaisedColor: "#1f2937",
  inputBackgroundColor: "#0f172a",
  inputBorderColor: "#475569",
  inputFocusColor: "#c5d3e8",
  borderColor: "#334155",
  textColor: "#f8fafc",
  textSecondaryColor: "#e2e8f0",
  textMutedColor: "#cbd5e1",
  iconBackgroundColor: "#1f2937",
  iconForegroundColor: "#aec1e0",
  selectionBackgroundColor: "#475569",
  selectionBorderColor: "#c5d3e8",
  selectionForegroundColor: "#ffffff",
  authorizeButtonColor: "#22c55e",
  authorizeButtonForegroundColor: "#111827",
  warningColor: "#d97706",
  dangerColor: "#dc2626",
};

export const defaultLightLegacyBrandingColors: Record<LegacyBrandingColorKey, string> = {
  backgroundGradientStart: "#f3f4f6",
  backgroundGradientEnd: "#eff6ff",
  backgroundAngle: "135deg",
  primary: "#6600cc",
  primaryHover: "#2563eb",
  primaryLight: "#dbeafe",
  primaryDark: "#1d4ed8",
  secondary: "#6b7280",
  secondaryHover: "#4b5563",
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#6600cc",
  text: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  border: "#e5e7eb",
  cardBackground: "#ffffff",
  cardShadow: "rgba(0,0,0,0.1)",
  inputBackground: "#ffffff",
  inputBorder: "#d1d5db",
  inputFocus: "#6600cc",
};

export const defaultDarkLegacyBrandingColors: Record<LegacyBrandingColorKey, string> = {
  backgroundGradientStart: "#1f2937",
  backgroundGradientEnd: "#111827",
  backgroundAngle: "135deg",
  primary: "#aec1e0",
  primaryHover: "#9eb3d6",
  primaryLight: "#374151",
  primaryDark: "#c5d3e8",
  secondary: "#9ca3af",
  secondaryHover: "#d1d5db",
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#aec1e0",
  text: "#f9fafb",
  textSecondary: "#d1d5db",
  textMuted: "#9ca3af",
  border: "#374151",
  cardBackground: "#1f2937",
  cardShadow: "rgba(0,0,0,0.3)",
  inputBackground: "#111827",
  inputBorder: "#4b5563",
  inputFocus: "#aec1e0",
};

export const defaultLightBrandingColors: Record<BrandingColorKey, string> = {
  ...defaultLightLegacyBrandingColors,
  ...defaultLightSemanticBrandingColors,
};

export const defaultDarkBrandingColors: Record<BrandingColorKey, string> = {
  ...defaultDarkLegacyBrandingColors,
  ...defaultDarkSemanticBrandingColors,
};

export function getSemanticBrandingColorDefaults(mode: ThemeMode) {
  return mode === "dark" ? defaultDarkSemanticBrandingColors : defaultLightSemanticBrandingColors;
}

export function getBrandingColorDefaults(mode: ThemeMode) {
  return mode === "dark" ? defaultDarkBrandingColors : defaultLightBrandingColors;
}

export function normalizeBrandingColors(colors: BrandingColors | undefined, mode: ThemeMode) {
  return { ...getSemanticBrandingColorDefaults(mode), ...(colors || {}) };
}

export function copyKnownBrandingColorsForMode(
  source: BrandingColors,
  target: BrandingColors,
  sourceMode: ThemeMode,
  targetMode: ThemeMode
) {
  const sourceDefaults = getSemanticBrandingColorDefaults(sourceMode);
  const targetDefaults = getSemanticBrandingColorDefaults(targetMode);
  const next = { ...target };
  for (const key of semanticBrandingColorKeys) {
    const sourceValue = source[key];
    next[key] =
      sourceValue === undefined || sourceValue === sourceDefaults[key]
        ? targetDefaults[key]
        : sourceValue;
  }
  return next;
}

export function expandHexColor(value: string) {
  const trimmed = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    return trimmed
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  return trimmed;
}

export function parseHexColor(value: string) {
  const hex = expandHexColor(value);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16) / 255,
    g: Number.parseInt(hex.slice(2, 4), 16) / 255,
    b: Number.parseInt(hex.slice(4, 6), 16) / 255,
  };
}

export function isHexBrandingColor(value: string) {
  return parseHexColor(value) !== null;
}

export function parseCssColor(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim();
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1] || "";
    if (!raw) return null;
    const expanded =
      raw.length === 3
        ? raw
            .split("")
            .map((part) => part + part)
            .join("")
        : raw;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (!rgb) return null;
  const r = rgb[1] || "";
  const g = rgb[2] || "";
  const b = rgb[3] || "";
  if (!r || !g || !b) return null;
  return {
    r: Math.min(255, Number.parseInt(r, 10)),
    g: Math.min(255, Number.parseInt(g, 10)),
    b: Math.min(255, Number.parseInt(b, 10)),
  };
}

export function channelLuminance(value: number): number {
  const normalized = value / 255;
  if (normalized <= 0.03928) return normalized / 12.92;
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: { r: number; g: number; b: number }): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

export function colorContrast(foreground: string, background: string): number | null {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return null;
  const fgLum = relativeLuminance(fg);
  const bgLum = relativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableTextColor(foreground: string, background: string, fallback: string): string {
  const ratio = colorContrast(foreground, background);
  if (ratio !== null && ratio < 4.5) return fallback;
  return foreground;
}

export function bestTextColor(background: string): string {
  const dark = "#111827";
  const light = "#ffffff";
  const darkRatio = colorContrast(dark, background) || 0;
  const lightRatio = colorContrast(light, background) || 0;
  return darkRatio >= lightRatio ? dark : light;
}
