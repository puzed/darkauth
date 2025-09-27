import type { IncomingMessage, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getDirectoryEntry, searchDirectory } from "../../models/usersDirectory.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
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
  path: "/users/search",
  tags: ["Users Directory"],
  summary: "Search users",
  query: z.object({ q: z.string().optional() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: z.array(User) } } },
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
