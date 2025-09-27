import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { requireSession } from "../../services/sessions.js";
import { getSetting, setSetting } from "../../services/settings.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";
import { clearRateLimitCache } from "../../utils/security.js";

interface SettingsUpdateRequest {
  key: string;
  value: unknown;
}

const ALLOWED_SETTINGS = [
  "rate_limits",
  "security",
  "code",
  "pkce",
  "id_token",
  "access_token",
  "zk_delivery",
  "opaque",
  "security_headers",
  "branding",
  "issuer",
  "public_origin",
  "rp_id",
  "users",
  "ui_user",
  "ui_admin",
  "ui_demo",
  "otp",
];

async function updateSettingsHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  // Require admin session with write permissions
  const sessionData = await requireSession(context, request, true);

  if (!sessionData.adminRole || sessionData.adminRole === "read") {
    throw new ForbiddenError("Write access required to update settings");
  }

  // Read and parse request body
  const body = await readBody(request);
  const data = parseJsonSafely(body) as SettingsUpdateRequest;

  // Validate request
  if (!data.key || typeof data.key !== "string") {
    throw new ValidationError("Missing or invalid key field");
  }

  if (data.value === undefined) {
    throw new ValidationError("Missing value field");
  }

  // Check if this setting is allowed to be updated
  if (
    !ALLOWED_SETTINGS.includes(data.key) &&
    !ALLOWED_SETTINGS.some((p) => data.key.startsWith(`${p}.`))
  ) {
    throw new ValidationError(`Setting '${data.key}' cannot be updated`);
  }

  // Validate specific settings
  if (data.key === "rate_limits") {
    validateRateLimitsSettings(data.value);
  } else if (data.key === "security") {
    validateSecuritySettings(data.value);
  }

  // Get the old value for audit logging
  const oldValue = await getSetting(context, data.key);

  // Update the setting
  await setSetting(context, data.key, data.value);

  if (
    data.key === "rate_limits" ||
    data.key.startsWith("rate_limits.") ||
    data.key === "security" ||
    data.key.startsWith("security.")
  ) {
    clearRateLimitCache();
  }

  // Return success response
  sendJson(response, 200, {
    success: true,
    key: data.key,
    oldValue,
    newValue: data.value,
  });
}

interface RateLimitConfigDb {
  window_minutes?: number;
  max_requests?: number;
  enabled?: boolean;
}

function validateRateLimitsSettings(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("Rate limits must be an object");
  }

  const validTypes = ["general", "auth", "opaque", "token", "admin", "install"];

  for (const [type, config] of Object.entries(value as Record<string, unknown>)) {
    if (!validTypes.includes(type)) {
      throw new ValidationError(`Invalid rate limit type: ${type}`);
    }

    if (typeof config !== "object" || config === null) {
      throw new ValidationError(`Rate limit config for ${type} must be an object`);
    }

    const { window_minutes, max_requests, enabled } = config as Partial<RateLimitConfigDb>;

    if (window_minutes !== undefined) {
      if (typeof window_minutes !== "number" || window_minutes <= 0 || window_minutes > 1440) {
        throw new ValidationError(`Invalid window_minutes for ${type}: must be between 1 and 1440`);
      }
    }

    if (max_requests !== undefined) {
      if (typeof max_requests !== "number" || max_requests <= 0 || max_requests > 10000) {
        throw new ValidationError(`Invalid max_requests for ${type}: must be between 1 and 10000`);
      }
    }

    if (enabled !== undefined && typeof enabled !== "boolean") {
      throw new ValidationError(`Invalid enabled value for ${type}: must be boolean`);
    }
  }
}

function validateSecuritySettings(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("Security settings must be an object");
  }

  const { trust_proxy_headers } = value as { trust_proxy_headers?: unknown };

  if (trust_proxy_headers !== undefined && typeof trust_proxy_headers !== "boolean") {
    throw new ValidationError("trust_proxy_headers must be a boolean");
  }
}

export const updateSettings = withAudit({
  eventType: "SETTINGS_UPDATE",
  resourceType: "settings",
  extractResourceId: (body) =>
    body && typeof body === "object" && "key" in body ? (body as { key?: string }).key : undefined,
})(updateSettingsHandler);

// OpenAPI schema definition
const Req = z.object({ key: z.string(), value: z.any() });
const Resp = z.object({
  success: z.boolean(),
  key: z.string(),
  oldValue: z.any().optional(),
  newValue: z.any(),
});

export const schema = {
  method: "PUT",
  path: "/admin/settings",
  tags: ["Settings"],
  summary: "Update setting",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
