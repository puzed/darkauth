import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import {
  createScimBearerToken,
  listScimBearerTokens,
  revokeScimBearerToken,
} from "../../models/scim.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

export async function getScimTokens(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");
  sendJson(response, 200, { tokens: await listScimBearerTokens(context) });
}

export async function postScimToken(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  const body = parseJsonSafely(await readBody(request));
  const parsed = z
    .object({
      name: z.string().min(1),
      expiresAt: z.string().datetime().nullable().optional(),
    })
    .parse(body);
  const token = await createScimBearerToken(context, {
    name: parsed.name,
    createdByAdminId: session.adminId,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  });
  sendJson(response, 201, token);
}

export async function deleteScimToken(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  tokenId: string
) {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  sendJson(response, 200, await revokeScimBearerToken(context, tokenId));
}
