import { useEffect } from "react";

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
};

declare global {
  interface Window {
    __APP_CONFIG__?: { branding?: BrandingConfig };
    __BRANDING_WORDING__?: Record<string, string>;
    __BRANDING_LOGO_LIGHT__?: string | null;
    __BRANDING_LOGO_DARK__?: string | null;
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

function applyColorVariables(
  colors: Record<string, string> | undefined,
  colorsDark: Record<string, string> | undefined
) {
  const root = document.documentElement;
  const theme = root.getAttribute("data-da-theme");
  const isDark = theme === "dark";

  // Merge colors correctly - dark mode should override light colors
  const baseColors = colors || {};
  const darkColors = colorsDark || {};
  const activeColors = isDark ? { ...baseColors, ...darkColors } : baseColors;

  // If no colors to apply, return
  if (!Object.keys(activeColors).length) return;

  // Map branding keys to CSS variables
  const colorMap: Record<string, string[]> = {
    primary: ["--primary-500", "--primary-600"],
    primaryHover: ["--primary-700"],
    primaryLight: ["--primary-100", "--primary-50"],
    text: ["--gray-900"],
    textSecondary: ["--gray-700", "--gray-600"],
    textMuted: ["--gray-600"],
    border: ["--gray-300"],
    cardBackground: ["--gray-50"],
    inputBackground: ["--gray-50"],
    inputBorder: ["--gray-300"],
    inputFocus: ["--primary-500"],
  };

  // Apply mapped CSS variables
  Object.entries(colorMap).forEach(([brandingKey, cssVars]) => {
    if (activeColors[brandingKey]) {
      cssVars.forEach((cssVar) => {
        root.style.setProperty(cssVar, activeColors[brandingKey]);
      });
    }
  });

  // Apply background using gradient when available
  const bgStart = activeColors.backgroundGradientStart;
  const bgEnd = activeColors.backgroundGradientEnd || bgStart;
  const bgAngle = activeColors.backgroundAngle || "135deg";
  if (bgStart) {
    if (bgEnd && bgEnd !== bgStart) {
      document.body.style.background = `linear-gradient(${bgAngle}, ${bgStart} 0%, ${bgEnd} 100%)`;
    } else {
      document.body.style.background = bgStart;
    }
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
      const faviconUrl = isDark && b.faviconUrlDark ? b.faviconUrlDark : b.faviconUrl || null;
      if (faviconUrl) updateFavicon(faviconUrl);

      // Apply colors for current theme
      applyColorVariables(b.colors, b.colorsDark);

      // Apply typography
      applyTypography(b.font);

      // Apply custom CSS
      if (b.customCSS) applyCustomCSS(b.customCSS);

      // Store wording and logos globally
      window.__BRANDING_WORDING__ = b.wording || {};
      window.__BRANDING_LOGO_LIGHT__ = b.logoUrl || null;
      window.__BRANDING_LOGO_DARK__ = b.logoUrlDark || null;
    };

    // Apply immediately on mount
    applyFromConfig();

    // Watch for theme changes and reapply colors
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-da-theme") {
          // Theme changed, reapply colors and favicon
          const cfg = window.__APP_CONFIG__;
          const b = cfg?.branding;
          if (!b) return;

          applyColorVariables(b.colors, b.colorsDark);

          const theme = document.documentElement.getAttribute("data-da-theme");
          const isDark = theme === "dark";
          const faviconUrl = isDark && b.faviconUrlDark ? b.faviconUrlDark : b.faviconUrl || null;
          if (faviconUrl) updateFavicon(faviconUrl);
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
      return window.__BRANDING_WORDING__?.[key] || fallback;
    },
    getLogoUrl() {
      const theme = document.documentElement.getAttribute("data-da-theme");
      const isDark = theme === "dark";

      if (isDark && window.__BRANDING_LOGO_DARK__) {
        return window.__BRANDING_LOGO_DARK__;
      }
      return window.__BRANDING_LOGO_LIGHT__ || "/favicon.svg";
    },
    getTitle() {
      return window.__APP_CONFIG__?.branding?.identity?.title || "DarkAuth";
    },
    getTagline() {
      return (
        window.__APP_CONFIG__?.branding?.identity?.tagline || "Secure Zero-Knowledge Authentication"
      );
    },
  };
}
