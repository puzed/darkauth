import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { listSettings } from "../../models/settings.js";
import { ensureBrandingDefaults } from "../../services/branding.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
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

const Setting = z.object({
  key: z.string(),
  name: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  defaultValue: z.any().optional().nullable(),
  value: z.any(),
  secure: z.boolean(),
  updatedAt: z.string().or(z.date()),
});
const Resp = z.object({ settings: z.array(Setting) });

export const schema = {
  method: "GET",
  path: "/admin/settings",
  tags: ["Settings"],
  summary: "List settings",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
