import { useEffect, useState } from "react";

type BrandingFont = { family?: string; size?: string; weight?: Record<string, string> };
type BrandingConfig = {
  identity?: { title?: string; tagline?: string };
  colors?: Record<string, string>;
  colorsDark?: Record<string, string>;
  wording?: Record<string, string>;
  font?: BrandingFont;
  customCSS?: string;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  faviconUrl?: string | null;
  faviconUrlDark?: string | null;
  customCssUrl?: string | null;
};

declare global {
  interface Window {
    __APP_CONFIG__?: {
      branding?: BrandingConfig;
      features?: {
        selfRegistrationEnabled?: boolean;
        passwordResetEnabled?: boolean;
        passwordResetLoginLinkEnabled?: boolean;
        passwordResetLoginLinkVisible?: boolean;
      };
    };
  }
}

function updateFavicon(url: string) {
  const links = document.querySelectorAll("link[rel*='icon']");
  links.forEach((l) => {
    l.parentElement?.removeChild(l);
  });
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = url;
  document.head.appendChild(link);
}

function applyCustomCSS(css: string) {
  const existing = document.getElementById("da-custom-css");
  if (existing) existing.parentElement?.removeChild(existing);

  if (css?.trim()) {
    const style = document.createElement("style");
    style.id = "da-custom-css";
    style.textContent = css;
    document.head.appendChild(style);
  }
}

function applyBrandingStylesheet(url: string | null | undefined) {
  const existing = document.getElementById("da-branding-css");
  if (!url) {
    if (existing) existing.parentElement?.removeChild(existing);
    return;
  }
  if (!existing) {
    const link = document.createElement("link");
    link.id = "da-branding-css";
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
    return;
  }
  const link = existing as HTMLLinkElement;
  if (link.href !== url) link.href = url;
}

const colorMap: Record<string, string[]> = {
  brandColor: ["--da-primary", "--primary-500", "--da-color-brand"],
  primaryBackgroundColor: [
    "--primary-600",
    "--primary-700",
    "--da-color-action",
    "--da-focus-ring",
  ],
  primaryForegroundColor: ["--primary-button-text", "--da-color-action-text"],
  backgroundColor: ["--da-page-bg", "--da-color-page"],
  textColor: ["--gray-900", "--da-color-text", "--da-text"],
  textSecondaryColor: [
    "--gray-700",
    "--gray-600",
    "--da-color-text-secondary",
    "--da-text-secondary",
  ],
  textMutedColor: ["--gray-500", "--da-color-text-muted", "--da-text-muted"],
};

function parseCssColor(value: string): { r: number; g: number; b: number } | null {
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

function channelLuminance(value: number): number {
  const normalized = value / 255;
  if (normalized <= 0.03928) return normalized / 12.92;
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

function colorContrast(foreground: string, background: string): number | null {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return null;
  const fgLum = relativeLuminance(fg);
  const bgLum = relativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableTextColor(foreground: string, background: string, fallback: string): string {
  const ratio = colorContrast(foreground, background);
  if (ratio !== null && ratio < 4.5) return fallback;
  return foreground;
}

function clearInlineBranding() {
  const root = document.documentElement;
  const vars = new Set(Object.values(colorMap).flat());
  for (const v of vars) root.style.removeProperty(v);
  root.style.removeProperty("--da-input-bg");
  root.style.removeProperty("--da-card-bg");
  root.style.removeProperty("--da-page-bg");
  root.style.removeProperty("--da-color-surface");
  root.style.removeProperty("--da-color-surface-raised");
  root.style.removeProperty("--da-color-text-secondary");
  root.style.removeProperty("--da-color-text-muted");
  root.style.removeProperty("--da-text");
  root.style.removeProperty("--da-text-secondary");
  root.style.removeProperty("--da-text-muted");
  root.style.removeProperty("--da-color-border");
  root.style.removeProperty("--da-color-success");
  root.style.removeProperty("--da-color-warning");
  root.style.removeProperty("--da-color-danger");
  document.body.style.removeProperty("background");
}

function applyColorVariables(
  colors: Record<string, string> | undefined,
  colorsDark: Record<string, string> | undefined
) {
  const root = document.documentElement;
  const theme = root.getAttribute("data-da-theme");
  const isDark = theme === "dark";
  const lightColors = colors || {};
  const darkColors = colorsDark || {};
  const activeColors = isDark ? darkColors : lightColors;

  if (!Object.keys(activeColors).length) return;
  if (isDark) {
    root.style.removeProperty("--da-input-bg");
    root.style.removeProperty("--da-card-bg");
  }
  Object.entries(colorMap).forEach(([brandingKey, cssVars]) => {
    if (!activeColors[brandingKey]) return;
    cssVars.forEach((cssVar) => {
      root.style.setProperty(cssVar, activeColors[brandingKey]);
    });
  });

  const brandColor = activeColors.brandColor;
  if (brandColor) {
    root.style.setProperty("--da-primary", brandColor);
    root.style.setProperty("--primary-500", brandColor);
    root.style.setProperty("--da-color-brand", brandColor);
  }

  const primaryBackground = activeColors.primaryBackgroundColor;
  if (primaryBackground) {
    root.style.setProperty("--primary-600", primaryBackground);
    root.style.setProperty("--primary-700", primaryBackground);
    root.style.setProperty("--da-color-action", primaryBackground);
    root.style.setProperty("--da-focus-ring", primaryBackground);
  }

  const primaryForeground = activeColors.primaryForegroundColor;
  if (primaryForeground) {
    root.style.setProperty("--primary-button-text", primaryForeground);
    root.style.setProperty("--da-color-action-text", primaryForeground);
  }

  const textColor = activeColors.textColor;
  if (textColor) {
    root.style.setProperty("--gray-900", textColor);
    root.style.setProperty("--da-color-text", textColor);
    root.style.setProperty("--da-text", textColor);
  }

  const pageBackground = activeColors.backgroundColor;
  if (pageBackground) {
    root.style.setProperty("--da-page-bg", pageBackground);
    root.style.setProperty("--da-color-page", pageBackground);
    document.body.style.background = pageBackground;
  }

  const surfaceColor = activeColors.cardBackground || (isDark ? "#111827" : "#ffffff");
  const surfaceRaisedColor = activeColors.surfaceRaised || (isDark ? "#1f2937" : "#f8fafc");
  const secondaryFallback = isDark ? "#e2e8f0" : "#334155";
  const mutedFallback = isDark ? "#cbd5e1" : "#475569";
  const secondaryColor = readableTextColor(
    activeColors.textSecondaryColor || secondaryFallback,
    surfaceColor,
    secondaryFallback
  );
  const mutedColor = readableTextColor(
    activeColors.textMutedColor || mutedFallback,
    surfaceColor,
    mutedFallback
  );

  root.style.setProperty("--da-color-surface", surfaceColor);
  root.style.setProperty("--da-color-surface-raised", surfaceRaisedColor);
  root.style.setProperty("--da-color-text-secondary", secondaryColor);
  root.style.setProperty("--da-color-text-muted", mutedColor);
  root.style.setProperty("--da-text-secondary", secondaryColor);
  root.style.setProperty("--da-text-muted", mutedColor);
  root.style.setProperty("--gray-700", secondaryColor);
  root.style.setProperty("--gray-600", secondaryColor);
  root.style.setProperty("--gray-500", mutedColor);
  root.style.setProperty("--da-color-border", isDark ? "#334155" : "#e2e8f0");
  root.style.setProperty("--da-color-success", "#16a34a");
  root.style.setProperty("--da-color-warning", "#d97706");
  root.style.setProperty("--da-color-danger", "#dc2626");
}

function applyTypography(font: BrandingFont | undefined) {
  if (!font) return;

  const root = document.documentElement;
  if (font.family) root.style.setProperty("--font-sans", font.family);
  if (font.size) {
    document.body.style.fontSize = font.size;
  }
}

export function useBranding() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const applyFromConfig = () => {
      const cfg = window.__APP_CONFIG__;
      const b = cfg?.branding;
      if (!b) return;

      if (b.identity?.title) document.title = b.identity.title;

      const theme = document.documentElement.getAttribute("data-da-theme");
      const isDark = theme === "dark";
      const faviconUrl = isDark
        ? b.faviconUrlDark || "/favicon.svg"
        : b.faviconUrl || "/favicon.svg";
      if (faviconUrl) updateFavicon(faviconUrl);

      if (b.customCssUrl) {
        applyBrandingStylesheet(b.customCssUrl);
        clearInlineBranding();
      } else {
        applyBrandingStylesheet(null);
        applyColorVariables(b.colors, b.colorsDark);
        applyTypography(b.font);
        if (b.customCSS) applyCustomCSS(b.customCSS);
      }
    };

    applyFromConfig();
    setVersion((v) => v + 1);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-da-theme") {
          const cfg = window.__APP_CONFIG__;
          const b = cfg?.branding;
          if (!b) return;

          if (!b.customCssUrl) {
            applyColorVariables(b.colors, b.colorsDark);
          }

          const theme = document.documentElement.getAttribute("data-da-theme");
          const isDark = theme === "dark";
          const faviconUrl = isDark
            ? b.faviconUrlDark || "/favicon.svg"
            : b.faviconUrl || "/favicon.svg";
          if (faviconUrl) updateFavicon(faviconUrl);
          setVersion((v) => v + 1);
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-da-theme"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return {
    getText(key: string, fallback: string) {
      return window.__APP_CONFIG__?.branding?.wording?.[key] || fallback;
    },
    getLogoUrl() {
      const branding = window.__APP_CONFIG__?.branding;
      const theme = document.documentElement.getAttribute("data-da-theme");
      const isDark = theme === "dark";
      if (isDark) return branding?.logoUrlDark || "";
      return branding?.logoUrl || "";
    },
    isDefaultLogoUrl(url: string) {
      return url.startsWith("/api/branding/logo");
    },
    getTitle() {
      return window.__APP_CONFIG__?.branding?.identity?.title || "";
    },
    getTagline() {
      return window.__APP_CONFIG__?.branding?.identity?.tagline || "";
    },
  };
}
