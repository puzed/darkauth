import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { getSetting } from "../../services/settings.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getWellKnownOpenidConfiguration(
  context: Context,
  _request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const issuer = (await getSetting(context, "issuer")) || context.config.issuer;
  const publicOrigin = (await getSetting(context, "public_origin")) || context.config.publicOrigin;

  const configuration = {
    issuer,
    authorization_endpoint: `${publicOrigin}/api/authorize`,
    token_endpoint: `${publicOrigin}/api/token`,
    jwks_uri: `${publicOrigin}/api/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["EdDSA"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "email",
      "email_verified",
      "name",
      "permissions",
      "groups",
    ],
    code_challenge_methods_supported: ["S256"],
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    require_request_uri_registration: false,
  };

  sendJson(response, 200, configuration);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Resp = z.object({
    issuer: z.string().url(),
    authorization_endpoint: z.string().url(),
    token_endpoint: z.string().url(),
    jwks_uri: z.string().url(),
    response_types_supported: z.array(z.string()),
    grant_types_supported: z.array(z.string()),
    subject_types_supported: z.array(z.string()),
    id_token_signing_alg_values_supported: z.array(z.string()),
    scopes_supported: z.array(z.string()),
    token_endpoint_auth_methods_supported: z.array(z.string()),
    claims_supported: z.array(z.string()),
    code_challenge_methods_supported: z.array(z.string()),
    request_parameter_supported: z.boolean(),
    request_uri_parameter_supported: z.boolean(),
    require_request_uri_registration: z.boolean(),
  });
  registry.registerPath({
    method: "get",
    path: "/.well-known/openid-configuration",
    tags: ["Well-Known"],
    summary: "OpenID Provider Configuration",
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
