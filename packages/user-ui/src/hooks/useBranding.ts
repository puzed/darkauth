import { bestTextColor, readableTextColor } from "@DarkAuth/branding";
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
  surfaceColor: ["--da-card-bg", "--da-color-surface"],
  surfaceRaisedColor: ["--da-color-surface-raised"],
  inputBackgroundColor: ["--da-input-bg", "--da-color-input-bg"],
  inputBorderColor: ["--da-color-input-border"],
  inputFocusColor: ["--da-color-input-focus"],
  borderColor: ["--da-border", "--da-color-border"],
  iconBackgroundColor: ["--da-color-icon-bg"],
  iconForegroundColor: ["--da-color-icon-text"],
  selectionBackgroundColor: ["--da-color-selection-bg"],
  selectionBorderColor: ["--da-color-selection-border"],
  selectionForegroundColor: ["--da-color-selection-text"],
  authorizeButtonColor: ["--da-color-success"],
  authorizeButtonForegroundColor: ["--da-color-success-text"],
  warningColor: ["--da-color-warning"],
  dangerColor: ["--da-color-danger"],
};

function isUsableCssColor(value: string | undefined) {
  if (!value) return false;
  return typeof CSS === "undefined" || CSS.supports("color", value);
}

function clearInlineBranding() {
  const root = document.documentElement;
  const vars = new Set(Object.values(colorMap).flat());
  for (const v of vars) root.style.removeProperty(v);
  root.style.removeProperty("--da-input-bg");
  root.style.removeProperty("--da-color-input-bg");
  root.style.removeProperty("--da-color-input-border");
  root.style.removeProperty("--da-color-input-focus");
  root.style.removeProperty("--da-card-bg");
  root.style.removeProperty("--da-page-bg");
  root.style.removeProperty("--da-color-surface");
  root.style.removeProperty("--da-color-surface-raised");
  root.style.removeProperty("--da-color-surface-muted");
  root.style.removeProperty("--da-color-text-secondary");
  root.style.removeProperty("--da-color-text-muted");
  root.style.removeProperty("--da-text");
  root.style.removeProperty("--da-text-secondary");
  root.style.removeProperty("--da-text-muted");
  root.style.removeProperty("--da-border");
  root.style.removeProperty("--da-color-border");
  root.style.removeProperty("--da-color-success");
  root.style.removeProperty("--da-color-success-text");
  root.style.removeProperty("--da-color-warning");
  root.style.removeProperty("--da-color-danger");
  root.style.removeProperty("--da-color-icon-bg");
  root.style.removeProperty("--da-color-icon-text");
  root.style.removeProperty("--da-color-selection-bg");
  root.style.removeProperty("--da-color-selection-border");
  root.style.removeProperty("--da-color-selection-text");
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
  const colorValue = (key: string) => {
    const value = activeColors[key];
    return isUsableCssColor(value) ? value : undefined;
  };

  if (!Object.keys(activeColors).length) return;
  if (isDark) {
    root.style.removeProperty("--da-input-bg");
    root.style.removeProperty("--da-color-input-bg");
    root.style.removeProperty("--da-color-input-border");
    root.style.removeProperty("--da-color-input-focus");
    root.style.removeProperty("--da-card-bg");
  }
  Object.entries(colorMap).forEach(([brandingKey, cssVars]) => {
    const value = colorValue(brandingKey);
    if (!value) return;
    cssVars.forEach((cssVar) => {
      root.style.setProperty(cssVar, value);
    });
  });

  const brandColor = colorValue("brandColor");
  if (brandColor) {
    root.style.setProperty("--da-primary", brandColor);
    root.style.setProperty("--primary-500", brandColor);
    root.style.setProperty("--da-color-brand", brandColor);
  }

  const primaryBackground = colorValue("primaryBackgroundColor");
  if (primaryBackground) {
    root.style.setProperty("--primary-600", primaryBackground);
    root.style.setProperty("--primary-700", primaryBackground);
    root.style.setProperty("--da-color-action", primaryBackground);
    root.style.setProperty("--da-focus-ring", primaryBackground);
  }

  const primaryForeground = colorValue("primaryForegroundColor");
  if (primaryBackground) {
    const actionText = readableTextColor(
      primaryForeground || (isDark ? "#111827" : "#ffffff"),
      primaryBackground,
      bestTextColor(primaryBackground)
    );
    root.style.setProperty("--primary-button-text", actionText);
    root.style.setProperty("--da-color-action-text", actionText);
  } else if (primaryForeground) {
    root.style.setProperty("--primary-button-text", primaryForeground);
    root.style.setProperty("--da-color-action-text", primaryForeground);
  }

  const textColor = colorValue("textColor");
  if (textColor) {
    root.style.setProperty("--gray-900", textColor);
    root.style.setProperty("--da-color-text", textColor);
    root.style.setProperty("--da-text", textColor);
  }

  const pageBackground = colorValue("backgroundColor");
  if (pageBackground) {
    root.style.setProperty("--da-page-bg", pageBackground);
    root.style.setProperty("--da-color-page", pageBackground);
    document.body.style.background = pageBackground;
  }

  const surfaceColor =
    colorValue("surfaceColor") || colorValue("cardBackground") || (isDark ? "#111827" : "#ffffff");
  const surfaceRaisedColor =
    colorValue("surfaceRaisedColor") ||
    colorValue("surfaceRaised") ||
    colorValue("inputBackgroundColor") ||
    colorValue("inputBackground") ||
    (isDark ? "#1f2937" : "#f8fafc");
  const inputBackground =
    colorValue("inputBackgroundColor") || colorValue("inputBackground") || surfaceRaisedColor;
  const borderColor =
    colorValue("borderColor") || colorValue("border") || (isDark ? "#334155" : "#e2e8f0");
  const inputBorder = colorValue("inputBorderColor") || colorValue("inputBorder") || borderColor;
  const inputFocus =
    colorValue("inputFocusColor") ||
    colorValue("inputFocus") ||
    colorValue("primaryBackgroundColor") ||
    colorValue("brandColor") ||
    (isDark ? "#c5d3e8" : "#6600cc");
  const secondaryFallback = isDark ? "#e2e8f0" : "#334155";
  const mutedFallback = isDark ? "#cbd5e1" : "#475569";
  const bodyText = colorValue("textColor") || (isDark ? "#f8fafc" : "#111827");
  const secondaryColor = readableTextColor(
    colorValue("textSecondaryColor") || secondaryFallback,
    surfaceColor,
    secondaryFallback
  );
  const mutedColor = readableTextColor(
    colorValue("textMutedColor") || mutedFallback,
    surfaceColor,
    mutedFallback
  );

  root.style.setProperty("--da-color-surface", surfaceColor);
  root.style.setProperty("--da-card-bg", surfaceColor);
  root.style.setProperty("--da-color-surface-raised", surfaceRaisedColor);
  root.style.setProperty("--da-input-bg", inputBackground);
  root.style.setProperty("--da-color-input-bg", inputBackground);
  root.style.setProperty("--da-color-input-border", inputBorder);
  root.style.setProperty("--da-color-input-focus", inputFocus);
  root.style.setProperty("--da-color-text-secondary", secondaryColor);
  root.style.setProperty("--da-color-text-muted", mutedColor);
  root.style.setProperty("--da-text-secondary", secondaryColor);
  root.style.setProperty("--da-text-muted", mutedColor);
  root.style.setProperty("--gray-700", secondaryColor);
  root.style.setProperty("--gray-600", secondaryColor);
  root.style.setProperty("--gray-500", mutedColor);
  root.style.setProperty("--da-border", borderColor);
  root.style.setProperty("--da-color-border", borderColor);

  const iconBackground = colorValue("iconBackgroundColor") || surfaceRaisedColor;
  const iconForeground = readableTextColor(
    colorValue("iconForegroundColor") ||
      colorValue("brandColor") ||
      colorValue("primaryBackgroundColor") ||
      bodyText,
    iconBackground,
    bestTextColor(iconBackground)
  );
  root.style.setProperty("--da-color-icon-bg", iconBackground);
  root.style.setProperty("--da-color-icon-text", iconForeground);

  const selectionBackground =
    colorValue("selectionBackgroundColor") || (isDark ? "#475569" : "#f3f4f6");
  const selectionBorder =
    colorValue("selectionBorderColor") ||
    colorValue("primaryBackgroundColor") ||
    colorValue("brandColor") ||
    (isDark ? "#c5d3e8" : "#6600cc");
  const selectionText = readableTextColor(
    colorValue("selectionForegroundColor") || bodyText,
    selectionBackground,
    bestTextColor(selectionBackground)
  );
  root.style.setProperty("--da-color-selection-bg", selectionBackground);
  root.style.setProperty("--da-color-selection-border", selectionBorder);
  root.style.setProperty("--da-color-selection-text", selectionText);

  const successColor =
    colorValue("authorizeButtonColor") ||
    colorValue("successColor") ||
    (isDark ? "#22c55e" : "#16a34a");
  const successText = readableTextColor(
    colorValue("authorizeButtonForegroundColor") ||
      colorValue("successForegroundColor") ||
      "#ffffff",
    successColor,
    bestTextColor(successColor)
  );
  root.style.setProperty("--da-color-success", successColor);
  root.style.setProperty("--da-color-success-text", successText);
  root.style.setProperty("--da-color-warning", colorValue("warningColor") || "#d97706");
  root.style.setProperty("--da-color-danger", colorValue("dangerColor") || "#dc2626");
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
