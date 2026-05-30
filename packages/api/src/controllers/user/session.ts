import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, InvalidRequestError, UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClient } from "../../models/clients.ts";
import { getOrganizationForUser } from "../../models/organizations.ts";
import { getUserBySub } from "../../models/users.ts";
import { getClientIp, logAuditEvent } from "../../services/audit.ts";
import {
  getSession as getSessionData,
  getSessionId,
  updateSession,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

type SwitchReturnClient = {
  redirectUris: string[];
  postLogoutRedirectUris: string[];
};

function isLocalReturnTo(returnTo: string): boolean {
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) {
    return false;
  }
  return [...returnTo].every((char) => {
    const code = char.charCodeAt(0);
    return code > 31 && code !== 127;
  });
}

function getAllowedReturnOrigins(client: SwitchReturnClient): Set<string> {
  const origins = new Set<string>();
  for (const uri of [...client.redirectUris, ...client.postLogoutRedirectUris]) {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        origins.add(parsed.origin);
      }
    } catch {}
  }
  return origins;
}

export async function resolveSwitchOrganizationReturnTo(
  context: Context,
  returnTo?: string,
  clientId?: string
): Promise<string | undefined> {
  if (!returnTo) return undefined;
  if (isLocalReturnTo(returnTo)) return returnTo;
  if (!clientId) throw new InvalidRequestError("Invalid return_to");

  let parsed: URL;
  try {
    parsed = new URL(returnTo);
  } catch {
    throw new InvalidRequestError("Invalid return_to");
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new InvalidRequestError("Invalid return_to");
  }

  const client = await getClient(context, clientId);
  if (!client) throw new InvalidRequestError("Invalid return_to");

  if (!getAllowedReturnOrigins(client).has(parsed.origin)) {
    throw new InvalidRequestError("Invalid return_to");
  }

  return parsed.toString();
}

export async function getSession(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    throw new UnauthorizedError("No session cookie found");
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

  const user = sessionData.sub ? await getUserBySub(context, sessionData.sub) : null;
  const resetRequired = !!user?.passwordResetRequired;

  const sessionInfo = {
    sub: sessionData.sub,
    email: user?.email || sessionData.email,
    name: user?.name || sessionData.name,
    emailVerified: !!user?.emailVerifiedAt,
    emailVerifiedAt: user?.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    pendingEmail: user?.pendingEmail || null,
    pendingEmailSetAt: user?.pendingEmailSetAt ? user.pendingEmailSetAt.toISOString() : null,
    signInEmail: user?.opaqueLoginIdentity || user?.email || sessionData.email || null,
    authenticated: true,
    passwordResetRequired: resetRequired,
    otpRequired: !!sessionData.otpRequired,
    otpVerified: !!sessionData.otpVerified,
    keyState:
      sessionData.keyState === "unlocked" || sessionData.keyState === "setup_required"
        ? sessionData.keyState
        : "locked",
    organizationId:
      typeof sessionData.organizationId === "string" ? sessionData.organizationId : undefined,
    organizationSlug:
      typeof sessionData.organizationSlug === "string" ? sessionData.organizationSlug : undefined,
  };

  sendJson(response, 200, sessionInfo);
}

export async function postSessionOrganization(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    throw new UnauthorizedError("No session cookie found");
  }

  const sessionData = await getSessionData(context, sessionId);
  if (!sessionData) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  if (!sessionData.sub) {
    throw new UnauthorizedError("User session required");
  }

  const Req = z.object({
    organization_id: z.string().uuid(),
    return_to: z.string().optional(),
    client_id: z.string().optional(),
  });
  const parsed = Req.parse(parseJsonSafely(await readBody(request)));
  const organization = await getOrganizationForUser(
    context,
    sessionData.sub,
    parsed.organization_id
  );
  if (!organization) {
    throw new ForbiddenError("Your account cannot sign in with the selected organization.");
  }

  const redirectUrl = await resolveSwitchOrganizationReturnTo(
    context,
    parsed.return_to,
    parsed.client_id
  );
  const previousOrganizationId =
    typeof sessionData.organizationId === "string" ? sessionData.organizationId : undefined;
  const nextSessionData = {
    ...sessionData,
    organizationId: organization.organizationId,
    organizationSlug: organization.slug || undefined,
  };
  await updateSession(context, sessionId, nextSessionData);

  await logAuditEvent(context, {
    eventType: "ORGANIZATION_SWITCHED",
    method: request.method || "POST",
    path: request.url || "/session/organization",
    cohort: "user",
    userId: sessionData.sub,
    clientId:
      parsed.client_id ||
      (typeof sessionData.clientId === "string" ? sessionData.clientId : undefined),
    ipAddress: getClientIp(request),
    userAgent: Array.isArray(request.headers["user-agent"])
      ? request.headers["user-agent"][0]
      : request.headers["user-agent"],
    success: true,
    statusCode: 200,
    resourceType: "organization",
    resourceId: organization.organizationId,
    action: "switch",
    details: {
      previousOrganizationId: previousOrganizationId || null,
      organizationId: organization.organizationId,
      organizationSlug: organization.slug,
    },
  });

  sendJson(response, 200, {
    organizationId: organization.organizationId,
    organizationSlug: organization.slug,
    redirectUrl,
  });
}

const Resp = z.object({
  authenticated: z.boolean(),
  sub: z.string().optional(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  emailVerifiedAt: z.string().nullable().optional(),
  pendingEmail: z.string().nullable().optional(),
  pendingEmailSetAt: z.string().nullable().optional(),
  signInEmail: z.string().nullable().optional(),
  otpRequired: z.boolean().optional(),
  otpVerified: z.boolean().optional(),
  keyState: z.enum(["locked", "unlocked", "setup_required"]).optional(),
  organizationId: z.string().optional(),
  organizationSlug: z.string().nullable().optional(),
});

const OrgReq = z.object({
  organization_id: z.string().uuid(),
  return_to: z.string().optional(),
  client_id: z.string().optional(),
});

const OrgResp = z.object({
  organizationId: z.string(),
  organizationSlug: z.string().nullable(),
  redirectUrl: z.string().optional(),
});

export const schema = {
  method: "GET",
  path: "/session",
  tags: ["Auth"],
  summary: "Get user session",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const organizationSchema = {
  method: "POST",
  path: "/session/organization",
  tags: ["Auth"],
  summary: "Set current user session organization",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: OrgReq,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: OrgResp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
