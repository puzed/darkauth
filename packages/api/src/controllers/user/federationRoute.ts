import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { findFederationConnectionForEmail } from "../../models/federation.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const ConnectionSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("oidc"),
  protocol: z.string(),
  organizationId: z.string().uuid(),
  name: z.string(),
  issuer: z.string(),
  clientId: z.string(),
  discoveryUrl: z.string(),
  authorizationEndpoint: z.string(),
  tokenEndpoint: z.string(),
  jwksUri: z.string(),
  userinfoEndpoint: z.string().nullable(),
  scopes: z.array(z.string()),
  claimMapping: z.record(z.string(), z.unknown()),
  accountLinkingPolicy: z.enum(["disabled", "email_verified", "email"]),
  jitProvisioning: z.boolean(),
  membershipOnAuthentication: z.boolean(),
  requireScimPreProvisioning: z.boolean(),
  requirePasswordForZk: z.boolean(),
  allowPasskeyPrf: z.boolean(),
  allowTrustedDeviceApproval: z.boolean(),
  allowNonZkKeySetupBypass: z.boolean(),
  domains: z.array(z.string()),
  enabled: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  hasClientSecret: z.boolean(),
});

const ResponseSchema = z.object({
  connection: ConnectionSchema.nullable(),
});

export async function getFederationRoute(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const email = url.searchParams.get("email");
  if (!email) throw new ValidationError("email is required");
  const organizationId = url.searchParams.get("organization_id") || undefined;
  const connection = await findFederationConnectionForEmail(context, email, { organizationId });
  sendJsonValidated(response, 200, { connection }, ResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/federation/route",
  tags: ["Federation"],
  summary: "Resolve federation connection for email domain",
  query: z.object({ email: z.string().email(), organization_id: z.string().uuid().optional() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
