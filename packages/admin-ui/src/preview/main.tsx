import React from "react";
import { createRoot } from "react-dom/client";
import "@DarkAuth/user-ui/src/App.css";
import "@DarkAuth/user-ui/src/index.css";
import { LoginView } from "@DarkAuth/user-ui/src/exports";

declare global {
  interface Window {
    __APP_CONFIG__?: { branding?: BrandingConfig };
  }
}

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

function parseOptions(): { branding?: Record<string, unknown>; theme?: "light" | "dark" } {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("options");
  if (!raw) return {};
  try {
    // Try base64url decode first
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) || {};
  } catch {
    try {
      // Fallback to plain JSON
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return {};
    }
  }
}

// Parse options and apply theme BEFORE React renders
const options = parseOptions();
const theme = options.theme || "light";
const branding = options.branding || {};

// Set theme attribute immediately
document.documentElement.setAttribute("data-da-theme", theme);

// Set app config immediately so useBranding hook sees it on first mount
window.__APP_CONFIG__ = {
  branding: {
    identity: branding.identity || {
      title: "DarkAuth",
      tagline: "Secure Zero-Knowledge Authentication",
    },
    colors: branding.colors || {},
    colorsDark: branding.colorsDark || {},
    wording: branding.wording || {},
    font: branding.font || {
      family: "system-ui, -apple-system, sans-serif",
      size: "16px",
      weight: { normal: "400", medium: "500", bold: "700" },
    },
    customCSS: branding.customCSS || "",
    logoUrl: branding.logoUrl || null,
    logoUrlDark: branding.logoUrlDark || null,
  },
};

// Apply initial CSS variables for correct first paint
const applyInitialColors = () => {
  const root = document.documentElement;
  const isDark = theme === "dark";
  const colors = branding.colors || {};
  const colorsDark = branding.colorsDark || {};
  const activeColors = isDark ? { ...colors, ...colorsDark } : colors;

  // Set critical CSS variables for first paint
  if (activeColors.primary) {
    root.style.setProperty("--primary-500", activeColors.primary);
    root.style.setProperty("--primary-600", activeColors.primary);
    root.style.setProperty("--primary-700", activeColors.primary);
  }

  // Set background
  if (activeColors.backgroundGradientStart) {
    document.body.style.background = activeColors.backgroundGradientStart;
  }
};

// Apply colors before React renders
applyInitialColors();

function App() {
  return <LoginView options={{ branding, theme }} />;
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
