/**
 * Secure logging utility for cryptographic operations
 *
 * This utility provides environment-aware logging that:
 * - Never logs sensitive cryptographic material in any environment
 * - Provides detailed debug info only in development
 * - Logs only high-level operational info in production
 */

import type { Logger } from "../types.js";

export interface SecureLoggerOptions {
  isDevelopment?: boolean;
  logger?: Logger;
}

/**
 * Sanitizes objects to remove sensitive cryptographic data
 */
function sanitizeLogObject(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeLogObject);
  }

  const sanitized: Record<string, unknown> = {};
  const entries = Object.entries(obj as Record<string, unknown>);

  for (const [key, value] of entries) {
    const keyLower = key.toLowerCase();

    // Never log these sensitive fields in any environment
    if (
      keyLower.includes("key") ||
      keyLower.includes("token") ||
      keyLower.includes("secret") ||
      keyLower.includes("password") ||
      keyLower.includes("oprf") ||
      keyLower.includes("seed") ||
      (keyLower.includes("state") && keyLower.includes("server")) ||
      keyLower === "envelope" ||
      keyLower === "upload" ||
      keyLower === "response" ||
      keyLower === "request" ||
      keyLower === "finish"
    ) {
      sanitized[key] = "[REDACTED]";
    }
    // Sanitize nested objects
    else if (value && typeof value === "object") {
      sanitized[key] = sanitizeLogObject(value);
    }
    // Keep safe values
    else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Creates a secure logger wrapper that handles environment-based logging
 */
export function createSecureLogger(options: SecureLoggerOptions = {}) {
  const { isDevelopment = process.env.NODE_ENV === "development", logger } = options;

  return {
    /**
     * Log high-level OPAQUE operation events (safe for production)
     */
    logOpaqueOperation(
      operation:
        | "registration_start"
        | "registration_finish"
        | "login_start"
        | "login_finish"
        | "server_setup",
      details: {
        identityU?: string;
        sessionId?: string;
        success?: boolean;
        error?: string;
      } = {}
    ): void {
      try {
        const safeDetails = {
          operation,
          identityU: details.identityU ? "[USER]" : undefined,
          sessionId: details.sessionId ? "[SESSION]" : undefined,
          success: details.success,
          error: details.error ? "[ERROR]" : undefined,
          timestamp: new Date().toISOString(),
        };

        // Remove undefined values
        const logData = Object.fromEntries(
          Object.entries(safeDetails).filter(([, value]) => value !== undefined)
        );

        if (details.success === false && details.error) {
          logger?.error(logData, "[opaque] operation failed");
        } else {
          logger?.info(logData, "[opaque] operation completed");
        }
      } catch {
        // Logging errors should never break the application
      }
    },

    /**
     * Log development-only debug information (never in production)
     */
    logDebugInfo(message: string, data?: unknown): void {
      if (!isDevelopment) {
        return; // Never log debug info in production
      }

      try {
        if (data) {
          const sanitizedData = sanitizeLogObject(data);
          logger?.debug(sanitizedData, `[opaque-debug] ${message}`);
        } else {
          logger?.debug(`[opaque-debug] ${message}`);
        }
      } catch {
        // Logging errors should never break the application
      }
    },

    /**
     * Log session lifecycle events (safe for production)
     */
    logSessionEvent(
      event: "created" | "retrieved" | "expired" | "deleted",
      sessionId?: string,
      details?: { count?: number; expiresIn?: number }
    ): void {
      try {
        const logData = {
          event: `session_${event}`,
          sessionId: sessionId ? "[SESSION]" : undefined,
          sessionCount: details?.count,
          expiresInMinutes: details?.expiresIn ? Math.round(details.expiresIn / 60000) : undefined,
          timestamp: new Date().toISOString(),
        };

        // Remove undefined values
        const safeLogData = Object.fromEntries(
          Object.entries(logData).filter(([, value]) => value !== undefined)
        );

        logger?.info(safeLogData, "[opaque] session event");
      } catch {
        // Logging errors should never break the application
      }
    },

    /**
     * Log errors in a secure way (safe for production)
     */
    logSecureError(message: string, error?: unknown): void {
      try {
        const logData = {
          message,
          error: error instanceof Error ? error.message : "[ERROR]",
          timestamp: new Date().toISOString(),
        };

        logger?.error(logData, "[opaque] error");
      } catch {
        // Logging errors should never break the application
      }
    },
  };
}
