import { eq } from "drizzle-orm";
import { settings } from "../db/schema.js";
import type { Context } from "../types.js";

export async function getSetting(context: Context, key: string): Promise<unknown> {
  const result = await context.db.query.settings.findFirst({
    where: eq(settings.key, key),
  });

  return result?.value;
}

export async function setSetting(
  context: Context,
  key: string,
  value: unknown,
  secure = false
): Promise<void> {
  await context.db
    .insert(settings)
    .values({
      key,
      value,
      secure,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value,
        secure,
        updatedAt: new Date(),
      },
    });
}

export async function getAllSettings(context: Context): Promise<Record<string, unknown>> {
  const results = await context.db.query.settings.findMany();

  const settingsMap: Record<string, unknown> = {};
  for (const setting of results) {
    const key = setting.key as string;
    if (key) {
      settingsMap[key] = setting.value;
    }
  }

  return settingsMap;
}

export async function isSystemInitialized(context: Context): Promise<boolean> {
  try {
    const initialized = await getSetting(context, "initialized");
    return initialized === true;
  } catch (_error) {
    return false;
  }
}

export async function markSystemInitialized(context: Context): Promise<void> {
  await setSetting(context, "initialized", true);
}

export async function seedDefaultSettings(
  context: Context,
  issuer: string,
  publicOrigin: string,
  rpId: string
): Promise<void> {
  const items: Array<{
    key: string;
    name: string;
    type: string;
    category: string;
    tags?: string[];
    defaultValue: unknown;
    value: unknown;
  }> = [
    {
      key: "issuer",
      name: "Issuer",
      type: "string",
      category: "Core",
      tags: ["core"],
      defaultValue: issuer,
      value: issuer,
    },
    {
      key: "public_origin",
      name: "Public Origin",
      type: "string",
      category: "Core",
      tags: ["core"],
      defaultValue: publicOrigin,
      value: publicOrigin,
    },
    {
      key: "rp_id",
      name: "RP ID",
      type: "string",
      category: "Core",
      tags: ["core", "webauthn"],
      defaultValue: rpId,
      value: rpId,
    },

    {
      key: "code.single_use",
      name: "Single Use",
      type: "boolean",
      category: "Auth / Code",
      tags: ["auth"],
      defaultValue: true,
      value: true,
    },
    {
      key: "code.lifetime_seconds",
      name: "Lifetime (s)",
      type: "number",
      category: "Auth / Code",
      tags: ["auth"],
      defaultValue: 60,
      value: 60,
    },

    {
      key: "pkce.required_for_public_clients",
      name: "Required For Public Clients",
      type: "boolean",
      category: "Auth / PKCE",
      tags: ["auth"],
      defaultValue: true,
      value: true,
    },
    {
      key: "pkce.methods",
      name: "Methods",
      type: "string",
      category: "Auth / PKCE",
      tags: ["auth"],
      defaultValue: "S256",
      value: "S256",
    },

    {
      key: "id_token.lifetime_seconds",
      name: "ID Token TTL (s)",
      type: "number",
      category: "Tokens / ID Token",
      tags: ["oidc"],
      defaultValue: 300,
      value: 300,
    },
    {
      key: "access_token.enabled",
      name: "Access Token Enabled",
      type: "boolean",
      category: "Tokens / Access Token",
      tags: ["oidc"],
      defaultValue: false,
      value: false,
    },
    {
      key: "access_token.lifetime_seconds",
      name: "Access Token TTL (s)",
      type: "number",
      category: "Tokens / Access Token",
      tags: ["oidc"],
      defaultValue: 600,
      value: 600,
    },

    {
      key: "zk_delivery.fragment_param",
      name: "Fragment Param",
      type: "string",
      category: "ZK / Delivery",
      tags: ["zk"],
      defaultValue: "drk_jwe",
      value: "drk_jwe",
    },
    {
      key: "zk_delivery.jwe_alg",
      name: "JWE Alg",
      type: "string",
      category: "ZK / Delivery",
      tags: ["zk"],
      defaultValue: "ECDH-ES",
      value: "ECDH-ES",
    },
    {
      key: "zk_delivery.jwe_enc",
      name: "JWE Enc",
      type: "string",
      category: "ZK / Delivery",
      tags: ["zk"],
      defaultValue: "A256GCM",
      value: "A256GCM",
    },
    {
      key: "zk_delivery.hash_alg",
      name: "Hash Alg",
      type: "string",
      category: "ZK / Delivery",
      tags: ["zk"],
      defaultValue: "SHA-256",
      value: "SHA-256",
    },

    {
      key: "opaque.kdf",
      name: "OPAQUE KDF",
      type: "string",
      category: "Security / OPAQUE",
      tags: ["opaque"],
      defaultValue: "ristretto255",
      value: "ristretto255",
    },
    {
      key: "opaque.envelope_mode",
      name: "Envelope Mode",
      type: "string",
      category: "Security / OPAQUE",
      tags: ["opaque"],
      defaultValue: "base",
      value: "base",
    },

    {
      key: "security_headers.enabled",
      name: "Security Headers Enabled",
      type: "boolean",
      category: "Security / Headers",
      tags: ["security"],
      defaultValue: true,
      value: true,
    },
    {
      key: "security_headers.csp",
      name: "CSP",
      type: "string",
      category: "Security / Headers",
      tags: ["security"],
      defaultValue:
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://darkauth.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'",
      value:
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://darkauth.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'",
    },

    {
      key: "rate_limits.general.enabled",
      name: "General Enabled",
      type: "boolean",
      category: "Security / Rate Limits / General",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.general.window_minutes",
      name: "General Window (min)",
      type: "number",
      category: "Security / Rate Limits / General",
      tags: ["ratelimit"],
      defaultValue: 1,
      value: 1,
    },
    {
      key: "rate_limits.general.max_requests",
      name: "General Max Requests",
      type: "number",
      category: "Security / Rate Limits / General",
      tags: ["ratelimit"],
      defaultValue: 100,
      value: 100,
    },

    {
      key: "rate_limits.auth.enabled",
      name: "Auth Enabled",
      type: "boolean",
      category: "Security / Rate Limits / Auth",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.auth.window_minutes",
      name: "Auth Window (min)",
      type: "number",
      category: "Security / Rate Limits / Auth",
      tags: ["ratelimit"],
      defaultValue: 1,
      value: 1,
    },
    {
      key: "rate_limits.auth.max_requests",
      name: "Auth Max Requests",
      type: "number",
      category: "Security / Rate Limits / Auth",
      tags: ["ratelimit"],
      defaultValue: 20,
      value: 20,
    },

    {
      key: "rate_limits.opaque.enabled",
      name: "OPAQUE Enabled",
      type: "boolean",
      category: "Security / Rate Limits / OPAQUE",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.opaque.window_minutes",
      name: "OPAQUE Window (min)",
      type: "number",
      category: "Security / Rate Limits / OPAQUE",
      tags: ["ratelimit"],
      defaultValue: 1,
      value: 1,
    },
    {
      key: "rate_limits.opaque.max_requests",
      name: "OPAQUE Max Requests",
      type: "number",
      category: "Security / Rate Limits / OPAQUE",
      tags: ["ratelimit"],
      defaultValue: 10,
      value: 10,
    },

    {
      key: "rate_limits.token.enabled",
      name: "Token Enabled",
      type: "boolean",
      category: "Security / Rate Limits / Token",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.token.window_minutes",
      name: "Token Window (min)",
      type: "number",
      category: "Security / Rate Limits / Token",
      tags: ["ratelimit"],
      defaultValue: 1,
      value: 1,
    },
    {
      key: "rate_limits.token.max_requests",
      name: "Token Max Requests",
      type: "number",
      category: "Security / Rate Limits / Token",
      tags: ["ratelimit"],
      defaultValue: 30,
      value: 30,
    },

    {
      key: "rate_limits.admin.enabled",
      name: "Admin Enabled",
      type: "boolean",
      category: "Security / Rate Limits / Admin",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.admin.window_minutes",
      name: "Admin Window (min)",
      type: "number",
      category: "Security / Rate Limits / Admin",
      tags: ["ratelimit"],
      defaultValue: 1,
      value: 1,
    },
    {
      key: "rate_limits.admin.max_requests",
      name: "Admin Max Requests",
      type: "number",
      category: "Security / Rate Limits / Admin",
      tags: ["ratelimit"],
      defaultValue: 50,
      value: 50,
    },

    {
      key: "rate_limits.install.enabled",
      name: "Install Enabled",
      type: "boolean",
      category: "Security / Rate Limits / Install",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.install.window_minutes",
      name: "Install Window (min)",
      type: "number",
      category: "Security / Rate Limits / Install",
      tags: ["ratelimit"],
      defaultValue: 60,
      value: 60,
    },
    {
      key: "rate_limits.install.max_requests",
      name: "Install Max Requests",
      type: "number",
      category: "Security / Rate Limits / Install",
      tags: ["ratelimit"],
      defaultValue: 3,
      value: 3,
    },

    {
      key: "user_keys.enc_public_visible_to_authenticated_users",
      name: "Enc Public Visible To Authenticated Users",
      type: "boolean",
      category: "Security / User Keys",
      tags: ["keys"],
      defaultValue: true,
      value: true,
    },

    {
      key: "admin_session.lifetime_seconds",
      name: "Admin Session TTL (s)",
      type: "number",
      category: "Admin / Session",
      tags: ["session"],
      defaultValue: 15 * 60,
      value: 15 * 60,
    },
    {
      key: "admin_session.refresh_lifetime_seconds",
      name: "Admin Refresh TTL (s)",
      type: "number",
      category: "Admin / Session",
      tags: ["session"],
      defaultValue: 7 * 24 * 60 * 60,
      value: 7 * 24 * 60 * 60,
    },
  ];

  const brandingDefaults = {
    identity: { title: "DarkAuth", tagline: "Secure Zero-Knowledge Authentication" },
    logo: { data: null, mimeType: null },
    favicon: { data: null, mimeType: null },
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

  const brandingItems: typeof items = [
    {
      key: "branding.identity",
      name: "Brand Identity",
      type: "object",
      category: "Branding/Identity",
      defaultValue: brandingDefaults.identity,
      value: brandingDefaults.identity,
    },
    {
      key: "branding.logo",
      name: "Logo Image",
      type: "object",
      category: "Branding/Identity",
      defaultValue: brandingDefaults.logo,
      value: brandingDefaults.logo,
    },
    {
      key: "branding.logo_dark",
      name: "Logo Image (Dark)",
      type: "object",
      category: "Branding/Identity",
      defaultValue: brandingDefaults.logo,
      value: brandingDefaults.logo,
    },
    {
      key: "branding.favicon",
      name: "Favicon",
      type: "object",
      category: "Branding/Identity",
      defaultValue: brandingDefaults.favicon,
      value: brandingDefaults.favicon,
    },
    {
      key: "branding.favicon_dark",
      name: "Favicon (Dark)",
      type: "object",
      category: "Branding/Identity",
      defaultValue: brandingDefaults.favicon,
      value: brandingDefaults.favicon,
    },
    {
      key: "branding.colors",
      name: "Color Scheme",
      type: "object",
      category: "Branding/Appearance",
      defaultValue: brandingDefaults.colors,
      value: brandingDefaults.colors,
    },
    {
      key: "branding.colors_dark",
      name: "Color Scheme (Dark)",
      type: "object",
      category: "Branding/Appearance",
      defaultValue: brandingDefaults.colorsDark,
      value: brandingDefaults.colorsDark,
    },
    {
      key: "branding.wording",
      name: "UI Text",
      type: "object",
      category: "Branding/Text",
      defaultValue: brandingDefaults.wording,
      value: brandingDefaults.wording,
    },
    {
      key: "branding.font",
      name: "Typography",
      type: "object",
      category: "Branding/Appearance",
      defaultValue: brandingDefaults.font,
      value: brandingDefaults.font,
    },
    {
      key: "branding.custom_css",
      name: "Custom CSS",
      type: "string",
      category: "Branding/Advanced",
      defaultValue: brandingDefaults.customCSS,
      value: brandingDefaults.customCSS,
    },
  ];

  items.push(...brandingItems);

  for (const s of items) {
    await context.db
      .insert(settings)
      .values({
        key: s.key,
        name: s.name,
        type: s.type,
        category: s.category,
        tags: s.tags || [],
        defaultValue: s.defaultValue,
        value: s.value,
        secure: false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          name: s.name,
          type: s.type,
          category: s.category,
          tags: s.tags || [],
          defaultValue: s.defaultValue,
          value: s.value,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Load runtime configuration from database settings
 * As specified in CORE.md: "all settings in Postgres"
 */
export async function loadRuntimeConfig(context: Context): Promise<{
  issuer: string;
  publicOrigin: string;
  rpId: string;
  codeLifetime: number;
  idTokenLifetime: number;
  accessTokenEnabled: boolean;
  accessTokenLifetime: number;
}> {
  const [issuer, publicOrigin, rpId, codeSettings, idTokenSettings, accessTokenSettings] =
    await Promise.all([
      getSetting(context, "issuer"),
      getSetting(context, "public_origin"),
      getSetting(context, "rp_id"),
      getSetting(context, "code"),
      getSetting(context, "id_token"),
      getSetting(context, "access_token"),
    ]);

  return {
    issuer: (issuer as string) || "http://localhost:9080",
    publicOrigin: (publicOrigin as string) || "http://localhost:9080",
    rpId: (rpId as string) || "localhost",
    codeLifetime:
      (codeSettings as { lifetime_seconds?: number } | undefined | null)?.lifetime_seconds || 60,
    idTokenLifetime:
      (idTokenSettings as { lifetime_seconds?: number } | undefined | null)?.lifetime_seconds ||
      300,
    accessTokenEnabled:
      (accessTokenSettings as { enabled?: boolean } | undefined | null)?.enabled || false,
    accessTokenLifetime:
      (accessTokenSettings as { lifetime_seconds?: number } | undefined | null)?.lifetime_seconds ||
      600,
  };
}
