import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod/v4";
import { ForbiddenError, UnauthorizedError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getUserAccess } from "../../models/access.js";
import { getDirectoryEntry, searchDirectory } from "../../models/usersDirectory.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJson } from "../../utils/http.js";

const usersReadPermissionKey = "darkauth.users:read";

function hasRequiredPermission(permissions: unknown): boolean {
  return (
    Array.isArray(permissions) &&
    permissions.some((permission) => permission === usersReadPermissionKey)
  );
}

async function requireUsersReadPermission(context: Context, request: IncomingMessage) {
  const auth = request.headers.authorization || "";
  const tokenMatch = /^Bearer\s+(.+)$/.exec(auth);

  if (tokenMatch?.[1]) {
    const JWKS = createRemoteJWKSet(new URL(`${context.config.issuer}/.well-known/jwks.json`));
    try {
      const verified = await jwtVerify(tokenMatch[1], JWKS, { issuer: context.config.issuer });
      if (!hasRequiredPermission(verified.payload.permissions)) {
        throw new ForbiddenError("Missing required permission: darkauth.users:read");
      }
      return;
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error;
      }
    }
  }

  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) {
    throw new UnauthorizedError("User session required");
  }
  const access = await getUserAccess(context, sessionData.sub);
  if (!access.permissions.includes(usersReadPermissionKey)) {
    throw new ForbiddenError("Missing required permission: darkauth.users:read");
  }
}

export async function getUserDirectoryEntry(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  sub: string
) {
  await requireUsersReadPermission(context, request);
  const Params = z.object({ sub: z.string() });
  const { sub: parsedSub } = Params.parse({ sub });
  context.logger.info({ sub: parsedSub }, "user directory get");
  const row = await getDirectoryEntry(context, parsedSub);
  if (!row) {
    sendJson(response, 404, { error: "user_not_found" });
    return;
  }
  sendJson(response, 200, row);
}

export async function searchUserDirectory(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireUsersReadPermission(context, request);
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({ q: z.string().optional() });
  const { q: rawQ } = Query.parse(Object.fromEntries(url.searchParams));
  const q = (rawQ || "").trim();
  if (!q) {
    sendJson(response, 200, { users: [] });
    return;
  }

  context.logger.info({ q }, "users search");
  const rows = await searchDirectory(context, q);

  type JwkLike = { kty?: unknown };
  const isJwkWithStringKty = (x: unknown): x is { kty: string } =>
    typeof x === "object" && x !== null && typeof (x as JwkLike).kty === "string";
  const filtered = rows.filter((r) => isJwkWithStringKty(r.public_key_jwk));
  const missing = rows.filter((r) => !r.public_key_jwk).map((r) => r.sub);
  const invalid = rows
    .filter((r) => r.public_key_jwk && !isJwkWithStringKty(r.public_key_jwk))
    .map((r) => r.sub);
  context.logger.info(
    {
      count: rows.length,
      returned: filtered.length,
      missing_pubkey_count: missing.length,
      invalid_pubkey_count: invalid.length,
    },
    "users search results"
  );
  sendJson(response, 200, { users: filtered });
}

const User = z.object({
  sub: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

export const schema = {
  method: "GET",
  path: "/users",
  tags: ["Users Directory"],
  summary: "Search users",
  query: z.object({ q: z.string().optional() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ users: z.array(User) }) } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const getUserSchema = {
  method: "GET",
  path: "/users/{sub}",
  tags: ["Users Directory"],
  summary: "Get user",
  params: z.object({ sub: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: User } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
