import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { users } from "../../db/schema.js";
import { UnauthorizedError } from "../../errors.js";
import { getSession as getSessionData, getSessionId } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getSession(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    throw new UnauthorizedError("No session token found");
  }

  const sessionData = await getSessionData(context, sessionId);
  try {
    context.logger.info(
      { event: "user.session.read", sessionId, found: !!sessionData },
      "user session read"
    );
  } catch {}

  if (!sessionData) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  if (!sessionData.sub) {
    throw new UnauthorizedError("User session required");
  }

  let resetRequired = false;
  if (sessionData.sub) {
    const user = await context.db.query.users.findFirst({
      where: eq(users.sub, sessionData.sub),
    });
    resetRequired = !!user?.passwordResetRequired;
  }

  const sessionInfo = {
    sub: sessionData.sub,
    email: sessionData.email,
    name: sessionData.name,
    authenticated: true,
    passwordResetRequired: resetRequired,
  };

  sendJson(response, 200, sessionInfo);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Resp = z.object({
    authenticated: z.boolean(),
    sub: z.string().optional(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  });
  registry.registerPath({
    method: "get",
    path: "/session",
    tags: ["Auth"],
    summary: "Get user session",
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
