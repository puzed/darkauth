type AdminBrandingConfig = {
  identity?: { title?: string; tagline?: string };
  colors?: Record<string, string>;
  colorsDark?: Record<string, string>;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  faviconUrl?: string | null;
  faviconUrlDark?: string | null;
  customCssUrl?: string | null;
};

declare global {
  interface Window {
    __APP_CONFIG__?: {
      branding?: AdminBrandingConfig;
    };
  }
}

const FALLBACK_TITLE = "DarkAuth";
const FALLBACK_LOGO_URL = "/favicon.svg";

function getBranding(): AdminBrandingConfig | undefined {
  return window.__APP_CONFIG__?.branding;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getThemeUrl(light: string | null | undefined, dark: string | null | undefined): string {
  return (isDarkMode() ? dark || light : light || dark) || FALLBACK_LOGO_URL;
}

function updateFavicon(url: string) {
  document.querySelectorAll("link[rel*='icon']").forEach((link) => {
    link.parentElement?.removeChild(link);
  });
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = url;
  document.head.appendChild(link);
}

export function getBrandTitle(): string {
  return getBranding()?.identity?.title || FALLBACK_TITLE;
}

export function getBrandLogoUrl(): string {
  const branding = getBranding();
  return getThemeUrl(branding?.logoUrl, branding?.logoUrlDark);
}

export function applyAdminBranding(): void {
  const branding = getBranding();
  document.title = `${getBrandTitle()} Admin`;
  updateFavicon(getThemeUrl(branding?.faviconUrl, branding?.faviconUrlDark));
  const existing = document.getElementById("da-admin-branding-css");
  if (branding?.customCssUrl) {
    if (existing instanceof HTMLLinkElement) {
      if (existing.href !== branding.customCssUrl) existing.href = branding.customCssUrl;
    } else {
      existing?.parentElement?.removeChild(existing);
      const link = document.createElement("link");
      link.id = "da-admin-branding-css";
      link.rel = "stylesheet";
      link.href = branding.customCssUrl;
      document.head.appendChild(link);
    }
  } else {
    existing?.parentElement?.removeChild(existing);
  }
}
