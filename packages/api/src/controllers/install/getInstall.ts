import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import {
  AlreadyInitializedError,
  ExpiredInstallTokenError,
  ForbiddenInstallTokenError,
} from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { isSystemInitialized } from "../../services/settings.js";
import type { Context, ControllerSchema } from "../../types.js";
import { parseQueryParams, sendJson } from "../../utils/http.js";

const InstallResponseSchema = z.object({
  ok: z.boolean(),
  hasKek: z.boolean(),
  dbReady: z.boolean(),
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
  sendJson(response, 200, { ok: true, hasKek, dbReady });
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
