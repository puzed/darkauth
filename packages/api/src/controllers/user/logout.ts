import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { clients } from "../../db/schema.js";
import { InvalidRequestError } from "../../errors.js";
import {
  clearSessionCookieLocal,
  deleteSession,
  getSessionIdFromCookie,
} from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseFormBody, readBody, redirect, sendJson } from "../../utils/http.js";

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

    const postLogoutRedirectUri = formData.get("post_logout_redirect_uri");
    const clientId = formData.get("client_id");
    const state = formData.get("state");

    // Clear session if it exists
    const sessionId = getSessionIdFromCookie(request);
    if (sessionId) {
      await deleteSession(context, sessionId);
    }

    // Clear session cookie
    clearSessionCookieLocal(response, false, context.config.isDevelopment);

    // Validate post_logout_redirect_uri if provided
    if (postLogoutRedirectUri) {
      if (!clientId) {
        throw new InvalidRequestError(
          "client_id is required when post_logout_redirect_uri is provided"
        );
      }

      const client = await context.db.query.clients.findFirst({
        where: eq(clients.clientId, clientId),
      });

      if (!client) {
        throw new InvalidRequestError("Unknown client");
      }

      if (!client.postLogoutRedirectUris.includes(postLogoutRedirectUri)) {
        throw new InvalidRequestError("Invalid post_logout_redirect_uri");
      }

      // Prepare redirect URL with state if provided
      const redirectUrl = new URL(postLogoutRedirectUri);
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

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Resp = z.object({ success: z.boolean().optional() });
  registry.registerPath({
    method: "post",
    path: "/logout",
    tags: ["Auth"],
    summary: "User logout",
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
