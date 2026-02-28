import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClient } from "../../models/clients.ts";
import {
  clearRefreshTokenCookie,
  clearSessionCookies,
  deleteSession,
  getSessionId,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseFormBody, readBody, redirect, sendJson } from "../../utils/http.ts";

// Response schema used in OpenAPI definition
const Resp = z.object({ success: z.boolean().optional() });

export const postLogout = withAudit({
  eventType: "USER_LOGOUT",
  resourceType: "user",
  extractResourceId: (body) =>
    body && typeof body === "object" && "client_id" in body
      ? (body as { client_id?: string }).client_id
      : undefined,
})(
  async (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ..._params: unknown[]
  ): Promise<void> => {
    const body = await readBody(request);
    const formData = parseFormBody(body);

    const input = {
      post_logout_redirect_uri: formData.get("post_logout_redirect_uri") || undefined,
      client_id: formData.get("client_id") || undefined,
      state: formData.get("state") || undefined,
    } as { post_logout_redirect_uri?: string; client_id?: string; state?: string };
    const Req = z
      .object({
        post_logout_redirect_uri: z.string().optional(),
        client_id: z.string().optional(),
        state: z.string().optional(),
      })
      .refine((d) => !d.post_logout_redirect_uri || !!d.client_id, {
        message: "client_id is required when post_logout_redirect_uri is provided",
        path: ["client_id"],
      });
    const parsed = Req.safeParse(input);
    if (!parsed.success)
      throw new InvalidRequestError(parsed.error.issues[0]?.message || "Invalid request");
    const { post_logout_redirect_uri, client_id, state } = parsed.data;

    // Clear session if it exists
    const sessionId = getSessionId(request);
    if (sessionId) {
      await deleteSession(context, sessionId);
    }
    clearSessionCookies(response, false);
    clearRefreshTokenCookie(response, false);

    // Validate post_logout_redirect_uri if provided
    if (post_logout_redirect_uri) {
      const client = await getClient(context, client_id as string);

      if (!client) {
        throw new InvalidRequestError("Unknown client");
      }

      if (!client.postLogoutRedirectUris.includes(post_logout_redirect_uri)) {
        throw new InvalidRequestError("Invalid post_logout_redirect_uri");
      }

      // Prepare redirect URL with state if provided
      const redirectUrl = new URL(post_logout_redirect_uri);
      if (state) {
        redirectUrl.searchParams.set("state", state);
      }

      redirect(response, redirectUrl.toString());
    } else {
      // Return JSON response indicating successful logout
      sendJson(response, 200, {
        message: "Logged out successfully",
        logged_out: true,
      });
    }
  }
);

// Export OpenAPI schema definition
export const schema = {
  method: "POST",
  path: "/logout",
  tags: ["Auth"],
  summary: "User logout",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
