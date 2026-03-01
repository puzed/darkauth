import { eq, inArray } from "drizzle-orm";
import { settings } from "../db/schema.ts";
import type { Context } from "../types.ts";

function resolveSettingsDb(context: Context) {
  return context.services.install?.tempDb || context.db;
}

const DEPRECATED_SETTING_KEYS = [
  "admin_session.refresh_lifetime_seconds",
  "code",
  "code.single_use",
  "code.lifetime_seconds",
  "pkce",
  "pkce.required_for_public_clients",
  "pkce.methods",
  "id_token",
  "id_token.lifetime_seconds",
  "access_token",
  "access_token.enabled",
  "access_token.lifetime_seconds",
] as const;

export async function getSetting(context: Context, key: string): Promise<unknown> {
  const db = resolveSettingsDb(context);
  if (!db) return undefined;
  const result = await db.query.settings.findFirst({
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
  const db = resolveSettingsDb(context);
  if (!db) {
    throw new Error("Database not prepared");
  }
  await db
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
  const db = resolveSettingsDb(context);
  if (!db) return {};
  const results = await db.query.settings.findMany();

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

export async function pruneDeprecatedSettings(context: Context): Promise<void> {
  const db = resolveSettingsDb(context);
  if (!db) return;

  if (DEPRECATED_SETTING_KEYS.length > 0) {
    await db.delete(settings).where(inArray(settings.key, [...DEPRECATED_SETTING_KEYS]));
  }

  const adminSession = await db.query.settings.findFirst({
    where: eq(settings.key, "admin_session"),
  });
  if (!adminSession || typeof adminSession.value !== "object" || adminSession.value === null) {
    return;
  }
  const currentValue = adminSession.value as Record<string, unknown>;
  if (!("refresh_lifetime_seconds" in currentValue)) {
    return;
  }

  const { refresh_lifetime_seconds: _ignoreValue, ...nextValue } = currentValue;
  const currentDefault =
    typeof adminSession.defaultValue === "object" && adminSession.defaultValue !== null
      ? (adminSession.defaultValue as Record<string, unknown>)
      : undefined;
  const nextDefault = currentDefault
    ? (({ refresh_lifetime_seconds: _ignoreDefault, ...rest }) => rest)(currentDefault)
    : adminSession.defaultValue;

  await db
    .update(settings)
    .set({
      value: nextValue,
      defaultValue: nextDefault,
      updatedAt: new Date(),
    })
    .where(eq(settings.key, "admin_session"));
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
    description?: string;
    tags?: string[];
    defaultValue: unknown;
    value: unknown;
    secure?: boolean;
  }> = [
    {
      key: "issuer",
      name: "Issuer",
      type: "string",
      category: "Core",
      description: "Issuer URL used in OIDC discovery and tokens",
      tags: ["core"],
      defaultValue: issuer,
      value: issuer,
    },

    {
      key: "users.self_registration_enabled",
      name: "Self Registration Enabled",
      type: "boolean",
      category: "Users",
      description: "Allow new users to sign up without invitation",
      tags: ["users"],
      defaultValue: false,
      value: false,
    },
    {
      key: "users.require_email_verification",
      name: "Require Email Verification",
      type: "boolean",
      category: "Users",
      description: "Require users to verify their email before login completes",
      tags: ["users", "email"],
      defaultValue: false,
      value: false,
    },
    {
      key: "public_origin",
      name: "Public Origin",
      type: "string",
      category: "Core",
      description: "Public base origin for redirects and links",
      tags: ["core"],
      defaultValue: publicOrigin,
      value: publicOrigin,
    },
    {
      key: "rp_id",
      name: "RP ID",
      type: "string",
      category: "Core",
      description: "WebAuthn relying party ID",
      tags: ["core", "webauthn"],
      defaultValue: rpId,
      value: rpId,
    },

    {
      key: "zk_delivery.fragment_param",
      name: "Fragment Param",
      type: "string",
      category: "ZK / Delivery",
      description: "URL fragment parameter name for DRK JWE",
      tags: ["zk"],
      defaultValue: "drk_jwe",
      value: "drk_jwe",
    },
    {
      key: "zk_delivery.jwe_alg",
      name: "JWE Alg",
      type: "string",
      category: "ZK / Delivery",
      description: "Default JWE algorithm for DRK delivery",
      tags: ["zk"],
      defaultValue: "ECDH-ES",
      value: "ECDH-ES",
    },
    {
      key: "zk_delivery.jwe_enc",
      name: "JWE Enc",
      type: "string",
      category: "ZK / Delivery",
      description: "Default JWE encryption method for DRK delivery",
      tags: ["zk"],
      defaultValue: "A256GCM",
      value: "A256GCM",
    },
    {
      key: "zk_delivery.hash_alg",
      name: "Hash Alg",
      type: "string",
      category: "ZK / Delivery",
      description: "Hash algorithm used for fragment verification",
      tags: ["zk"],
      defaultValue: "SHA-256",
      value: "SHA-256",
    },

    {
      key: "opaque.kdf",
      name: "OPAQUE KDF",
      type: "string",
      category: "Security / OPAQUE",
      description: "OPAQUE KDF suite",
      tags: ["opaque"],
      defaultValue: "ristretto255",
      value: "ristretto255",
    },
    {
      key: "opaque.envelope_mode",
      name: "Envelope Mode",
      type: "string",
      category: "Security / OPAQUE",
      description: "OPAQUE envelope mode",
      tags: ["opaque"],
      defaultValue: "base",
      value: "base",
    },

    {
      key: "security_headers.enabled",
      name: "Security Headers Enabled",
      type: "boolean",
      category: "Security / Headers",
      description: "Enable security headers middleware",
      tags: ["security"],
      defaultValue: true,
      value: true,
    },
    {
      key: "security_headers.csp",
      name: "CSP",
      type: "string",
      category: "Security / Headers",
      description: "Content Security Policy applied to responses",
      tags: ["security"],
      defaultValue:
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://darkauth.com https://release.darkauth.com; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'",
      value:
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://darkauth.com https://release.darkauth.com; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'",
    },

    {
      key: "rate_limits.general.enabled",
      name: "General Enabled",
      type: "boolean",
      category: "Security / Rate Limits / General",
      description: "Enable general rate limiting",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.general.window_minutes",
      name: "General Window (min)",
      type: "number",
      category: "Security / Rate Limits / General",
      description: "Window length in minutes",
      tags: ["ratelimit"],
      defaultValue: 1,
      value: 1,
    },
    {
      key: "rate_limits.general.max_requests",
      name: "General Max Requests",
      type: "number",
      category: "Security / Rate Limits / General",
      description: "Maximum requests per window",
      tags: ["ratelimit"],
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "rate_limits.auth.enabled",
      name: "Auth Enabled",
      type: "boolean",
      category: "Security / Rate Limits / Auth",
      description: "Enable rate limits for auth endpoints",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.auth.window_minutes",
      name: "Auth Window (min)",
      type: "number",
      category: "Security / Rate Limits / Auth",
      description: "Window length in minutes",
      tags: ["ratelimit"],
      defaultValue: 1,
      value: 1,
    },
    {
      key: "rate_limits.auth.max_requests",
      name: "Auth Max Requests",
      type: "number",
      category: "Security / Rate Limits / Auth",
      description: "Maximum requests per window",
      tags: ["ratelimit"],
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "rate_limits.opaque.enabled",
      name: "OPAQUE Enabled",
      type: "boolean",
      category: "Security / Rate Limits / OPAQUE",
      description: "Enable rate limits for OPAQUE endpoints",
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
      defaultValue: 1000,
      value: 1000,
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
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "rate_limits.otp.enabled",
      name: "OTP Enabled",
      type: "boolean",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.otp.window_minutes",
      name: "OTP Window (min)",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 15,
      value: 15,
    },
    {
      key: "rate_limits.otp.max_requests",
      name: "OTP Max Requests",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "rate_limits.otp_setup.enabled",
      name: "OTP Setup Enabled",
      type: "boolean",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.otp_setup.window_minutes",
      name: "OTP Setup Window (min)",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 60,
      value: 60,
    },
    {
      key: "rate_limits.otp_setup.max_requests",
      name: "OTP Setup Max Requests",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "rate_limits.otp_verify.enabled",
      name: "OTP Verify Enabled",
      type: "boolean",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.otp_verify.window_minutes",
      name: "OTP Verify Window (min)",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 60,
      value: 60,
    },
    {
      key: "rate_limits.otp_verify.max_requests",
      name: "OTP Verify Max Requests",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "rate_limits.otp_disable.enabled",
      name: "OTP Disable Enabled",
      type: "boolean",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.otp_disable.window_minutes",
      name: "OTP Disable Window (min)",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 60,
      value: 60,
    },
    {
      key: "rate_limits.otp_disable.max_requests",
      name: "OTP Disable Max Requests",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "rate_limits.otp_regenerate.enabled",
      name: "OTP Regenerate Enabled",
      type: "boolean",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: true,
      value: true,
    },
    {
      key: "rate_limits.otp_regenerate.window_minutes",
      name: "OTP Regenerate Window (min)",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 60,
      value: 60,
    },
    {
      key: "rate_limits.otp_regenerate.max_requests",
      name: "OTP Regenerate Max Requests",
      type: "number",
      category: "Security / Rate Limits / OTP",
      tags: ["ratelimit"],
      defaultValue: 1000,
      value: 1000,
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
      defaultValue: 1000,
      value: 1000,
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
      defaultValue: 1000,
      value: 1000,
    },

    {
      key: "user_keys.enc_public_visible_to_authenticated_users",
      name: "Enc Public Visible To Authenticated Users",
      type: "boolean",
      category: "Security / User Keys",
      description: "Expose users' encryption public keys to authenticated users",
      tags: ["keys"],
      defaultValue: true,
      value: true,
    },

    {
      key: "admin_session.lifetime_seconds",
      name: "Admin Session TTL (s)",
      type: "number",
      category: "Admin / Session",
      description: "Admin session lifetime in seconds",
      tags: ["session"],
      defaultValue: 15 * 60,
      value: 15 * 60,
    },

    {
      key: "otp",
      name: "OTP Settings",
      type: "json",
      category: "Security / OTP",
      description: "TOTP configuration and policy",
      tags: ["otp", "security"],
      defaultValue: {
        enabled: true,
        issuer: "DarkAuth",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        window: 1,
        backup_codes_count: 8,
        max_failures: 5,
        lockout_duration_minutes: 15,
        require_for_admin: true,
        require_for_users: false,
      },
      value: {
        enabled: true,
        issuer: "DarkAuth",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        window: 1,
        backup_codes_count: 8,
        max_failures: 5,
        lockout_duration_minutes: 15,
        require_for_admin: true,
        require_for_users: false,
      },
    },
    {
      key: "email.transport",
      name: "Email Transport",
      type: "string",
      category: "Email / SMTP",
      description: "Email transport provider",
      tags: ["email", "smtp"],
      defaultValue: "smtp",
      value: "smtp",
    },
    {
      key: "email.from",
      name: "From Address",
      type: "string",
      category: "Email / SMTP",
      description: "From address for outgoing emails",
      tags: ["email", "smtp"],
      defaultValue: "",
      value: "",
    },
    {
      key: "email.smtp.host",
      name: "SMTP Host",
      type: "string",
      category: "Email / SMTP",
      description: "SMTP host",
      tags: ["email", "smtp"],
      defaultValue: "",
      value: "",
    },
    {
      key: "email.smtp.port",
      name: "SMTP Port",
      type: "number",
      category: "Email / SMTP",
      description: "SMTP port",
      tags: ["email", "smtp"],
      defaultValue: 587,
      value: 587,
    },
    {
      key: "email.smtp.user",
      name: "SMTP User",
      type: "string",
      category: "Email / SMTP",
      description: "SMTP username",
      tags: ["email", "smtp"],
      defaultValue: "",
      value: "",
    },
    {
      key: "email.smtp.password",
      name: "SMTP Password",
      type: "string",
      category: "Email / SMTP",
      description: "SMTP password",
      tags: ["email", "smtp"],
      defaultValue: "",
      value: "",
      secure: true,
    },
    {
      key: "email.smtp.enabled",
      name: "SMTP Enabled",
      type: "boolean",
      category: "Email / SMTP",
      description: "Enable SMTP for outgoing email",
      tags: ["email", "smtp"],
      defaultValue: false,
      value: false,
    },
    {
      key: "email.verification.token_ttl_minutes",
      name: "Verification Token TTL (minutes)",
      type: "number",
      category: "Email / Verification",
      description: "Minutes until email verification links expire",
      tags: ["email", "verification"],
      defaultValue: 1440,
      value: 1440,
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

  items.push(...brandingItems);
  const { listTemplateDefaults } = await import("./emailTemplates.ts");
  const templateDefaults = listTemplateDefaults();
  for (const [templateKey, template] of Object.entries(templateDefaults)) {
    items.push({
      key: `email.templates.${templateKey}`,
      name: `${templateKey} Template`,
      type: "object",
      category: "Email / Templates",
      description: `Template for ${templateKey}`,
      tags: ["email", "templates"],
      defaultValue: template,
      value: template,
    });
  }

  for (const s of items) {
    await context.db
      .insert(settings)
      .values({
        key: s.key,
        name: s.name,
        type: s.type,
        category: s.category,
        description: s.description,
        tags: s.tags || [],
        defaultValue: s.defaultValue,
        value: s.value,
        secure: s.secure === true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          name: s.name,
          type: s.type,
          category: s.category,
          description: s.description,
          tags: s.tags || [],
          defaultValue: s.defaultValue,
          value: s.value,
          secure: s.secure === true,
          updatedAt: new Date(),
        },
      });
  }

  await pruneDeprecatedSettings(context);
}

/**
 * Load runtime configuration from database settings
 * As specified in CORE.md: "all settings in Postgres"
 */
export async function loadRuntimeConfig(context: Context): Promise<{
  issuer: string;
  publicOrigin: string;
  rpId: string;
}> {
  const [issuer, publicOrigin, rpId] = await Promise.all([
    getSetting(context, "issuer"),
    getSetting(context, "public_origin"),
    getSetting(context, "rp_id"),
  ]);

  return {
    issuer: (issuer as string) || "http://localhost:9080",
    publicOrigin: (publicOrigin as string) || "http://localhost:9080",
    rpId: (rpId as string) || "localhost",
  };
}
