import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError, UnauthorizedClientError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getClient } from "../../models/clients.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { resolveClientScopeDescriptions } from "../../utils/clientScopes.ts";
import { sendJson } from "../../utils/http.ts";

export async function getScopeDescriptions(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const parsed = z
    .object({
      client_id: z.string().min(1),
      scopes: z.string().optional(),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    throw new InvalidRequestError(parsed.error.issues[0]?.message || "Invalid request");
  }

  const client = await getClient(context, parsed.data.client_id);
  if (!client) {
    throw new UnauthorizedClientError("Unknown client");
  }

  const requestedScopes = (parsed.data.scopes || "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const descriptions = resolveClientScopeDescriptions(client.scopes, requestedScopes);
  sendJson(response, 200, { descriptions });
}

export const schema = {
  method: "GET",
  path: "/scope-descriptions",
  tags: ["Auth"],
  summary: "Get client scope descriptions",
  query: z.object({
    client_id: z.string(),
    scopes: z.string().optional(),
  }),
  responses: {
    200: {
      description: "Scope description map",
      content: {
        "application/json": {
          schema: z.object({
            descriptions: z.record(z.string(), z.string()),
          }),
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
