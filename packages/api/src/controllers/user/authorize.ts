import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidRequestError, UnauthorizedClientError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { withRateLimit } from "../../middleware/rateLimit.ts";
import { createPendingAuth } from "../../models/authorize.ts";
import { getClient } from "../../models/clients.ts";
import { getUserClientConsent, parseScopes } from "../../models/consents.ts";
import { getUserOrganizations, isUserOtpRequired } from "../../models/rbac.ts";
import { getSession, getSessionId } from "../../services/sessions.ts";
import { createZkPubKid, parseZkPub } from "../../services/zkDelivery.ts";
import type { AuthorizationRequest, Context, ControllerSchema } from "../../types.ts";
import {
  resolveClientScopeDescriptions,
  resolveClientScopeKeys,
} from "../../utils/clientScopes.ts";
import { generateRandomString } from "../../utils/crypto.ts";
import { parseQueryParams } from "../../utils/http.ts";
import { validateCodeChallenge } from "../../utils/pkce.ts";
import { resolveGrantedScopes } from "./token.ts";

async function resolveRememberedConsent(
  context: Context,
  userSub: string,
  clientId: string,
  grantedScopes: string[],
  requireOrganizationSelection: boolean,
  requestedOrganizationId: string | undefined
): Promise<{ organizationId: string | undefined } | null> {
  const consent = await getUserClientConsent(context, userSub, clientId);
  if (!consent) return null;
  const consentedScopes = new Set(parseScopes(consent.scopes));
  if (!grantedScopes.every((scope) => consentedScopes.has(scope))) return null;
  if (!requireOrganizationSelection) return { organizationId: requestedOrganizationId };
  const activeOrganizationIds = (await getUserOrganizations(context, userSub))
    .filter((membership) => membership.status === "active")
    .map((membership) => membership.organizationId);
  if (activeOrganizationIds.length !== 1) return null;
  const organizationId = activeOrganizationIds[0];
  if (!consent.organizationId || consent.organizationId !== organizationId) return null;
  if (requestedOrganizationId && requestedOrganizationId !== organizationId) return null;
  return { organizationId };
}

const PromptSchema = z
  .string()
  .trim()
  .refine((value) => {
    const values = value.split(/\s+/).filter(Boolean);
    if (!values.every((item) => ["none", "login", "consent", "select_account"].includes(item))) {
      return false;
    }
    return !values.includes("none") || values.length === 1;
  }, "Invalid prompt")
  .optional();

export const AuthorizationRequestSchema = z.object({
  client_id: z.string().min(1, { message: "client_id is required" }),
  redirect_uri: z.string().min(1, { message: "redirect_uri is required" }),
  response_type: z.string().min(1, { message: "response_type is required" }),
  scope: z.string().optional(),
  state: z.string().optional(),
  nonce: z.string().optional(),
  organization_id: z.string().uuid().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  zk_pub: z.string().optional(),
  prompt: PromptSchema,
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
  if (!client.grantTypes.includes("authorization_code")) {
    throw new UnauthorizedClientError("authorization_code grant not allowed for this client");
  }

  if (!client.redirectUris.includes(authRequest.redirect_uri)) {
    throw new InvalidRequestError("Invalid redirect_uri");
  }

  const allowedScopes = resolveClientScopeKeys(client.scopes);
  const grantedScopes = resolveGrantedScopes(allowedScopes, authRequest.scope);
  const grantedScope = grantedScopes.join(" ");

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
    parseZkPub(authRequest.zk_pub);
    canonicalZkPub = authRequest.zk_pub;
    zkPubKid = createZkPubKid(canonicalZkPub);
  } else if (authRequest.zk_pub && client.zkDelivery === "none") {
    throw new InvalidRequestError("This client does not support ZK delivery");
  } else if (!authRequest.zk_pub && client.zkRequired) {
    throw new InvalidRequestError("This client requires ZK delivery");
  }

  const requestId = generateRandomString(32);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const sessionId = getSessionId(request);
  const sessionData = sessionId ? await getSession(context, sessionId) : null;
  const userSub = sessionData?.sub;
  const prompts = new Set((authRequest.prompt ?? "").split(/\s+/).filter(Boolean));
  const consentAllowed =
    client.rememberConsent &&
    !prompts.has("login") &&
    !prompts.has("consent") &&
    !prompts.has("select_account");
  const consented =
    userSub && consentAllowed
      ? await resolveRememberedConsent(
          context,
          userSub,
          authRequest.client_id,
          grantedScopes,
          client.requireOrganizationSelection,
          authRequest.organization_id
        )
      : null;

  if (prompts.has("none")) {
    const signedIn =
      !!userSub &&
      (sessionData?.otpVerified === true || !(await isUserOtpRequired(context, userSub)));
    const error = !signedIn ? "login_required" : consented ? null : "consent_required";
    if (error) {
      const target = new URL(authRequest.redirect_uri);
      target.searchParams.set("error", error);
      if (authRequest.state) target.searchParams.set("state", authRequest.state);
      response.statusCode = 302;
      response.setHeader("Location", target.toString());
      response.end();
      return;
    }
  }

  const organizationId = consented?.organizationId ?? authRequest.organization_id;

  await createPendingAuth(context, {
    requestId,
    clientId: authRequest.client_id,
    redirectUri: authRequest.redirect_uri,
    scope: grantedScope,
    state: authRequest.state,
    nonce: authRequest.nonce,
    codeChallenge: authRequest.code_challenge,
    codeChallengeMethod: authRequest.code_challenge_method,
    zkPubKid,
    keyDeliveryVersion: zkPubKid ? client.keyDeliveryVersion : undefined,
    deliveredKeyKind: zkPubKid ? client.deliveredKeyKind : undefined,
    clientKeyScope: zkPubKid ? client.clientKeyScope : undefined,
    requireOrganizationSelection: client.requireOrganizationSelection,
    prompt: prompts.size > 0 ? [...prompts].join(" ") : undefined,
    userSub,
    organizationId,
    origin: `http://${request.headers.host}`,
    expiresAt,
  });

  const qs = new URLSearchParams();
  qs.set("request_id", requestId);
  qs.set("client_name", client.name);
  qs.set("scopes", grantedScope);
  const requestedScopeKeys = grantedScopes;
  const scopeDescriptions = resolveClientScopeDescriptions(client.scopes, requestedScopeKeys);
  if (Object.keys(scopeDescriptions).length > 0) {
    qs.set(
      "scope_descriptions",
      Buffer.from(JSON.stringify(scopeDescriptions)).toString("base64url")
    );
    for (const [key, description] of Object.entries(scopeDescriptions)) {
      qs.set(`scope_desc_${key}`, description);
    }
  }
  if (zkPubKid) qs.set("has_zk", "1");
  if (zkPubKid) qs.set("key_delivery_version", client.keyDeliveryVersion);
  if (zkPubKid) qs.set("delivered_key_kind", client.deliveredKeyKind);
  if (zkPubKid) qs.set("client_key_scope", client.clientKeyScope);
  qs.set("require_organization_selection", client.requireOrganizationSelection ? "1" : "0");
  if (authRequest.zk_pub && canonicalZkPub) qs.set("zk_pub", canonicalZkPub);
  if (authRequest.client_id) qs.set("client_id", authRequest.client_id);
  if (authRequest.redirect_uri) qs.set("redirect_uri", authRequest.redirect_uri);
  if (authRequest.state) qs.set("state", authRequest.state);
  if (organizationId) qs.set("organization_id", organizationId);
  if (consented) qs.set("auto_finalize", "1");
  if (prompts.size > 0) qs.set("prompt", [...prompts].join(" "));
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
  description:
    "Accepts organization_id as an authorization context hint. If no organization context can be resolved during finalization for a multi-organization user, the flow returns ORG_CONTEXT_REQUIRED.",
  query: AuthorizationRequestSchema,
  responses: { 302: { description: "Redirect to UI", ...genericErrors } },
} as const satisfies ControllerSchema;
