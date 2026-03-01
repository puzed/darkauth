import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import {
  AlreadyInitializedError,
  ExpiredInstallTokenError,
  ForbiddenInstallTokenError,
} from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { isSystemInitialized } from "../../services/settings.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseQueryParams, sendJson } from "../../utils/http.ts";

const InstallResponseSchema = z.object({
  ok: z.boolean(),
  hasKek: z.boolean(),
  dbReady: z.boolean(),
  prefill: z.object({
    email: z.object({
      from: z.string().optional(),
      transport: z.string().optional(),
      smtpHost: z.string().optional(),
      smtpPort: z.number().optional(),
      smtpUser: z.string().optional(),
      smtpPassword: z.string().optional(),
    }),
  }),
});

export async function getInstall(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  context.logger.debug("[install:get] begin");
  const initialized = await isSystemInitialized(context);
  if (initialized) {
    throw new AlreadyInitializedError();
  }

  const params = parseQueryParams(request.url || "");
  const Query = z.object({ token: z.string() });
  const { token } = Query.parse(Object.fromEntries(params));
  if (token !== context.services.install?.token) {
    throw new ForbiddenInstallTokenError();
  }

  if (context.services.install?.createdAt) {
    const tokenAge = Date.now() - (context.services.install.createdAt || 0);
    if (tokenAge > 10 * 60 * 1000) {
      throw new ExpiredInstallTokenError();
    }
  }

  const hasKek =
    typeof context.config.kekPassphrase === "string" && context.config.kekPassphrase.length > 0;
  const dbReady = Boolean(context.services.install?.tempDb);
  const smtpPortRaw = process.env.EMAIL_SMTP_PORT;
  const smtpPort =
    smtpPortRaw && Number.isFinite(Number(smtpPortRaw)) ? Number(smtpPortRaw) : undefined;
  sendJson(response, 200, {
    ok: true,
    hasKek,
    dbReady,
    prefill: {
      email: {
        from: process.env.EMAIL_FROM,
        transport: process.env.EMAIL_TRANSPORT,
        smtpHost: process.env.EMAIL_SMTP_HOST,
        smtpPort,
        smtpUser: process.env.EMAIL_SMTP_USER,
        smtpPassword: process.env.EMAIL_SMTP_PASSWORD,
      },
    },
  });
}

export const schema = {
  method: "GET",
  path: "/install",
  tags: ["Installation"],
  summary: "Get installation status",
  query: z.object({
    token: z.string(),
  }),
  responses: {
    200: {
      description: "Installation status",
      content: {
        "application/json": {
          schema: InstallResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
