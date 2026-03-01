import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { requestEmailChangeVerification } from "../../services/emailVerification.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const BodySchema = z.object({
  email: z.string().email(),
});

export async function putUserProfileEmail(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const session = await requireSession(context, request, false);
  if (!session.sub) {
    throw new ValidationError("Invalid user session");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = BodySchema.parse(raw);

  await requestEmailChangeVerification(context, {
    userSub: session.sub,
    email: parsed.email.trim().toLowerCase(),
  });

  sendJson(response, 200, {
    success: true,
    message: "Please verify your new email to complete the change",
  });
}

export const schema = {
  method: "PUT",
  path: "/profile/email",
  tags: ["Users"],
  summary: "Request email change verification",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: BodySchema,
  },
  responses: {
    200: { description: "OK" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
