import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { getUserBySubWithGroups, getUsersBySubsWithGroups, listUsers } from "../../models/users.js";
import type { Context } from "../../types.js";
import { constantTimeCompare } from "../../utils/crypto.js";
import { decodeBasicAuth, parseAuthorizationHeader, sendJson } from "../../utils/http.js";

const UsersQuerySchema = z.object({
  sids: z.string().optional(),
  q: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function hasValidAppSecret(
  context: Context,
  request: IncomingMessage
): Promise<boolean> {
  const authHeader = parseAuthorizationHeader(request);
  if (!authHeader || authHeader.type !== "Basic") {
    return false;
  }
  const credentials = decodeBasicAuth(authHeader.credentials);
  if (!credentials) {
    return false;
  }

  const { getClient } = await import("../../models/clients.js");
  const client = await getClient(context, credentials.username);
  if (!client) {
    return false;
  }
  if (client.type !== "confidential" || client.tokenEndpointAuthMethod !== "client_secret_basic") {
    return false;
  }
  if (!client.clientSecretEnc || !context.services.kek?.isAvailable()) {
    return false;
  }

  try {
    const decryptedSecret = await context.services.kek.decrypt(client.clientSecretEnc);
    const storedSecret = decryptedSecret.toString("utf-8");
    return constantTimeCompare(credentials.password, storedSecret);
  } catch {
    return false;
  }
}

async function requireAppSecret(context: Context, request: IncomingMessage): Promise<void> {
  const ok = await hasValidAppSecret(context, request);
  if (!ok) throw new ForbiddenError("Valid client secret required");
}

export async function getUsersWithAppSecret(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  await requireAppSecret(context, request);

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const query = UsersQuerySchema.parse(Object.fromEntries(url.searchParams));

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
}

export async function getUserBySidWithAppSecret(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  sid: string
) {
  await requireAppSecret(context, request);

  const user = await getUserBySubWithGroups(context, sid);
  if (!user) {
    sendJson(response, 404, { error: "user_not_found" });
    return;
  }

  sendJson(response, 200, user);
}
