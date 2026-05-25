import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { validatePasswordResetTokenForDisplay } from "../../services/passwordReset.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseQueryParams, sendJson } from "../../utils/http.ts";

const PasswordResetTokenQuery = z.object({
  token: z.string().min(1),
});

async function getPasswordResetTokenHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const query = Object.fromEntries(parseQueryParams(request.url || ""));
  const parsed = PasswordResetTokenQuery.safeParse(query);
  if (!parsed.success) {
    sendJson(response, 200, { valid: false });
    return;
  }
  const result = await validatePasswordResetTokenForDisplay(context, parsed.data.token);
  sendJson(response, 200, result);
}

export const getPasswordResetToken = withRateLimit("password_reset")(getPasswordResetTokenHandler);

export const schema = {
  method: "GET",
  path: "/password/reset/token",
  tags: ["OPAQUE"],
  summary: "passwordResetToken",
  query: PasswordResetTokenQuery,
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
