import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { finishUserPasswordSetForAdmin } from "../../models/passwords.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema, HttpHandler } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.ts";

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
    await requireOpaqueService(context);
    const session = await requireSession(context, request, true);
    if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

    const body = await readBody(request);
    const parsed = UserPasswordSetFinishRequestSchema.parse(parseJsonSafely(body));

    const record = parsed.record;
    const exportKeyHash = parsed.export_key_hash;

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

export const schema = {
  method: "POST",
  path: "/admin/users/{userSub}/password-set-finish",
  tags: ["Users"],
  summary: "Finish setting user password",
  params: z.object({
    userSub: z.string(),
  }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: UserPasswordSetFinishRequestSchema,
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
} as const satisfies ControllerSchema;
