import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { getUserProfile, updateUserProfileName } from "../../models/users.ts";
import { getClientIp, logAuditEvent } from "../../services/audit.ts";
import {
  cancelPendingEmailChange,
  resendPendingEmailChangeVerification,
} from "../../services/emailVerification.ts";
import { requireSession, updateUserSessionsProfile } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const ProfileUpdateBody = z.object({
  name: z.string().trim().min(1).max(160),
});

async function getSessionSub(context: Context, request: IncomingMessage): Promise<string> {
  const session = await requireSession(context, request, false);
  if (!session.sub) throw new ValidationError("Invalid user session");
  return session.sub;
}

function getUserAgent(request: IncomingMessage): string | undefined {
  const value = request.headers["user-agent"];
  return typeof value === "string" ? value : undefined;
}

export async function getUserProfileController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sub = await getSessionSub(context, request);
  const profile = await getUserProfile(context, sub);
  sendJson(response, 200, profile);
}

export async function putUserProfile(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sub = await getSessionSub(context, request);
  const parsed = ProfileUpdateBody.parse(parseJsonSafely(await readBody(request)));
  const profile = await updateUserProfileName(context, sub, { name: parsed.name });
  await updateUserSessionsProfile(context, sub, { name: profile.name });
  await logAuditEvent(context, {
    eventType: "USER_PROFILE_NAME_UPDATED",
    method: request.method || "PUT",
    path: request.url || "/profile",
    cohort: "user",
    userId: sub,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
    success: true,
    statusCode: 200,
    resourceType: "user",
    resourceId: sub,
    action: "update",
    changes: { name: true },
  });
  sendJson(response, 200, profile);
}

export const postUserProfileEmailResend = withRateLimit("auth")(
  async (context: Context, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const sub = await getSessionSub(context, request);
    const result = await resendPendingEmailChangeVerification(context, { userSub: sub });
    sendJson(response, 200, {
      success: true,
      message: "Verification sent again.",
      ...result,
    });
  }
);

export async function deleteUserProfilePendingEmail(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sub = await getSessionSub(context, request);
  await cancelPendingEmailChange(context, { userSub: sub });
  const profile = await getUserProfile(context, sub);
  sendJson(response, 200, profile);
}

const ProfileResp = z.object({
  sub: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  emailVerified: z.boolean(),
  emailVerifiedAt: z.string().nullable(),
  pendingEmail: z.string().nullable(),
  pendingEmailSetAt: z.string().nullable(),
  signInEmail: z.string().nullable(),
});

export const getProfileSchema = {
  method: "GET",
  path: "/profile",
  tags: ["Users"],
  summary: "Read user profile",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ProfileResp } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const putProfileSchema = {
  method: "PUT",
  path: "/profile",
  tags: ["Users"],
  summary: "Update user profile",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: ProfileUpdateBody,
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ProfileResp } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postProfileEmailResendSchema = {
  method: "POST",
  path: "/profile/email/resend",
  tags: ["Users"],
  summary: "Resend pending email change verification",
  responses: {
    200: { description: "OK" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const deleteProfilePendingEmailSchema = {
  method: "DELETE",
  path: "/profile/email/pending",
  tags: ["Users"],
  summary: "Cancel pending email change",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ProfileResp } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
