import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  AlreadyInitializedError,
  ExpiredInstallTokenError,
  ForbiddenInstallTokenError,
} from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { isSystemInitialized } from "../../services/settings.js";
import type { Context } from "../../types.js";
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
  const token = params.get("token");

  if (!token || token !== context.services.install?.token) {
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

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/install",
    tags: ["Installation"],
    summary: "Get installation status",
    request: {
      query: z.object({
        token: z.string(),
      }),
    },
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
  });
}
