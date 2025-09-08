import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { InvalidRequestError, UnauthorizedClientError } from "../../errors.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { createPendingAuth } from "../../models/authorize.js";
import { getClient } from "../../models/clients.js";
import { getSession, getSessionId } from "../../services/sessions.js";
import type { AuthorizationRequest, Context } from "../../types.js";
import { generateRandomString, sha256Base64Url } from "../../utils/crypto.js";
import { parseQueryParams } from "../../utils/http.js";
import { parseAndValidateZkPub } from "../../utils/jwk.js";

export const AuthorizationRequestSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  scope: z.string().min(1),
  state: z.string().optional(),
  nonce: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.literal("S256").optional(),
  zk_pub: z.string().optional(),
});

import { validateCodeChallenge } from "../../utils/pkce.js";

export const getAuthorize = withRateLimit("opaque")(async function getAuthorize(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const params = parseQueryParams(request.url || "");

  const authRequest: AuthorizationRequest = {
    client_id: params.get("client_id") || "",
    redirect_uri: params.get("redirect_uri") || "",
    response_type: params.get("response_type") || "",
    scope: params.get("scope") || "",
    state: params.get("state") || undefined,
    nonce: params.get("nonce") || undefined,
    code_challenge: params.get("code_challenge") || undefined,
    code_challenge_method: params.get("code_challenge_method") || undefined,
    zk_pub: params.get("zk_pub") || undefined,
  };

  if (!authRequest.client_id) {
    throw new InvalidRequestError("client_id is required");
  }

  if (!authRequest.redirect_uri) {
    throw new InvalidRequestError("redirect_uri is required");
  }

  if (authRequest.response_type !== "code") {
    throw new InvalidRequestError("Only response_type=code is supported");
  }

  const client = await getClient(context, authRequest.client_id);

  if (!client) {
    throw new UnauthorizedClientError("Unknown client");
  }

  if (!client.redirectUris.includes(authRequest.redirect_uri)) {
    throw new InvalidRequestError("Invalid redirect_uri");
  }

  if (client.type === "public" || client.requirePkce) {
    if (!authRequest.code_challenge) {
      throw new InvalidRequestError("PKCE code_challenge is required");
    }

    if (authRequest.code_challenge_method !== "S256") {
      throw new InvalidRequestError("Only S256 code_challenge_method is supported");
    }

    validateCodeChallenge(authRequest.code_challenge, authRequest.code_challenge_method);
  }

  let zkPubKid: string | undefined;
  if (authRequest.zk_pub && client.zkDelivery === "fragment-jwe") {
    // Validate that zk_pub is a proper P-256 ECDH public key in JWK format
    parseAndValidateZkPub(authRequest.zk_pub);
    zkPubKid = sha256Base64Url(authRequest.zk_pub);
  } else if (authRequest.zk_pub && client.zkDelivery === "none") {
    throw new InvalidRequestError("This client does not support ZK delivery");
  } else if (!authRequest.zk_pub && client.zkRequired) {
    throw new InvalidRequestError("This client requires ZK delivery");
  }

  const requestId = generateRandomString(32);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const sessionId = getSessionId(request);
  let userSub: string | undefined;

  if (sessionId) {
    const sessionData = await getSession(context, sessionId);
    userSub = sessionData?.sub;
  }

  await createPendingAuth(context, {
    requestId,
    clientId: authRequest.client_id,
    redirectUri: authRequest.redirect_uri,
    state: authRequest.state,
    codeChallenge: authRequest.code_challenge,
    codeChallengeMethod: authRequest.code_challenge_method,
    zkPubKid,
    userSub,
    origin: `http://${request.headers.host}`,
    expiresAt,
  });

  const qs = new URLSearchParams();
  qs.set("request_id", requestId);
  qs.set("client_name", client.name);
  qs.set("scopes", authRequest.scope);
  if (zkPubKid) qs.set("has_zk", "1");
  if (authRequest.zk_pub) qs.set("zk_pub", authRequest.zk_pub);
  if (authRequest.client_id) qs.set("client_id", authRequest.client_id);
  if (authRequest.redirect_uri) qs.set("redirect_uri", authRequest.redirect_uri);
  if (authRequest.state) qs.set("state", authRequest.state);
  const redirectTo = `/${qs.toString() ? `?${qs.toString()}` : ""}`;
  response.statusCode = 302;
  response.setHeader("Location", redirectTo);
  response.end();
});

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/authorize",
    tags: ["Auth"],
    summary: "Authorization endpoint",
    request: { query: AuthorizationRequestSchema },
    responses: { 302: { description: "Redirect to UI", ...genericErrors } },
  });
}
