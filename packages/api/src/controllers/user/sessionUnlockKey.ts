import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { isScimSessionUnlockAllowed } from "../../models/scimPolicy.ts";
import {
  deleteSessionUnlockKey,
  ensureSessionUnlockKey,
  getSessionId,
  requireSession,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated, sendNoContent } from "../../utils/http.ts";

const ResponseSchema = z.object({ key: z.string() });

async function requireUserSession(context: Context, request: IncomingMessage) {
  const session = await requireSession(context, request, false);
  const sessionId = getSessionId(request, false);
  if (!session.sub || !sessionId) throw new UnauthorizedError("User session required");
  return { sub: session.sub, sessionId, signInId: session.signInId };
}

export async function postSessionUnlockKey(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const { sub, sessionId, signInId } = await requireUserSession(context, request);
  if (!signInId) throw new ForbiddenError("Session unlock requires a sign-in session");
  if (!(await isScimSessionUnlockAllowed(context, sub))) {
    throw new ForbiddenError("Session unlock is disabled by policy");
  }
  const key = await ensureSessionUnlockKey(context, sessionId);
  if (!key) throw new UnauthorizedError("Invalid or expired session");
  response.setHeader("Cache-Control", "no-store");
  sendJsonValidated(response, 200, { key }, ResponseSchema);
}

export async function deleteSessionUnlockKeyController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const { sessionId } = await requireUserSession(context, request);
  await deleteSessionUnlockKey(context, sessionId);
  sendNoContent(response);
}

export const postSessionUnlockKeySchema = {
  method: "POST",
  path: "/crypto/session-unlock-key",
  tags: ["Crypto"],
  summary: "getOrCreateSessionUnlockKey",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const deleteSessionUnlockKeySchema = {
  method: "DELETE",
  path: "/crypto/session-unlock-key",
  tags: ["Crypto"],
  summary: "deleteSessionUnlockKey",
  responses: {
    204: { description: "No Content" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
