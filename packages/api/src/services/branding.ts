import { settings } from "../db/schema.js";
import type { Context } from "../types.js";
import { getSetting } from "./settings.js";

type BrandingConfig = {
  identity: { title: string; tagline: string };
  logo: { data: string | null; mimeType: string | null };
  logoDark?: { data: string | null; mimeType: string | null };
  favicon: { data: string | null; mimeType: string | null };
  faviconDark?: { data: string | null; mimeType: string | null };
  colors: Record<string, string>;
  colorsDark?: Record<string, string>;
  wording: Record<string, string>;
  font: { family: string; size: string; weight: Record<string, string> };
  customCSS: string;
};

export async function getBrandingConfig(context: Context): Promise<BrandingConfig> {
  const [
    identity,
    logo,
    logoDark,
    favicon,
    faviconDark,
    colors,
    colorsDark,
    wording,
    font,
    customCSS,
  ] = await Promise.all([
    getSetting(context, "branding.identity"),
    getSetting(context, "branding.logo"),
    getSetting(context, "branding.logo_dark"),
    getSetting(context, "branding.favicon"),
    getSetting(context, "branding.favicon_dark"),
    getSetting(context, "branding.colors"),
    getSetting(context, "branding.colors_dark"),
    getSetting(context, "branding.wording"),
    getSetting(context, "branding.font"),
    getSetting(context, "branding.custom_css"),
  ]);

  return {
    identity: (identity as BrandingConfig["identity"]) || {
      title: "DarkAuth",
      tagline: "Secure Zero-Knowledge Authentication",
    },
    logo: (logo as BrandingConfig["logo"]) || { data: null, mimeType: null },
    favicon: (favicon as BrandingConfig["favicon"]) || { data: null, mimeType: null },
    logoDark: (logoDark as BrandingConfig["logoDark"]) || { data: null, mimeType: null },
    faviconDark: (faviconDark as BrandingConfig["faviconDark"]) || { data: null, mimeType: null },
    colors: (colors as BrandingConfig["colors"]) || {},
    colorsDark: (colorsDark as BrandingConfig["colorsDark"]) || { primary: "#aec1e0" },
    wording: (wording as BrandingConfig["wording"]) || {},
    font: (font as BrandingConfig["font"]) || {
      family: "system-ui, -apple-system, sans-serif",
      size: "16px",
      weight: { normal: "400", medium: "500", bold: "700" },
    },
    customCSS: typeof customCSS === "string" ? customCSS : "",
  };
}

export function sanitizeCSS(css: string): string {
  const dangerous = [
    "javascript:",
    "expression(",
    "@import",
    "@charset",
    "behavior:",
    "-moz-binding",
  ];
  let sanitized = css || "";
  for (const pattern of dangerous) {
    const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    sanitized = sanitized.replace(re, "");
  }
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, "");
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized;
}

export function sanitizeSvg(svg: string): string {
  let s = svg;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/on[a-z]+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/on[a-z]+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/xlink:href\s*=\s*"javascript:[^"]*"/gi, "");
  s = s.replace(/xlink:href\s*=\s*'javascript:[^']*'/gi, "");
  return s;
}

export function validateImageBase64(data: string, mimeType: string): void {
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error("Image too large (max 2MB)");
  }
  const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/x-icon"];
  if (!allowed.includes(mimeType)) {
    throw new Error("Invalid image type");
  }
}

export async function ensureBrandingDefaults(context: Context): Promise<void> {
  const brandingDefaults = {
    identity: { title: "DarkAuth", tagline: "Secure Zero-Knowledge Authentication" },
    logo: { data: null as string | null, mimeType: null as string | null },
    favicon: { data: null as string | null, mimeType: null as string | null },
    colors: {
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
    },
    colorsDark: {
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
    },
    wording: {
      welcomeBack: "Welcome back",
      createAccount: "Create your account",
      email: "Email",
      emailPlaceholder: "Enter your email",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      confirmPassword: "Confirm Password",
      confirmPasswordPlaceholder: "Confirm your password",
      signin: "Continue",
      signingIn: "Signing in...",
      signup: "Sign up",
      signingUp: "Creating account...",
      signout: "Sign Out",
      changePassword: "Change Password",
      cancel: "Cancel",
      authorize: "Authorize",
      deny: "Deny",
      noAccount: "Don't have an account?",
      hasAccount: "Already have an account?",
      forgotPassword: "Forgot your password?",
      signedInAs: "Signed in as",
      successAuth: "Successfully authenticated",
      errorGeneral: "An error occurred. Please try again.",
      errorNetwork: "Network error. Please check your connection.",
      errorInvalidCreds: "Invalid email or password.",
      authorizeTitle: "Authorize Application",
      authorizeDescription: "{app} would like to:",
      scopeProfile: "Access your profile information",
      scopeEmail: "Access your email address",
      scopeOpenid: "Authenticate you",
    },
    font: {
      family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      size: "16px",
      weight: { normal: "400", medium: "500", bold: "700" },
    },
    customCSS: "",
  };

  const rows = [
    {
      key: "branding.identity",
      name: "Brand Identity",
      type: "object",
      category: "Branding/Identity",
      description: "Product name and tagline used across user pages",
      defaultValue: brandingDefaults.identity,
      value: brandingDefaults.identity,
    },
    {
      key: "branding.logo",
      name: "Logo Image",
      type: "object",
      category: "Branding/Identity",
      description: "Base64 logo image and MIME type",
      defaultValue: brandingDefaults.logo,
      value: brandingDefaults.logo,
    },
    {
      key: "branding.logo_dark",
      name: "Logo Image (Dark)",
      type: "object",
      category: "Branding/Identity",
      description: "Base64 dark mode logo image and MIME type",
      defaultValue: brandingDefaults.logo,
      value: brandingDefaults.logo,
    },
    {
      key: "branding.favicon",
      name: "Favicon",
      type: "object",
      category: "Branding/Identity",
      description: "Base64 favicon and MIME type",
      defaultValue: brandingDefaults.favicon,
      value: brandingDefaults.favicon,
    },
    {
      key: "branding.favicon_dark",
      name: "Favicon (Dark)",
      type: "object",
      category: "Branding/Identity",
      description: "Base64 dark mode favicon and MIME type",
      defaultValue: brandingDefaults.favicon,
      value: brandingDefaults.favicon,
    },
    {
      key: "branding.colors",
      name: "Color Scheme",
      type: "object",
      category: "Branding/Appearance",
      description: "Color palette for user login and consent screens",
      defaultValue: brandingDefaults.colors,
      value: brandingDefaults.colors,
    },
    {
      key: "branding.colors_dark",
      name: "Color Scheme (Dark)",
      type: "object",
      category: "Branding/Appearance",
      description: "Dark mode color palette for user login and consent screens",
      defaultValue: brandingDefaults.colorsDark,
      value: brandingDefaults.colorsDark,
    },
    {
      key: "branding.wording",
      name: "UI Text",
      type: "object",
      category: "Branding/Text",
      description: "Text labels used in user flows",
      defaultValue: brandingDefaults.wording,
      value: brandingDefaults.wording,
    },
    {
      key: "branding.font",
      name: "Typography",
      type: "object",
      category: "Branding/Appearance",
      description: "Font family, base size, and weights",
      defaultValue: brandingDefaults.font,
      value: brandingDefaults.font,
    },
    {
      key: "branding.custom_css",
      name: "Custom CSS",
      type: "string",
      category: "Branding/Advanced",
      description: "Additional CSS injected into login and consent pages",
      defaultValue: brandingDefaults.customCSS,
      value: brandingDefaults.customCSS,
    },
  ];

  for (const r of rows) {
    await context.db
      .insert(settings)
      .values({
        key: r.key,
        name: r.name,
        type: r.type,
        category: r.category,
        description: r.description,
        tags: [],
        defaultValue: r.defaultValue,
        value: r.value,
        secure: false,
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}
