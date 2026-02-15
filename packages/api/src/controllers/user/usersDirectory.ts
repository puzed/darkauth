import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod/v4";
import { ForbiddenError, UnauthorizedError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getUserAccess } from "../../models/access.js";
import { getUserBySubWithGroups, getUsersBySubsWithGroups, listUsers } from "../../models/users.js";
import { getDirectoryEntry, searchDirectory } from "../../models/usersDirectory.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJson } from "../../utils/http.js";

const usersReadPermissionKey = "darkauth.users:read";

export function hasRequiredPermission(permissions: unknown): boolean {
  return (
    Array.isArray(permissions) &&
    permissions.some((permission) => permission === usersReadPermissionKey)
  );
}

export function hasRequiredScope(scopeClaim: unknown): boolean {
  if (typeof scopeClaim === "string") {
    return scopeClaim
      .split(/\s+/)
      .filter((scope) => scope.length > 0)
      .includes(usersReadPermissionKey);
  }
  if (Array.isArray(scopeClaim)) {
    return scopeClaim.some((scope) => scope === usersReadPermissionKey);
  }
  return false;
}

type UsersReadMode = "directory" | "management";

export function resolveUsersReadModeFromPayload(
  payload: Record<string, unknown>
): UsersReadMode | null {
  if (payload.grant_type === "client_credentials" && hasRequiredScope(payload.scope)) {
    return "management";
  }

  if (hasRequiredPermission(payload.permissions)) {
    return "directory";
  }

  return null;
}

async function requireUsersReadPermission(
  context: Context,
  request: IncomingMessage
): Promise<UsersReadMode> {
  const auth = request.headers.authorization || "";
  const tokenMatch = /^Bearer\s+(.+)$/.exec(auth);

  if (tokenMatch?.[1]) {
    const JWKS = createRemoteJWKSet(new URL(`${context.config.issuer}/.well-known/jwks.json`));
    try {
      const verified = await jwtVerify(tokenMatch[1], JWKS, { issuer: context.config.issuer });
      const payload = verified.payload as Record<string, unknown>;

      const mode = resolveUsersReadModeFromPayload(payload);
      if (mode) {
        return mode;
      }

      throw new ForbiddenError("Missing required permission/scope: darkauth.users:read");
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error;
      }
      throw new UnauthorizedError("Invalid bearer token");
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

  return "directory";
}

export async function getUserDirectoryEntry(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  sub: string
) {
  const mode = await requireUsersReadPermission(context, request);
  const Params = z.object({ sub: z.string() });
  const { sub: parsedSub } = Params.parse({ sub });

  if (mode === "management") {
    context.logger.info({ sub: parsedSub }, "users management get");
    const user = await getUserBySubWithGroups(context, parsedSub);
    if (!user) {
      sendJson(response, 404, { error: "user_not_found" });
      return;
    }
    sendJson(response, 200, user);
    return;
  }

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
  const mode = await requireUsersReadPermission(context, request);

  const url = new URL(request.url || "", `http://${request.headers.host}`);

  if (mode === "management") {
    const Query = z.object({
      sids: z.string().optional(),
      q: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    });
    const query = Query.parse(Object.fromEntries(url.searchParams));

    const sids = (query.sids || "")
      .split(",")
      .map((sid) => sid.trim())
      .filter((sid) => sid.length > 0)
      .slice(0, 100);
    if (sids.length > 0) {
      const users = await getUsersBySubsWithGroups(context, sids);
      sendJson(response, 200, { users });
      return;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search || query.q;
    const result = await listUsers(context, {
      page,
      limit,
      search,
    });
    sendJson(response, 200, result);
    return;
  }

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

const DirectoryUser = z.object({
  sub: z.string(),
  display_name: z.string().nullable().optional(),
  public_key_jwk: z.unknown().optional(),
});

const ManagementUser = z.object({
  sub: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  passwordResetRequired: z.boolean().optional(),
  groups: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
});

export const schema = {
  method: "GET",
  path: "/users",
  tags: ["Users Directory"],
  summary: "Search users",
  query: z.object({
    q: z.string().optional(),
    search: z.string().optional(),
    sids: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z
            .object({ users: z.array(z.union([DirectoryUser, ManagementUser])) })
            .passthrough(),
        },
      },
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
    200: {
      description: "OK",
      content: { "application/json": { schema: z.union([DirectoryUser, ManagementUser]) } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
