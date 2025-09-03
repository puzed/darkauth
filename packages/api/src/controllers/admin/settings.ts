import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { settings } from "../../db/schema.js";
import { ForbiddenError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

function toTitle(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function flattenSetting(
  baseKey: string,
  baseCategory: string | null,
  baseTags: string[] | null,
  value: unknown,
  defaultValue?: unknown
): Array<{
  key: string;
  name?: string | null;
  type?: string | null;
  category?: string | null;
  tags?: string[] | null;
  defaultValue?: unknown | null;
  value: unknown;
  secure: boolean;
  updatedAt: string | Date;
}> {
  const out: Array<{
    key: string;
    name?: string | null;
    type?: string | null;
    category?: string | null;
    tags?: string[] | null;
    defaultValue?: unknown | null;
    value: unknown;
    secure: boolean;
    updatedAt: string | Date;
  }> = [];
  const walk = (prefix: string, catPrefix: string[], val: unknown, def?: unknown) => {
    if (val === null || typeof val !== "object" || Array.isArray(val)) {
      let type: string | null = null;
      if (typeof val === "string") type = "string";
      else if (typeof val === "number") type = "number";
      else if (typeof val === "boolean") type = "boolean";
      else type = "string";
      const last = prefix.split(".").pop() || prefix;
      out.push({
        key: prefix,
        name: toTitle(last),
        type,
        category: catPrefix.join(" / ") || baseCategory || null,
        tags: baseTags || [],
        defaultValue: def as unknown,
        value: val as unknown,
        secure: false,
        updatedAt: new Date(),
      });
      return;
    }
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const defChild =
        def && typeof def === "object" && !Array.isArray(def)
          ? (def as Record<string, unknown>)[k]
          : undefined;
      walk(`${prefix}.${k}`, [...catPrefix, toTitle(k)], v, defChild);
    }
  };
  walk(
    baseKey,
    baseCategory ? baseCategory.split("/").map((p) => p.trim()) : [],
    value,
    defaultValue
  );
  return out;
}

export async function getSettings(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  // Require admin session
  const sessionData = await requireSession(context, request, true);

  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  // Get all settings
  const settingsData = await context.db
    .select({
      key: settings.key,
      name: settings.name,
      type: settings.type,
      category: settings.category,
      tags: settings.tags,
      defaultValue: settings.defaultValue,
      value: settings.value,
      secure: settings.secure,
      updatedAt: settings.updatedAt,
    })
    .from(settings)
    .orderBy(settings.key);

  // Optionally drop legacy object rows for keys we now represent via dot notation
  const DROP_OBJECT_KEYS = new Set([
    "code",
    "pkce",
    "id_token",
    "access_token",
    "zk_delivery",
    "opaque",
    "security_headers",
    "rate_limits",
    "user_keys",
    "admin_session",
  ]);

  const flattened: Array<{
    key: string;
    name?: string | null;
    type?: string | null;
    category?: string | null;
    tags?: string[] | null;
    defaultValue?: unknown | null;
    value: unknown;
    secure: boolean;
    updatedAt: string | Date;
  }> = [];
  for (const s of settingsData) {
    const isObjectRow =
      s.type === "object" || (s.value && typeof s.value === "object" && !Array.isArray(s.value));
    const shouldFlatten = isObjectRow && DROP_OBJECT_KEYS.has(s.key);
    if (shouldFlatten) {
      const parts = flattenSetting(s.key, s.category, s.tags, s.value, s.defaultValue);
      for (const p of parts) flattened.push(p);
    } else {
      flattened.push(s);
    }
  }

  // Filter out secure values if user has read-only access
  const filteredSettings = flattened.map((setting) => ({
    ...setting,
    value: setting.secure && sessionData.adminRole === "read" ? "[REDACTED]" : setting.value,
  }));

  const responseData = {
    settings: filteredSettings,
  };

  sendJson(response, 200, responseData);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Setting = z.object({
    key: z.string(),
    name: z.string().optional().nullable(),
    type: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    tags: z.array(z.string()).optional().nullable(),
    defaultValue: z.any().optional().nullable(),
    value: z.any(),
    secure: z.boolean(),
    updatedAt: z.string().or(z.date()),
  });
  const Resp = z.object({ settings: z.array(Setting) });
  registry.registerPath({
    method: "get",
    path: "/admin/settings",
    tags: ["Settings"],
    summary: "List settings",
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
