import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { getUserBySub } from "../../models/users.ts";
import { verifyJWT } from "../../services/jwks.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

function getBearerToken(request: IncomingMessage): string {
  const header = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) throw new UnauthorizedError("Bearer token required");
  return match[1];
}

function hasScope(scopeClaim: unknown, scope: string): boolean {
  if (typeof scopeClaim !== "string") return false;
  return scopeClaim
    .split(/\s+/)
    .filter((item) => item.length > 0)
    .includes(scope);
}

async function handleUserinfoHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const token = getBearerToken(request);
    const payload = await verifyJWT(context, token);
    if (payload.token_use !== "access") throw new UnauthorizedError("Invalid bearer token");
    if (payload.grant_type === "client_credentials") {
      throw new UnauthorizedError("Invalid bearer token");
    }
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new UnauthorizedError("Invalid bearer token");
    }
    const user = await getUserBySub(context, payload.sub);
    if (!user) throw new UnauthorizedError("Invalid bearer token");
    const body: Record<string, unknown> = { sub: user.sub };
    if (hasScope(payload.scope, "profile") && user.name) body.name = user.name;
    if (hasScope(payload.scope, "email")) {
      if (user.email) body.email = user.email;
      body.email_verified = !!user.emailVerifiedAt;
    }
    if (typeof payload.org_id === "string") body.org_id = payload.org_id;
    if (typeof payload.org_slug === "string") body.org_slug = payload.org_slug;
    if (Array.isArray(payload.roles)) body.roles = payload.roles;
    if (Array.isArray(payload.permissions)) body.permissions = payload.permissions;
    sendJson(response, 200, body);
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError("Invalid bearer token");
  }
}

export const handleUserinfo = withRateLimit("general")(handleUserinfoHandler);

const Resp = z
  .object({
    sub: z.string(),
    name: z.string().optional(),
    email: z.string().email().optional(),
    email_verified: z.boolean().optional(),
    org_id: z.string().optional(),
    org_slug: z.string().optional(),
    roles: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());

export const schema = {
  method: "GET",
  path: "/userinfo",
  tags: ["Auth"],
  summary: "UserInfo endpoint",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const postSchema = {
  method: "POST",
  path: "/userinfo",
  tags: ["Auth"],
  summary: "UserInfo endpoint",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
