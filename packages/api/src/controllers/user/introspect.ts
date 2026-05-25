import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { verifyJWT } from "../../services/jwks.ts";
import { getActiveRefreshTokenSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema, SessionData } from "../../types.ts";
import { parseFormBody, readBody, sendJson } from "../../utils/http.ts";
import { authenticateConfidentialClient } from "./oauthClientAuth.ts";

function hasAudience(payload: Record<string, unknown>, clientId: string): boolean {
  if (payload.aud === clientId) return true;
  return Array.isArray(payload.aud) && payload.aud.some((aud) => aud === clientId);
}

function numberDate(date: Date | null): number | undefined {
  return date ? Math.floor(date.getTime() / 1000) : undefined;
}

function activeJwtResponse(payload: Record<string, unknown>, clientId: string) {
  if (!hasAudience(payload, clientId) && payload.azp !== clientId) return { active: false };
  const response: Record<string, unknown> = {
    active: true,
    token_type: "Bearer",
    client_id: typeof payload.azp === "string" ? payload.azp : clientId,
    sub: payload.sub,
    scope: payload.scope,
    exp: payload.exp,
    iat: payload.iat,
    iss: payload.iss,
    aud: payload.aud,
  };
  if (typeof payload.org_id === "string") response.org_id = payload.org_id;
  if (typeof payload.org_slug === "string") response.org_slug = payload.org_slug;
  if (Array.isArray(payload.roles)) response.roles = payload.roles;
  if (Array.isArray(payload.permissions)) response.permissions = payload.permissions;
  return response;
}

async function introspectJwt(context: Context, token: string, clientId: string) {
  try {
    const payload = (await verifyJWT(context, token)) as Record<string, unknown>;
    if (payload.token_use !== "access") return { active: false };
    return activeJwtResponse(payload, clientId);
  } catch {
    return { active: false };
  }
}

async function introspectRefreshToken(context: Context, token: string, clientId: string) {
  const session = await getActiveRefreshTokenSession(context, token);
  if (!session) return { active: false };
  const data = session.data as SessionData;
  const issuedClientId = typeof data.clientId === "string" ? data.clientId : null;
  if (!issuedClientId || issuedClientId !== clientId) return { active: false };
  return {
    active: true,
    token_type: "refresh_token",
    client_id: issuedClientId,
    sub: session.userSub || data.sub,
    scope: typeof data.scope === "string" ? data.scope : undefined,
    exp: numberDate(session.refreshTokenExpiresAt),
    iat: numberDate(session.createdAt),
  };
}

async function postIntrospectHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const client = await authenticateConfidentialClient(context, request);
  const formData = parseFormBody(await readBody(request));
  const token = formData.get("token") || "";
  const hint = formData.get("token_type_hint") || "";
  if (!token) throw new InvalidRequestError("token is required");
  if (hint === "refresh_token") {
    sendJson(response, 200, await introspectRefreshToken(context, token, client.clientId));
    return;
  }
  const jwtResult = await introspectJwt(context, token, client.clientId);
  if (jwtResult.active) {
    sendJson(response, 200, jwtResult);
    return;
  }
  sendJson(response, 200, await introspectRefreshToken(context, token, client.clientId));
}

export const postIntrospect = withRateLimit("token")(postIntrospectHandler);

const Req = z.object({
  token: z.string().min(1),
  token_type_hint: z.string().optional(),
});

const Resp = z
  .object({
    active: z.boolean(),
  })
  .catchall(z.unknown());

export const schema = {
  method: "POST",
  path: "/introspect",
  tags: ["Auth"],
  summary: "Token introspection endpoint",
  body: {
    required: true,
    contentType: "application/x-www-form-urlencoded",
    schema: Req,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
