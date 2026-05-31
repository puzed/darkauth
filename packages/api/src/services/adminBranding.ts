import { getDefaultLogoSvg } from "../http/routers/userRouter.ts";

export function getAdminBrandingConfig() {
  return {
    identity: {
      title: "DarkAuth",
      tagline: "Admin Portal",
    },
    colors: {
      brandColor: "#6600cc",
      primaryBackgroundColor: "#6600cc",
      primaryForegroundColor: "#ffffff",
      backgroundColor: "#ffffff",
      cardBackground: "#ffffff",
      textColor: "#0f172a",
      textSecondaryColor: "#64748b",
      textMutedColor: "#94a3b8",
      borderColor: "#e2e8f0",
    },
    colorsDark: {
      brandColor: "#ffffff",
      primaryBackgroundColor: "#6600cc",
      primaryForegroundColor: "#ffffff",
      backgroundColor: "#241f2a",
      cardBackground: "#111111",
      textColor: "#f8fafc",
      textSecondaryColor: "#a8b0c2",
      textMutedColor: "#8f97aa",
      borderColor: "#302b38",
    },
    wording: {},
    font: {
      family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      size: "16px",
      weight: { normal: "400", medium: "500", bold: "700" },
    },
    customCSS: "",
    logoUrl: "/api/admin-branding/logo",
    logoUrlDark: "/api/admin-branding/logo?dark=1",
    faviconUrl: "/api/admin-branding/favicon",
    faviconUrlDark: "/api/admin-branding/favicon?dark=1",
    customCssUrl: "/api/admin-branding/custom.css",
  };
}

export function getAdminBrandingLogoSvg(useDark: boolean): string {
  return getDefaultLogoSvg(useDark ? "#ffffff" : "#6600cc");
}

export function getAdminBrandingCss(): string {
  const branding = getAdminBrandingConfig();
  const colors = branding.colors;
  const dark = branding.colorsDark;
  return `:root{--admin-brand:${colors.brandColor};--admin-primary:${colors.primaryBackgroundColor};--admin-primary-foreground:${colors.primaryForegroundColor};--admin-background:${colors.backgroundColor};--admin-card:${colors.cardBackground};--admin-text:${colors.textColor};--admin-text-secondary:${colors.textSecondaryColor};--admin-text-muted:${colors.textMutedColor};--admin-border:${colors.borderColor}}.dark{--admin-brand:${dark.brandColor};--admin-primary:${dark.primaryBackgroundColor};--admin-primary-foreground:${dark.primaryForegroundColor};--admin-background:${dark.backgroundColor};--admin-card:${dark.cardBackground};--admin-text:${dark.textColor};--admin-text-secondary:${dark.textSecondaryColor};--admin-text-muted:${dark.textMutedColor};--admin-border:${dark.borderColor}}`;
}
