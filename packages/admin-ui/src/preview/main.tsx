import { LoginView } from "@DarkAuth/user-ui/src/exports";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@DarkAuth/user-ui/src/index.css";
import "@DarkAuth/user-ui/src/App.css";

type BrandingConfig = {
  identity?: { title?: string; tagline?: string };
  colors?: Record<string, string>;
  colorsDark?: Record<string, string>;
  wording?: Record<string, string>;
  font?: { family?: string; size?: string; weight?: Record<string, string>; url?: string | null };
  customCSS?: string;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  faviconUrl?: string | null;
  faviconUrlDark?: string | null;
  customCssUrl?: string | null;
};

type AppConfig = {
  issuer?: string;
  branding?: BrandingConfig;
};

type Overrides = {
  branding?: Partial<BrandingConfig>;
  theme?: "light" | "dark" | null;
  themeMode?: "inherit" | "light" | "dark" | null;
  defaultTheme?: "light" | "dark" | null;
} | null;

type ThemedWindow = Window & {
  __APP_CONFIG__?: AppConfig;
  __setDaTheme?: (theme: "light" | "dark") => void;
};

type ThemeMessage = { type: "da:theme"; theme: "light" | "dark" };
const isThemeMessage = (v: unknown): v is ThemeMessage => {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as { type?: unknown; theme?: unknown };
  return obj.type === "da:theme" && (obj.theme === "light" || obj.theme === "dark");
};

function parseOptions() {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("options");
  const issuer = url.searchParams.get("u");
  if (!raw) return { issuer, overrides: null } as const;
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    return { issuer, overrides: JSON.parse(json) } as const;
  } catch {
    try {
      return { issuer, overrides: JSON.parse(decodeURIComponent(raw)) } as const;
    } catch {
      return { issuer, overrides: null } as const;
    }
  }
}

function applyOverrides(overrides: Overrides, issuer: string | null) {
  if (!overrides) return;
  const w = window as ThemedWindow;
  const cfg: AppConfig = w.__APP_CONFIG__ || {};
  const branding: BrandingConfig = { ...(cfg.branding || {}), ...(overrides.branding || {}) };
  w.__APP_CONFIG__ = { ...cfg, branding };
  const stored = localStorage.getItem("daTheme");
  const hasStored = stored === "light" || stored === "dark";
  const mode =
    overrides.themeMode === "inherit" ||
    overrides.themeMode === "light" ||
    overrides.themeMode === "dark"
      ? overrides.themeMode
      : "inherit";
  const defaultTheme =
    overrides.defaultTheme === "dark" || overrides.defaultTheme === "light"
      ? overrides.defaultTheme
      : null;
  let followParent = !hasStored && mode === "inherit";
  const setAttr = (t: "light" | "dark") => {
    document.documentElement.setAttribute("data-da-theme", t);
  };
  if (followParent && defaultTheme) setAttr(defaultTheme);
  const originalSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = ((key: string, value: string) => {
    if (key === "daTheme" && (value === "light" || value === "dark")) followParent = false;
    return originalSet(key, value);
  }) as typeof localStorage.setItem;
  const orig = w.__setDaTheme;
  w.__setDaTheme = (t: "light" | "dark") => {
    followParent = false;
    if (orig) orig(t);
  };
  window.addEventListener("message", (e: MessageEvent) => {
    const d: unknown = e.data;
    if (!isThemeMessage(d)) return;
    if (followParent && (d.theme === "light" || d.theme === "dark")) setAttr(d.theme);
  });
  const theme = overrides.theme === "dark" || overrides.theme === "light" ? overrides.theme : null;
  if (theme && w.__setDaTheme) w.__setDaTheme(theme);
  if (issuer) {
    const id = "da-branding-css";
    const href = `${issuer.replace(/\/$/, "")}/api/branding/custom.css`;
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (!existing) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    } else if (existing.href !== href) {
      existing.href = href;
    }
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");
const root = createRoot(container);
const { issuer, overrides } = parseOptions();
applyOverrides(overrides, issuer);
root.render(
  <MemoryRouter>
    <LoginView />
  </MemoryRouter>
);
