import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq, ilike, or } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { userEncryptionKeys, users } from "../../db/schema.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getUserDirectoryEntry(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  sub: string
) {
  const auth = request.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (m) {
    const JWKS = createRemoteJWKSet(new URL(`${context.config.issuer}/.well-known/jwks.json`));
    await jwtVerify(m?.[1] || "", JWKS, { issuer: context.config.issuer }).catch(async () => {
      await requireSession(context, request, false);
    });
  } else {
    await requireSession(context, request, false);
  }
  console.log("[api] user directory get", { sub });
  const row = await context.db
    .select({
      sub: users.sub,
      display_name: users.name,
      public_key_jwk: userEncryptionKeys.encPublicJwk,
    })
    .from(users)
    .leftJoin(userEncryptionKeys, eq(userEncryptionKeys.sub, users.sub))
    .where(eq(users.sub, sub))
    .limit(1);

  if (!row || row.length === 0) {
    sendJson(response, 404, { error: "user_not_found" });
    return;
  }
  sendJson(response, 200, row[0]);
}

export async function searchUserDirectory(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const auth = request.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (m) {
    const JWKS = createRemoteJWKSet(new URL(`${context.config.issuer}/.well-known/jwks.json`));
    await jwtVerify(m?.[1] || "", JWKS, { issuer: context.config.issuer }).catch(async () => {
      await requireSession(context, request, false);
    });
  } else {
    await requireSession(context, request, false);
  }
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) {
    sendJson(response, 200, { users: [] });
    return;
  }

  const term = `%${q}%`;
  console.log("[api] users search", { q });
  const rows = await context.db
    .select({
      sub: users.sub,
      display_name: users.name,
      public_key_jwk: userEncryptionKeys.encPublicJwk,
    })
    .from(users)
    .leftJoin(userEncryptionKeys, eq(userEncryptionKeys.sub, users.sub))
    .where(or(ilike(users.name, term), ilike(users.email, term)))
    .limit(10);

  type JwkLike = { kty?: unknown };
  const isJwkWithStringKty = (x: unknown): x is { kty: string } =>
    typeof x === "object" && x !== null && typeof (x as JwkLike).kty === "string";
  const filtered = rows.filter((r) => isJwkWithStringKty(r.public_key_jwk));
  const missing = rows.filter((r) => !r.public_key_jwk).map((r) => r.sub);
  const invalid = rows
    .filter((r) => r.public_key_jwk && !isJwkWithStringKty(r.public_key_jwk))
    .map((r) => r.sub);
  console.log("[api] users search results", {
    count: rows.length,
    returned: filtered.length,
    missing_pubkey_count: missing.length,
    invalid_pubkey_count: invalid.length,
  });
  sendJson(response, 200, { users: filtered });
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const User = z.object({
    sub: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  });
  registry.registerPath({
    method: "get",
    path: "/users/search",
    tags: ["Users Directory"],
    summary: "Search users",
    request: { query: z.object({ q: z.string().optional() }) },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: z.array(User) } } },
      ...genericErrors,
    },
  });
  registry.registerPath({
    method: "get",
    path: "/users/{sub}",
    tags: ["Users Directory"],
    summary: "Get user",
    request: { params: z.object({ sub: z.string() }) },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: User } } },
      ...genericErrors,
    },
  });
}
