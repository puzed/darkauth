import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { sendTestEmailToCurrentAdmin } from "../../services/email.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

export async function postAdminEmailTest(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const session = await requireSession(context, request, true);
  if (!session.adminRole || session.adminRole === "read") {
    throw new ForbiddenError("Write access required");
  }
  if (!session.email) {
    throw new ValidationError("Admin email is missing from session");
  }

  await sendTestEmailToCurrentAdmin(context, session.email);
  sendJson(response, 200, { success: true });
}

const Resp = z.object({ success: z.boolean() });

export const schema = {
  method: "POST",
  path: "/admin/settings/email/test",
  tags: ["Settings"],
  summary: "Send SMTP test email",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: Resp } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
