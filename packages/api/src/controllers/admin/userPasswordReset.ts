import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ForbiddenError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { setUserPasswordResetRequired } from "../../models/users.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJson } from "../../utils/http.js";

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

async function postUserPasswordResetHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const userSub = params[0];
  if (!userSub) {
    throw new ValidationError("User sub is required");
  }
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") {
    throw new ForbiddenError("Write permission required");
  }

  const result = await setUserPasswordResetRequired(context, userSub, true);
  sendJson(response, 200, result);
}

export const postUserPasswordReset = withAudit({
  eventType: "USER_PASSWORD_RESET_MARK",
  resourceType: "user",
  extractResourceId: (_body, params) => params[0],
})(postUserPasswordResetHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/users/{userSub}/password-reset",
    tags: ["Users"],
    summary: "Mark user for password reset",
    request: {
      params: z.object({
        userSub: z.string(),
      }),
    },
    responses: {
      200: {
        description: "User marked for password reset",
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
