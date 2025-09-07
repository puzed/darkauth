import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { wrappedRootKeys } from "../../db/schema.js";
import { NotFoundError, UnauthorizedError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { toBase64Url } from "../../utils/crypto.js";
import { sendJson } from "../../utils/http.js";

export async function getWrappedDrk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  try {
    // Require authenticated session
    const sessionData = await requireSession(context, request, false);

    if (!sessionData.sub) {
      throw new UnauthorizedError("User session required");
    }

    // Look up user's wrapped DRK from wrappedRootKeys table
    const wrappedRootKey = await context.db.query.wrappedRootKeys.findFirst({
      where: eq(wrappedRootKeys.sub, sessionData.sub),
    });

    if (!wrappedRootKey) {
      throw new NotFoundError("Wrapped DRK not found");
    }

    // Return base64url encoded wrapped DRK
    const wrappedRaw = wrappedRootKey.wrappedDrk || Buffer.alloc(0);

    // Ensure we have a proper Buffer (PGlite might return Uint8Array)
    const wrapped = Buffer.isBuffer(wrappedRaw) ? wrappedRaw : Buffer.from(wrappedRaw);

    const wrappedDrkBase64Url = toBase64Url(wrapped);

    sendJson(response, 200, {
      wrapped_drk: wrappedDrkBase64Url,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      sendJson(response, 401, { error: error.message });
    } else if (error instanceof NotFoundError) {
      sendJson(response, 404, { error: error.message });
    } else {
      console.error("Error in getWrappedDrk:", error);
      sendJson(response, 500, { error: "Internal server error" });
    }
  }
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/crypto/wrapped-drk",
    tags: ["Crypto"],
    summary: "wrappedDrk",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
