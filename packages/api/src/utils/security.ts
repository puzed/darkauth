import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "../types.js";

/**
 * Security headers configuration as per CORE.md spec
 * CSP: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
 *      connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self';
 *      object-src 'none'; require-trusted-types-for 'script'
 */
export function setSecurityHeaders(response: ServerResponse, isDevelopment = false): void {
  // Content Security Policy - strict CSP as specified
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' https://darkauth.com",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  // Only add trusted-types in production to avoid dev tool issues
  if (!isDevelopment) {
    csp.push("require-trusted-types-for 'script'");
  }

  response.setHeader("Content-Security-Policy", csp.join("; "));

  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-XSS-Protection", "1; mode=block");

  // HSTS (only in production with HTTPS)
  if (!isDevelopment) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
}

/**
 * Rate limiting with tiered limits and suspicious activity detection
 * In production, use Redis or similar for distributed rate limiting
 */
interface RateLimitBucket {
  count: number;
  resetTime: number;
  suspiciousActivity: number; // Track failed attempts
  lastSeen: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();
const emailRateLimitStore = new Map<string, RateLimitBucket>();
const blockedIPs = new Set<string>();
const blockedEmails = new Set<string>();

// Default rate limit configurations (can be overridden by database settings)
export const DEFAULT_RATE_LIMITS = {
  // Standard API requests
  general: { windowMs: 1 * 60 * 1000, maxRequests: 100, enabled: true },

  // Authentication endpoints (more restrictive)
  auth: { windowMs: 1 * 60 * 1000, maxRequests: 20, enabled: true },

  // OPAQUE endpoints (very restrictive due to computational cost)
  opaque: { windowMs: 1 * 60 * 1000, maxRequests: 10, enabled: true },

  // Token endpoint
  token: { windowMs: 1 * 60 * 1000, maxRequests: 30, enabled: true },

  // Admin endpoints
  admin: { windowMs: 1 * 60 * 1000, maxRequests: 50, enabled: true },

  // OTP endpoints
  otp: { windowMs: 15 * 60 * 1000, maxRequests: 10, enabled: true },
  otp_setup: { windowMs: 60 * 60 * 1000, maxRequests: 3, enabled: true },
  otp_verify: { windowMs: 60 * 60 * 1000, maxRequests: 10, enabled: true },
  otp_disable: { windowMs: 60 * 60 * 1000, maxRequests: 5, enabled: true },
  otp_regenerate: { windowMs: 60 * 60 * 1000, maxRequests: 5, enabled: true },

  // Install endpoint
  install: { windowMs: 60 * 60 * 1000, maxRequests: 3, enabled: true },
};

export type RateLimitType = keyof typeof DEFAULT_RATE_LIMITS;

// Cache for rate limit settings from database
type DbRateLimitConfig = { window_minutes?: number; max_requests?: number; enabled?: boolean };
type DbRateLimitSettings = Partial<Record<RateLimitType, DbRateLimitConfig>> &
  Record<string, unknown>;

let rateLimitSettingsCache: {
  settings: DbRateLimitSettings;
  timestamp: number;
} | null = null;

const CACHE_TTL = 60 * 1000; // 1 minute cache

export async function getRateLimitConfig(
  context: Context,
  limitType: RateLimitType
): Promise<{ windowMs: number; maxRequests: number; enabled: boolean }> {
  // Check cache first
  const now = Date.now();
  if (!rateLimitSettingsCache || now - rateLimitSettingsCache.timestamp > CACHE_TTL) {
    try {
      // Import dynamically to avoid circular dependency
      const { getSetting } = await import("../services/settings.js");
      const obj = (await getSetting(context, "rate_limits")) as DbRateLimitSettings | null;
      const flat: DbRateLimitSettings = {};
      const types: RateLimitType[] = [
        "general",
        "auth",
        "opaque",
        "token",
        "admin",
        "install",
        "otp",
        "otp_setup",
        "otp_verify",
        "otp_disable",
        "otp_regenerate",
      ];
      for (const t of types) {
        const w = (await getSetting(context, `rate_limits.${t}.window_minutes`)) as
          | number
          | undefined
          | null;
        const m = (await getSetting(context, `rate_limits.${t}.max_requests`)) as
          | number
          | undefined
          | null;
        const e = (await getSetting(context, `rate_limits.${t}.enabled`)) as
          | boolean
          | undefined
          | null;
        if (w !== undefined || m !== undefined || e !== undefined) {
          flat[t] = { window_minutes: w, max_requests: m, enabled: e } as DbRateLimitConfig;
        }
      }
      const settings = Object.keys(flat).length > 0 ? flat : obj || ({} as DbRateLimitSettings);
      rateLimitSettingsCache = {
        settings,
        timestamp: now,
      };
    } catch {
      // If database is not available, use defaults
      rateLimitSettingsCache = {
        settings: {},
        timestamp: now,
      };
    }
  }

  const settings = rateLimitSettingsCache.settings;
  const typeSettings = (settings[limitType] as DbRateLimitConfig | undefined) || {};
  const defaultConfig = DEFAULT_RATE_LIMITS[limitType];

  const windowMs = typeSettings.window_minutes
    ? typeSettings.window_minutes * 60 * 1000
    : defaultConfig.windowMs;
  let maxRequests = typeSettings.max_requests ?? defaultConfig.maxRequests;
  const enabled = typeSettings.enabled ?? defaultConfig.enabled;

  if (context.config.isDevelopment && limitType === "opaque") {
    if (maxRequests < 1000) maxRequests = 1000;
  }

  return { windowMs, maxRequests, enabled };
}

export async function checkRateLimit(
  context: Context,
  request: IncomingMessage,
  limitType: RateLimitType = "general",
  identifier?: string // Optional identifier (e.g., email for auth endpoints)
): Promise<{
  allowed: boolean;
  remaining: number;
  resetTime: number;
  blocked?: boolean;
}> {
  const config = await getRateLimitConfig(context, limitType);

  // If rate limiting is disabled for this type, allow the request
  if (!config.enabled) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetTime: 0,
    };
  }

  const clientIp = await getClientIp(context, request);
  const now = Date.now();

  // Derive port key to scope limits per server instance
  let portKey = "p0";
  try {
    const host = request.headers.host || "";
    const parsed = new URL(`http://${host}`);
    portKey = `p${parsed.port || "0"}`;
  } catch {}

  // For auth endpoints, check identifier-based rate limiting if identifier provided
  if (identifier && (limitType === "auth" || limitType === "opaque")) {
    const emailKey = `ratelimit:${limitType}:${portKey}:email:${identifier}`;

    // Check if email is blocked
    if (blockedEmails.has(identifier)) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + config.windowMs,
        blocked: true,
      };
    }

    let emailBucket = emailRateLimitStore.get(emailKey);

    if (!emailBucket || now > emailBucket.resetTime) {
      emailBucket = {
        count: 0,
        resetTime: now + config.windowMs,
        suspiciousActivity: emailBucket?.suspiciousActivity || 0,
        lastSeen: now,
      };
      emailRateLimitStore.set(emailKey, emailBucket);
    }

    emailBucket.count++;
    emailBucket.lastSeen = now;

    const emailAllowed = emailBucket.count <= config.maxRequests;

    // Track suspicious activity
    if (!emailAllowed) {
      emailBucket.suspiciousActivity++;

      // Block email after too many failed attempts
      if (emailBucket.suspiciousActivity >= 5) {
        blockedEmails.add(identifier);

        // Unblock after 1 hour
        setTimeout(
          () => {
            blockedEmails.delete(identifier);
          },
          60 * 60 * 1000
        );
      }

      return {
        allowed: false,
        remaining: 0,
        resetTime: emailBucket.resetTime,
        blocked: emailBucket.suspiciousActivity >= 5,
      };
    }
  }

  // IP-based rate limiting
  const clientKey = `${portKey}:${clientIp}`;
  const key = `ratelimit:${limitType}:${clientKey}`;

  // Check if IP is blocked
  if (blockedIPs.has(clientKey)) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: now + config.windowMs,
      blocked: true,
    };
  }

  let bucket = rateLimitStore.get(key);

  if (!bucket || now > bucket.resetTime) {
    // Create new bucket or reset expired one
    bucket = {
      count: 0,
      resetTime: now + config.windowMs,
      suspiciousActivity: bucket?.suspiciousActivity || 0,
      lastSeen: now,
    };
    rateLimitStore.set(key, bucket);
  }

  bucket.count++;
  bucket.lastSeen = now;

  const allowed = bucket.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - bucket.count);

  // Track suspicious activity for certain endpoints
  if (!allowed && (limitType === "auth" || limitType === "opaque" || limitType === "token")) {
    bucket.suspiciousActivity++;
    if (limitType !== "opaque") {
      if (bucket.suspiciousActivity >= 5) {
        blockedIPs.add(clientKey);
        setTimeout(
          () => {
            blockedIPs.delete(clientKey);
          },
          60 * 60 * 1000
        );
      }
    }
  }

  return {
    allowed,
    remaining,
    resetTime: bucket.resetTime,
  };
}

async function getClientIp(context: Context, request: IncomingMessage): Promise<string> {
  // Check if we should trust proxy headers
  let trustProxy = false;
  try {
    const { getSetting } = await import("../services/settings.js");
    const securitySettings = (await getSetting(context, "security")) as Record<
      string,
      unknown
    > | null;
    const val =
      securitySettings && typeof securitySettings === "object"
        ? (securitySettings as Record<string, unknown>).trust_proxy_headers
        : undefined;
    trustProxy = val === true;
  } catch {
    // Default to not trusting proxy headers
  }

  if (trustProxy) {
    // Handle various proxy headers
    const xForwardedFor = request.headers["x-forwarded-for"];
    const xRealIp = request.headers["x-real-ip"];
    const cfConnectingIp = request.headers["cf-connecting-ip"];

    if (Array.isArray(xForwardedFor)) {
      return xForwardedFor[0] || "unknown";
    }

    const proxyIp =
      (cfConnectingIp as string) ||
      (xRealIp as string) ||
      (xForwardedFor as string)?.split(",")[0]?.trim();

    if (proxyIp) {
      return proxyIp || "unknown";
    }
  }

  // Use direct connection IP
  return request.socket.remoteAddress || "unknown";
}

/**
 * Cleanup old rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  // Clean up IP-based rate limits
  for (const [key, bucket] of Array.from(rateLimitStore.entries())) {
    if (bucket.lastSeen < oneHourAgo) {
      rateLimitStore.delete(key);
    }
  }

  // Clean up email-based rate limits
  for (const [key, bucket] of Array.from(emailRateLimitStore.entries())) {
    if (bucket.lastSeen < oneHourAgo) {
      emailRateLimitStore.delete(key);
    }
  }
}

/**
 * Clear rate limit cache (useful for testing or when settings change)
 */
export function clearRateLimitCache(): void {
  rateLimitSettingsCache = null;
}

/**
 * Set rate limit headers
 */
export function setRateLimitHeaders(
  response: ServerResponse,
  limit: number,
  remaining: number,
  resetTime: number
): void {
  response.setHeader("X-RateLimit-Limit", limit.toString());
  response.setHeader("X-RateLimit-Remaining", remaining.toString());
  response.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000).toString());
}
