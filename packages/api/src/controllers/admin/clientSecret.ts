import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { clients } from "../../db/schema.ts";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClient } from "../../models/clients.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const Resp = z.object({
  clientId: z.string(),
  clientSecret: z.string().nullable(),
});

export async function getClientSecretController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
) {
  const Params = z.object({ clientId: z.string() });
  const { clientId } = Params.parse({ clientId: params[0] });

  const session = await requireSession(context, request, true);
  if (!session.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const client = await getClient(context, clientId);
  if (!client) throw new NotFoundError("Client not found");
  sendJsonValidated(response, 200, { clientId, clientSecret: null }, Resp);
}

export async function rotateClientSecretController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
) {
  const Params = z.object({ clientId: z.string() });
  const { clientId } = Params.parse({ clientId: params[0] });

  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const client = await getClient(context, clientId);
  if (!client) throw new NotFoundError("Client not found");
  if (client.type !== "confidential" || client.tokenEndpointAuthMethod !== "client_secret_basic") {
    throw new ValidationError("Client does not use a secret");
  }
  if (!context.services.kek?.isAvailable()) {
    throw new ValidationError("KEK unavailable");
  }

  const clientSecret = randomBytes(32).toString("base64url");
  const clientSecretEnc = await context.services.kek.encrypt(Buffer.from(clientSecret));
  await context.db
    .update(clients)
    .set({ clientSecretEnc, updatedAt: new Date() })
    .where(eq(clients.clientId, clientId));
  sendJsonValidated(response, 200, { clientId, clientSecret }, Resp);
}

export const schema = {
  method: "GET",
  path: "/admin/clients/{clientId}/secret",
  tags: ["Clients"],
  summary: "Check OAuth client secret availability",
  params: z.object({ clientId: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const rotateSchema = {
  method: "POST",
  path: "/admin/clients/{clientId}/secret/rotate",
  tags: ["Clients"],
  summary: "Rotate OAuth client secret",
  params: z.object({ clientId: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
