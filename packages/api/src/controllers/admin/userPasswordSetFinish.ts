import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { finishUserPasswordSetForAdmin } from "../../models/passwords.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, HttpHandler } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

const UserPasswordSetFinishRequestSchema = z.object({
  record: z.string(),
  export_key_hash: z.string(),
});

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

async function postUserPasswordSetFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  userSub: string
): Promise<void> {
  try {
    if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
    const session = await requireSession(context, request, true);
    if (!session.adminRole) throw new ValidationError("Admin privileges required");

    const body = await readBody(request);
    const data = parseJsonSafely(body) as Record<string, unknown>;
    if (!data.record || typeof data.record !== "string") {
      throw new ValidationError("Missing or invalid record field");
    }
    if (!data.export_key_hash || typeof data.export_key_hash !== "string") {
      throw new ValidationError("Missing or invalid export_key_hash field");
    }

    const record = data.record as string;
    const exportKeyHash = data.export_key_hash as string;

    const recordBuffer = fromBase64Url(record);
    const result = await finishUserPasswordSetForAdmin(context, {
      userSub,
      recordBuffer,
      exportKeyHash,
    });

    sendJson(response, 200, result);
  } catch (error) {
    sendError(response, error as Error);
  }
}

export const postUserPasswordSetFinish = withAudit({
  eventType: "USER_PASSWORD_SET",
  resourceType: "user",
  extractResourceId: (_b, params) => params[0],
})(postUserPasswordSetFinishHandler as HttpHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/users/{userSub}/password-set-finish",
    tags: ["Users"],
    summary: "Finish setting user password",
    request: {
      params: z.object({
        userSub: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: UserPasswordSetFinishRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Password set successfully",
        content: {
          "application/json": {
            schema: SuccessResponseSchema,
          },
        },
      },
      ...genericErrors,
    },
  });
}
