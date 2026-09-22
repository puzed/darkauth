import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import {
  clearRefreshTokenCookie,
  clearSessionCookies,
  deleteOtherUserSignIns,
  deleteUserSignIn,
  listUserSignIns,
  requireSession,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJsonValidated, sendNoContent } from "../../utils/http.ts";

const SignInSchema = z.object({
  id: z.string(),
  created_at: z.string().nullable(),
  last_active_at: z.string().nullable(),
  expires_at: z.string(),
  user_agent: z.string().nullable(),
  current: z.boolean(),
});

const ResponseSchema = z.object({ sessions: z.array(SignInSchema) });

async function requireUser(context: Context, request: IncomingMessage) {
  const session = await requireSession(context, request, false);
  if (!session.sub) throw new UnauthorizedError("User session required");
  return { sub: session.sub, signInId: session.signInId };
}

export async function getUserSessions(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const { sub, signInId } = await requireUser(context, request);
  const signIns = await listUserSignIns(context, sub, signInId);
  sendJsonValidated(response, 200, { sessions: signIns }, ResponseSchema);
}

export const postUserSessionRevoke = withAudit({
  eventType: "USER_SIGN_IN_REVOKE",
  resourceType: "sign_in",
  skipBodyCapture: true,
})(async (context, request, response, targetSignInId): Promise<void> => {
  const { sub, signInId } = await requireUser(context, request);
  if (!targetSignInId) throw new ValidationError("Sign-in id is required");
  await deleteUserSignIn(context, sub, targetSignInId);
  if (targetSignInId === signInId) {
    clearSessionCookies(response, false);
    clearRefreshTokenCookie(response, false);
  }
  sendNoContent(response);
});

export const postUserSessionsRevokeOthers = withAudit({
  eventType: "USER_SIGN_IN_REVOKE_OTHERS",
  resourceType: "sign_in",
  skipBodyCapture: true,
})(async (context, request, response): Promise<void> => {
  const { sub, signInId } = await requireUser(context, request);
  await deleteOtherUserSignIns(context, sub, signInId);
  sendNoContent(response);
});

export const getUserSessionsSchema = {
  method: "GET",
  path: "/sessions",
  tags: ["Sessions"],
  summary: "listSignIns",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postUserSessionRevokeSchema = {
  method: "POST",
  path: "/sessions/{sign_in_id}/revoke",
  tags: ["Sessions"],
  summary: "revokeSignIn",
  params: z.object({ sign_in_id: z.string() }),
  responses: {
    204: { description: "No Content" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postUserSessionsRevokeOthersSchema = {
  method: "POST",
  path: "/sessions/revoke-others",
  tags: ["Sessions"],
  summary: "revokeOtherSignIns",
  responses: {
    204: { description: "No Content" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
