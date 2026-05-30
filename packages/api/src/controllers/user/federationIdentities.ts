import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { listFederationIdentitiesForUser } from "../../models/federation.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const IdentitySchema = z.object({
  id: z.string().uuid(),
  connection_id: z.string().uuid(),
  connection_name: z.string(),
  issuer: z.string(),
  external_subject: z.string(),
  email: z.string().nullable(),
  email_verified: z.boolean(),
  created_at: z.date().or(z.string()),
  last_used_at: z.date().or(z.string()).nullable(),
});

const ResponseSchema = z.object({ identities: z.array(IdentitySchema) });

export async function getFederationIdentities(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, false);
  if (!session.sub) throw new UnauthorizedError("User session required");
  const rows = await listFederationIdentitiesForUser(context, session.sub);
  sendJsonValidated(
    response,
    200,
    {
      identities: rows.map((row) => ({
        id: row.id,
        connection_id: row.connectionId,
        connection_name: row.connectionName,
        issuer: row.issuer,
        external_subject: row.externalSubject,
        email: row.email,
        email_verified: row.emailVerified,
        created_at: row.linkedAt,
        last_used_at: row.lastLoginAt,
      })),
    },
    ResponseSchema
  );
}

export const schema = {
  method: "GET",
  path: "/federation/identities",
  tags: ["Federation"],
  summary: "List connected federation identities",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
