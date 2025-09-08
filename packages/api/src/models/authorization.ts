import { eq } from "drizzle-orm";
import { clients, pendingAuth } from "../db/schema.js";
import { InvalidRequestError, UnauthorizedClientError } from "../errors.js";
import { getSession, getSessionId } from "../services/sessions.js";
import type { AuthorizationRequest, Context } from "../types.js";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.js";
import { parseAndValidateZkPub } from "../utils/jwk.js";
import { validateCodeChallenge } from "../utils/pkce.js";

export interface ClientAuthorizationData {
  clientId: string;
  name: string;
  redirectUris: string[];
  type: "public" | "confidential";
  requirePkce: boolean;
  zkDelivery?: "none" | "fragment-jwe";
  zkRequired?: boolean;
}

export interface PendingAuthRecord {
  requestId: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  zkPubKid?: string;
  userSub?: string;
  expiresAt: Date;
}

/**
 * Validates and retrieves client information for authorization request
 */
export async function getClientForAuthorization(
  context: Context,
  clientId: string
): Promise<ClientAuthorizationData | null> {
  const client = await context.db.query.clients.findFirst({
    where: eq(clients.clientId, clientId),
  });

  if (!client) {
    return null;
  }

  return {
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris,
    type: client.type,
    requirePkce: client.requirePkce,
    zkDelivery: client.zkDelivery,
    zkRequired: client.zkRequired,
  };
}

/**
 * Validates authorization request parameters
 */
export function validateAuthorizationRequest(
  authRequest: AuthorizationRequest,
  client: ClientAuthorizationData
): void {
  if (!authRequest.client_id) {
    throw new InvalidRequestError("client_id is required");
  }

  if (!authRequest.redirect_uri) {
    throw new InvalidRequestError("redirect_uri is required");
  }

  if (authRequest.response_type !== "code") {
    throw new InvalidRequestError("Only response_type=code is supported");
  }

  if (!client.redirectUris.includes(authRequest.redirect_uri)) {
    throw new InvalidRequestError("Invalid redirect_uri");
  }
}

/**
 * Validates PKCE parameters for authorization request
 */
export function validatePkceForAuthorization(
  authRequest: AuthorizationRequest,
  client: ClientAuthorizationData
): void {
  if (client.type === "public" || client.requirePkce) {
    if (!authRequest.code_challenge) {
      throw new InvalidRequestError("PKCE code_challenge is required");
    }

    if (authRequest.code_challenge_method !== "S256") {
      throw new InvalidRequestError("Only S256 code_challenge_method is supported");
    }

    validateCodeChallenge(authRequest.code_challenge, authRequest.code_challenge_method);
  }
}

/**
 * Validates ZK public key parameters
 */
export function validateZkParameters(
  authRequest: AuthorizationRequest,
  client: ClientAuthorizationData
): string | undefined {
  if (authRequest.zk_pub && client.zkDelivery === "fragment-jwe") {
    // Validate that zk_pub is a proper P-256 ECDH public key in JWK format
    parseAndValidateZkPub(authRequest.zk_pub);
    return sha256Base64Url(authRequest.zk_pub);
  } 
  
  if (authRequest.zk_pub && client.zkDelivery === "none") {
    throw new InvalidRequestError("This client does not support ZK delivery");
  } 
  
  if (!authRequest.zk_pub && client.zkRequired) {
    throw new InvalidRequestError("This client requires ZK delivery");
  }

  return undefined;
}

/**
 * Gets current user session if available
 */
export async function getCurrentUserSession(
  context: Context,
  request: { headers: { cookie?: string } }
): Promise<string | undefined> {
  const sessionId = getSessionId(request as any);
  if (!sessionId) {
    return undefined;
  }

  const sessionData = await getSession(context, sessionId);
  return sessionData?.sub;
}

/**
 * Creates a pending authorization request
 */
export async function createPendingAuthRequest(
  context: Context,
  authRequest: AuthorizationRequest,
  zkPubKid?: string,
  userSub?: string,
  origin?: string
): Promise<PendingAuthRecord> {
  const requestId = generateRandomString(32);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  const pendingRecord: PendingAuthRecord = {
    requestId,
    clientId: authRequest.client_id,
    redirectUri: authRequest.redirect_uri,
    state: authRequest.state,
    codeChallenge: authRequest.code_challenge,
    codeChallengeMethod: authRequest.code_challenge_method,
    zkPubKid,
    userSub,
    expiresAt,
  };

  await context.db.insert(pendingAuth).values({
    requestId,
    clientId: authRequest.client_id,
    redirectUri: authRequest.redirect_uri,
    state: authRequest.state,
    codeChallenge: authRequest.code_challenge,
    codeChallengeMethod: authRequest.code_challenge_method,
    zkPubKid,
    createdAt: new Date(),
    expiresAt,
    userSub,
    origin: origin || `http://localhost`,
  });

  return pendingRecord;
}

/**
 * Builds redirect URL with authorization parameters
 */
export function buildAuthorizationRedirect(
  authRequest: AuthorizationRequest,
  client: ClientAuthorizationData,
  requestId: string,
  zkPubKid?: string
): string {
  const qs = new URLSearchParams();
  qs.set("request_id", requestId);
  qs.set("client_name", client.name);
  qs.set("scopes", authRequest.scope);
  
  if (zkPubKid) {
    qs.set("has_zk", "1");
  }
  
  if (authRequest.zk_pub) {
    qs.set("zk_pub", authRequest.zk_pub);
  }
  
  if (authRequest.client_id) {
    qs.set("client_id", authRequest.client_id);
  }
  
  if (authRequest.redirect_uri) {
    qs.set("redirect_uri", authRequest.redirect_uri);
  }
  
  if (authRequest.state) {
    qs.set("state", authRequest.state);
  }

  return `/${qs.toString() ? `?${qs.toString()}` : ""}`;
}

/**
 * Complete authorization flow - validates request and creates pending auth
 */
export async function processAuthorizationRequest(
  context: Context,
  authRequest: AuthorizationRequest,
  request: { headers: { cookie?: string; host?: string } }
): Promise<{ redirectUrl: string; client: ClientAuthorizationData }> {
  // Get and validate client
  const client = await getClientForAuthorization(context, authRequest.client_id);
  if (!client) {
    throw new UnauthorizedClientError("Unknown client");
  }

  // Validate authorization request
  validateAuthorizationRequest(authRequest, client);

  // Validate PKCE
  validatePkceForAuthorization(authRequest, client);

  // Validate ZK parameters
  const zkPubKid = validateZkParameters(authRequest, client);

  // Get current user session
  const userSub = await getCurrentUserSession(context, request);

  // Create pending auth request
  const origin = `http://${request.headers.host}`;
  const pendingRecord = await createPendingAuthRequest(
    context,
    authRequest,
    zkPubKid,
    userSub,
    origin
  );

  // Build redirect URL
  const redirectUrl = buildAuthorizationRedirect(
    authRequest,
    client,
    pendingRecord.requestId,
    zkPubKid
  );

  return {
    redirectUrl,
    client,
  };
}