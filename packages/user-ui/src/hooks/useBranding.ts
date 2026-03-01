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
      features?: { selfRegistrationEnabled?: boolean };
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
  brandColor: ["--da-primary", "--primary-500"],
  primaryBackgroundColor: ["--primary-600", "--primary-700"],
  primaryForegroundColor: ["--primary-button-text"],
  backgroundColor: ["--da-page-bg"],
  textColor: ["--gray-900", "--gray-700", "--gray-600"],
};

function clearInlineBranding() {
  const root = document.documentElement;
  const vars = new Set(Object.values(colorMap).flat());
  for (const v of vars) root.style.removeProperty(v);
  root.style.removeProperty("--da-input-bg");
  root.style.removeProperty("--da-card-bg");
  root.style.removeProperty("--da-page-bg");
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
  }

  const primaryBackground = activeColors.primaryBackgroundColor;
  if (primaryBackground) {
    root.style.setProperty("--primary-600", primaryBackground);
    root.style.setProperty("--primary-700", primaryBackground);
  }

  const primaryForeground = activeColors.primaryForegroundColor;
  if (primaryForeground) {
    root.style.setProperty("--primary-button-text", primaryForeground);
  }

  const textColor = activeColors.textColor;
  if (textColor) {
    root.style.setProperty("--gray-900", textColor);
    root.style.setProperty("--gray-700", textColor);
    root.style.setProperty("--gray-600", textColor);
  }

  const pageBackground = activeColors.backgroundColor;
  if (pageBackground) {
    root.style.setProperty("--da-page-bg", pageBackground);
    document.body.style.background = pageBackground;
  }
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

      // Set title
      if (b.identity?.title) document.title = b.identity.title;

      // Apply favicon based on theme
      const theme = document.documentElement.getAttribute("data-da-theme");
      const isDark = theme === "dark";
      const faviconUrl = isDark
        ? b.faviconUrlDark || "/favicon.svg"
        : b.faviconUrl || "/favicon.svg";
      if (faviconUrl) updateFavicon(faviconUrl);

      // Apply colors for current theme
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
