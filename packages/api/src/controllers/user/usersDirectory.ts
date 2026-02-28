import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod/v4";
import { ForbiddenError, UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClient } from "../../models/clients.ts";
import { getUserBySubWithGroups, getUsersBySubsWithGroups, listUsers } from "../../models/users.ts";
import { getDirectoryEntry, searchDirectory } from "../../models/usersDirectory.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

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
type UsersReadPermission = { mode: UsersReadMode; organizationId?: string };

export function resolveUsersReadModeFromPayload(
  payload: Record<string, unknown>
): UsersReadMode | null {
  if (
    payload.token_use === "access" &&
    payload.grant_type === "client_credentials" &&
    hasRequiredScope(payload.scope)
  ) {
    return "management";
  }
  if (hasRequiredPermission(payload.permissions)) {
    return "directory";
  }

  return null;
}

function resolveAuthorizedParty(payload: Record<string, unknown>): string | null {
  if (typeof payload.azp !== "string" || payload.azp.length === 0) return null;
  return payload.azp;
}

function hasMatchingAudience(payload: Record<string, unknown>, clientId: string): boolean {
  if (typeof payload.aud === "string") return payload.aud === clientId;
  if (Array.isArray(payload.aud)) return payload.aud.some((aud) => aud === clientId);
  return false;
}

async function requireUsersReadPermission(
  context: Context,
  request: IncomingMessage
): Promise<UsersReadPermission> {
  const auth = request.headers.authorization || "";
  const tokenMatch = /^Bearer\s+(.+)$/.exec(auth);

  if (tokenMatch?.[1]) {
    const JWKS = createRemoteJWKSet(new URL(`${context.config.issuer}/.well-known/jwks.json`));
    try {
      const verified = await jwtVerify(tokenMatch[1], JWKS, { issuer: context.config.issuer });
      const payload = verified.payload as Record<string, unknown>;

      const mode = resolveUsersReadModeFromPayload(payload);
      if (mode === "directory") {
        return { mode };
      }
      if (mode === "management") {
        const clientId = resolveAuthorizedParty(payload);
        if (!clientId || !hasMatchingAudience(payload, clientId)) {
          throw new ForbiddenError("Missing required permission/scope: darkauth.users:read");
        }
        const client = await getClient(context, clientId);
        if (!client || !client.grantTypes.includes("client_credentials")) {
          throw new ForbiddenError("Missing required permission/scope: darkauth.users:read");
        }
        return { mode };
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
  const { getUserOrgAccess, resolveOrganizationContext } = await import("../../models/rbac.ts");
  const { organizationId } = await resolveOrganizationContext(
    context,
    sessionData.sub,
    sessionData.organizationId
  );
  const access = await getUserOrgAccess(context, sessionData.sub, organizationId);
  if (!access.permissions.includes(usersReadPermissionKey)) {
    throw new ForbiddenError("Missing required permission: darkauth.users:read");
  }

  return { mode: "directory", organizationId };
}

export async function getUserDirectoryEntry(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  sub: string
) {
  const permission = await requireUsersReadPermission(context, request);
  const Params = z.object({ sub: z.string() });
  const { sub: parsedSub } = Params.parse({ sub });

  if (permission.mode === "management") {
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
  const row = await getDirectoryEntry(context, parsedSub, permission.organizationId);
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
  const permission = await requireUsersReadPermission(context, request);

  const url = new URL(request.url || "", `http://${request.headers.host}`);

  if (permission.mode === "management") {
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
  const rows = await searchDirectory(context, q, permission.organizationId);

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
