import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";
import { listSettings } from "../../models/settings.js";
import { ensureBrandingDefaults } from "../../services/branding.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

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
  await ensureBrandingDefaults(context);
  const settingsData = await listSettings(context);

  const flattened = settingsData;

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
