import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError, UnauthorizedClientError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { withRateLimit } from "../../middleware/rateLimit.js";
import { createPendingAuth } from "../../models/authorize.js";
import { getClient } from "../../models/clients.js";
import { getSession, getSessionId } from "../../services/sessions.js";
import { createZkPubKid, parseZkPub } from "../../services/zkDelivery.js";
import type { AuthorizationRequest, Context, ControllerSchema } from "../../types.js";
import { generateRandomString, toBase64Url } from "../../utils/crypto.js";
import { parseQueryParams } from "../../utils/http.js";
import { validateP256PublicKeyJWK } from "../../utils/jwk.js";
import { validateCodeChallenge } from "../../utils/pkce.js";

export const AuthorizationRequestSchema = z.object({
  client_id: z.string().min(1, { message: "client_id is required" }),
  redirect_uri: z.string().min(1, { message: "redirect_uri is required" }),
  response_type: z.string().min(1, { message: "response_type is required" }),
  scope: z.string().optional(),
  state: z.string().optional(),
  nonce: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  zk_pub: z.string().optional(),
});

export const getAuthorize = withRateLimit("opaque")(async function getAuthorize(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const params = parseQueryParams(request.url || "");
  const parsedParams = AuthorizationRequestSchema.safeParse(Object.fromEntries(params));
  if (!parsedParams.success) {
    throw new InvalidRequestError(parsedParams.error.issues[0]?.message || "Invalid request");
  }
  const authRequest: AuthorizationRequest = {
    ...parsedParams.data,
    scope: parsedParams.data.scope ?? "",
  };

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

  context.logger.info(
    {
      clientId: authRequest.client_id,
      redirectUri: authRequest.redirect_uri,
      requestedScopes: authRequest.scope,
      hasZkParam: !!authRequest.zk_pub,
    },
    "authorize request received"
  );

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
  let canonicalZkPub: string | undefined;
  if (authRequest.zk_pub && client.zkDelivery === "fragment-jwe") {
    try {
      parseZkPub(authRequest.zk_pub);
      canonicalZkPub = authRequest.zk_pub;
    } catch (_e) {
      const legacyJson = authRequest.zk_pub;
      let jwk: unknown;
      try {
        jwk = JSON.parse(legacyJson);
      } catch {
        throw new InvalidRequestError("zk_pub must be base64url(JSON JWK) or valid JSON JWK");
      }
      validateP256PublicKeyJWK(jwk);
      canonicalZkPub = toBase64Url(Buffer.from(JSON.stringify(jwk)));
    }
    zkPubKid = createZkPubKid(canonicalZkPub);
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
  if (authRequest.zk_pub && canonicalZkPub) qs.set("zk_pub", canonicalZkPub);
  if (authRequest.client_id) qs.set("client_id", authRequest.client_id);
  if (authRequest.redirect_uri) qs.set("redirect_uri", authRequest.redirect_uri);
  if (authRequest.state) qs.set("state", authRequest.state);
  const redirectTo = `/${qs.toString() ? `?${qs.toString()}` : ""}`;
  response.statusCode = 302;
  response.setHeader("Location", redirectTo);
  response.end();

  context.logger.info(
    {
      requestId,
      clientId: authRequest.client_id,
      zkPubKid: zkPubKid || null,
      userSub,
    },
    "authorize request stored"
  );
});

export const schema = {
  method: "GET",
  path: "/authorize",
  tags: ["Auth"],
  summary: "Authorization endpoint",
  query: AuthorizationRequestSchema,
  responses: { 302: { description: "Redirect to UI", ...genericErrors } },
} as const satisfies ControllerSchema;
