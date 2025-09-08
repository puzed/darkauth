import { eq } from "drizzle-orm";
import {
  authCodes,
  clients,
  groupPermissions,
  userGroups,
  userPermissions,
  users,
} from "../db/schema.js";
import { InvalidGrantError, InvalidRequestError, UnauthorizedClientError } from "../errors.js";
import { signJWT } from "../services/jwks.js";
import {
  createSession,
  getActorFromRefreshToken,
  refreshSessionWithToken,
} from "../services/sessions.js";
import { getSetting } from "../services/settings.js";
import type { Context, IdTokenClaims, TokenRequest, TokenResponse } from "../types.js";
import { constantTimeCompare } from "../utils/crypto.js";
import { decodeBasicAuth, parseAuthorizationHeader } from "../utils/http.js";
import { verifyCodeChallenge } from "../utils/pkce.js";

export interface AuthorizationCodeData {
  code: string;
  clientId: string;
  redirectUri: string;
  userSub: string;
  expiresAt: Date;
  consumed: boolean;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  hasZk?: boolean;
  drkHash?: string;
}

export interface ClientAuthData {
  clientId: string;
  tokenEndpointAuthMethod: "none" | "client_secret_basic";
  clientSecretEnc?: string;
  requirePkce?: boolean;
  type?: "public" | "confidential";
  idTokenLifetimeSeconds?: number;
}

export interface UserWithPermissions {
  sub: string;
  email?: string;
  name?: string;
  permissions: string[];
  groups: string[];
}

/**
 * Validates and consumes an authorization code for token exchange
 */
export async function getAuthorizationCode(
  context: Context,
  code: string
): Promise<AuthorizationCodeData | null> {
  const authCode = await context.db.query.authCodes.findFirst({
    where: eq(authCodes.code, code),
  });

  if (!authCode) {
    return null;
  }

  return {
    code: authCode.code,
    clientId: authCode.clientId,
    redirectUri: authCode.redirectUri,
    userSub: authCode.userSub,
    expiresAt: authCode.expiresAt,
    consumed: authCode.consumed,
    codeChallenge: authCode.codeChallenge,
    codeChallengeMethod: authCode.codeChallengeMethod,
    hasZk: authCode.hasZk,
    drkHash: authCode.drkHash,
  };
}

/**
 * Marks an authorization code as consumed
 */
export async function consumeAuthorizationCode(context: Context, code: string): Promise<void> {
  await context.db
    .update(authCodes)
    .set({ consumed: true })
    .where(eq(authCodes.code, code));
}

/**
 * Deletes an expired authorization code
 */
export async function deleteAuthorizationCode(context: Context, code: string): Promise<void> {
  await context.db.delete(authCodes).where(eq(authCodes.code, code));
}

/**
 * Gets client information for OAuth flows
 */
export async function getClientForAuth(context: Context, clientId: string): Promise<ClientAuthData | null> {
  const client = await context.db.query.clients.findFirst({
    where: eq(clients.clientId, clientId),
  });

  if (!client) {
    return null;
  }

  return {
    clientId: client.clientId,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    clientSecretEnc: client.clientSecretEnc,
    requirePkce: client.requirePkce,
    type: client.type,
    idTokenLifetimeSeconds: client.idTokenLifetimeSeconds,
  };
}

/**
 * Authenticates a client using Basic authentication
 */
export async function authenticateClientBasic(
  context: Context,
  authHeader: string,
  expectedClientId: string
): Promise<string> {
  const credentials = decodeBasicAuth(authHeader);
  if (!credentials) {
    throw new UnauthorizedClientError("Invalid Basic authentication format");
  }

  if (credentials.username !== expectedClientId) {
    throw new UnauthorizedClientError("Client ID does not match authorization code");
  }

  const client = await getClientForAuth(context, credentials.username);
  if (!client) {
    throw new UnauthorizedClientError("Unknown client");
  }

  if (client.tokenEndpointAuthMethod !== "client_secret_basic") {
    throw new UnauthorizedClientError("Invalid client auth method");
  }

  if (!client.clientSecretEnc || !context.services.kek?.isAvailable()) {
    throw new UnauthorizedClientError("Client secret verification failed");
  }

  try {
    const decryptedSecret = await context.services.kek.decrypt(client.clientSecretEnc);
    const storedSecret = decryptedSecret.toString("utf-8");

    if (!constantTimeCompare(credentials.password, storedSecret)) {
      throw new UnauthorizedClientError("Invalid client credentials");
    }
  } catch {
    throw new UnauthorizedClientError("Client secret verification failed");
  }

  return credentials.username;
}

/**
 * Authenticates a public client (no secret required)
 */
export async function authenticateClientPublic(
  context: Context,
  clientId: string,
  expectedClientId: string
): Promise<string> {
  if (clientId !== expectedClientId) {
    throw new UnauthorizedClientError("client_id does not match authorization code");
  }

  const client = await getClientForAuth(context, clientId);
  if (!client) {
    throw new UnauthorizedClientError("Unknown client");
  }

  if (client.tokenEndpointAuthMethod !== "none") {
    throw new UnauthorizedClientError("Invalid client auth method");
  }

  return clientId;
}

/**
 * Validates PKCE code verifier against challenge
 */
export function validatePkce(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string
): void {
  if (!verifyCodeChallenge(codeVerifier, codeChallenge, codeChallengeMethod)) {
    throw new InvalidGrantError("Invalid PKCE code verifier");
  }
}

/**
 * Gets user data with permissions and groups for JWT claims
 */
export async function getUserWithPermissions(
  context: Context,
  userSub: string
): Promise<UserWithPermissions | null> {
  const user = await context.db.query.users.findFirst({
    where: eq(users.sub, userSub),
  });

  if (!user) {
    return null;
  }

  // Get user groups
  const userGroupsData = await context.db.query.userGroups.findMany({
    where: eq(userGroups.userSub, user.sub),
    with: {
      group: true,
    },
  });

  // Get direct user permissions
  const userPermissionsData = await context.db.query.userPermissions.findMany({
    where: eq(userPermissions.userSub, user.sub),
    with: {
      permission: true,
    },
  });

  // Get permissions from groups
  const allGroupPermissions: Array<{ permission: { key: string } }> = [];
  for (const userGroup of userGroupsData) {
    const permissions = await context.db.query.groupPermissions.findMany({
      where: eq(groupPermissions.groupKey, userGroup.groupKey),
      with: {
        permission: true,
      },
    });
    allGroupPermissions.push(...permissions);
  }

  const allPermissions = [
    ...userPermissionsData.map((up) => up.permission.key),
    ...allGroupPermissions.map((gp) => gp.permission.key),
  ];

  const uniquePermissions = [...new Set(allPermissions)];
  const groups = userGroupsData.map((ug) => ug.group.key);

  return {
    sub: user.sub,
    email: user.email || undefined,
    name: user.name || undefined,
    permissions: uniquePermissions,
    groups,
  };
}

/**
 * Gets ID token TTL from settings and client configuration
 */
export async function getIdTokenTtl(context: Context, client: ClientAuthData): Promise<number> {
  let defaultIdTtl = 300;

  const idSettings = (await getSetting(context, "id_token")) as
    | { lifetime_seconds?: number }
    | undefined
    | null;

  if (idSettings?.lifetime_seconds && idSettings.lifetime_seconds > 0) {
    defaultIdTtl = idSettings.lifetime_seconds;
  } else {
    const flat = (await getSetting(context, "id_token.lifetime_seconds")) as
      | number
      | undefined
      | null;
    if (typeof flat === "number" && flat > 0) defaultIdTtl = flat;
  }

  return client.idTokenLifetimeSeconds && client.idTokenLifetimeSeconds > 0
    ? client.idTokenLifetimeSeconds
    : defaultIdTtl;
}

/**
 * Creates ID token claims from user and client data
 */
export async function createIdTokenClaims(
  context: Context,
  user: UserWithPermissions,
  client: ClientAuthData,
  authenticatedClientId: string
): Promise<IdTokenClaims> {
  const now = Math.floor(Date.now() / 1000);
  const idTokenTtl = await getIdTokenTtl(context, client);

  return {
    iss: context.config.issuer,
    sub: user.sub,
    aud: authenticatedClientId,
    exp: now + idTokenTtl,
    iat: now,
    email: user.email,
    email_verified: !!user.email,
    name: user.name,
    permissions: user.permissions.length > 0 ? user.permissions : undefined,
    groups: user.groups.length > 0 ? user.groups : undefined,
  };
}

/**
 * Generates a signed ID token
 */
export async function generateIdToken(
  context: Context,
  claims: IdTokenClaims,
  ttlSeconds: number
): Promise<string> {
  return signJWT(context, claims as import("jose").JWTPayload, `${ttlSeconds}s`);
}

/**
 * Handles refresh token grant type
 */
export async function processRefreshToken(
  context: Context,
  tokenRequest: TokenRequest,
  authHeader?: { type: string; credentials: string }
): Promise<TokenResponse> {
  if (!tokenRequest.refresh_token) {
    throw new InvalidRequestError("refresh_token is required");
  }

  let providedClientId: string | undefined;
  let clientAuthOk = false;

  if (authHeader && authHeader.type === "Basic") {
    const credentials = decodeBasicAuth(authHeader.credentials);
    if (!credentials) {
      throw new UnauthorizedClientError("Invalid Basic authentication format");
    }

    const client = await context.db.query.clients.findFirst({
      where: eq(clients.clientId, credentials.username),
    });
    if (!client) throw new UnauthorizedClientError("Unknown client");

    if (client.tokenEndpointAuthMethod !== "client_secret_basic") {
      throw new UnauthorizedClientError("Invalid client auth method");
    }

    if (!client.clientSecretEnc || !context.services.kek?.isAvailable()) {
      throw new UnauthorizedClientError("Client secret verification failed");
    }

    const decryptedSecret = await context.services.kek.decrypt(client.clientSecretEnc);
    const storedSecret = decryptedSecret.toString("utf-8");

    if (!constantTimeCompare(credentials.password, storedSecret)) {
      throw new UnauthorizedClientError("Invalid client credentials");
    }

    providedClientId = client.clientId;
    clientAuthOk = true;
  } else {
    if (!tokenRequest.client_id) {
      throw new InvalidRequestError("client_id is required for public clients");
    }

    const client = await context.db.query.clients.findFirst({
      where: eq(clients.clientId, tokenRequest.client_id),
    });
    if (!client) throw new UnauthorizedClientError("Unknown client");

    if (client.tokenEndpointAuthMethod !== "none") {
      throw new UnauthorizedClientError("Invalid client auth method");
    }

    providedClientId = client.clientId;
    clientAuthOk = true;
  }

  if (!clientAuthOk) {
    throw new UnauthorizedClientError("Client authentication failed");
  }

  const actor = await getActorFromRefreshToken(context, tokenRequest.refresh_token);
  if (!actor || !actor.userSub) {
    throw new InvalidGrantError("Invalid or expired refresh token");
  }

  const user = await getUserWithPermissions(context, actor.userSub);
  if (!user) {
    throw new InvalidGrantError("User not found");
  }

  if (!providedClientId) {
    throw new UnauthorizedClientError("Client authentication failed");
  }

  const client = await getClientForAuth(context, providedClientId);
  if (!client) {
    throw new UnauthorizedClientError("Unknown client");
  }

  const idTokenTtl = await getIdTokenTtl(context, client);
  const idTokenClaims = await createIdTokenClaims(context, user, client, providedClientId);
  const idToken = await generateIdToken(context, idTokenClaims, idTokenTtl);

  const rotated = await refreshSessionWithToken(context, tokenRequest.refresh_token);
  if (!rotated) {
    throw new InvalidGrantError("Invalid or expired refresh token");
  }

  return {
    id_token: idToken,
    token_type: "Bearer",
    expires_in: idTokenTtl,
    refresh_token: rotated.refreshToken,
  };
}

/**
 * Handles authorization code grant type
 */
export async function processAuthorizationCode(
  context: Context,
  tokenRequest: TokenRequest,
  authHeader?: { type: string; credentials: string }
): Promise<TokenResponse> {
  if (!tokenRequest.code) {
    throw new InvalidRequestError("code is required");
  }

  if (!tokenRequest.redirect_uri) {
    throw new InvalidRequestError("redirect_uri is required");
  }

  // Look up authorization code
  const authCode = await getAuthorizationCode(context, tokenRequest.code);
  if (!authCode) {
    console.warn("[token] code not found", tokenRequest.code);
    throw new InvalidGrantError("Invalid authorization code");
  }

  // Check if code has expired
  if (new Date() > authCode.expiresAt) {
    await deleteAuthorizationCode(context, tokenRequest.code);
    throw new InvalidGrantError("Authorization code has expired");
  }

  // Check if code has already been consumed
  if (authCode.consumed) {
    throw new InvalidGrantError("Authorization code has already been used");
  }

  // Verify redirect_uri matches
  if (authCode.redirectUri !== tokenRequest.redirect_uri) {
    throw new InvalidGrantError("redirect_uri does not match authorization request");
  }

  // Look up client
  const client = await getClientForAuth(context, authCode.clientId);
  if (!client) {
    throw new UnauthorizedClientError("Unknown client");
  }

  // Handle client authentication
  let authenticatedClientId: string;

  if (client.tokenEndpointAuthMethod === "none") {
    // Public client
    if (!tokenRequest.client_id) {
      throw new InvalidRequestError("client_id is required for public clients");
    }
    authenticatedClientId = await authenticateClientPublic(
      context,
      tokenRequest.client_id,
      authCode.clientId
    );
  } else if (client.tokenEndpointAuthMethod === "client_secret_basic") {
    // Confidential client
    if (!authHeader || authHeader.type !== "Basic") {
      throw new UnauthorizedClientError("Basic authentication required");
    }
    authenticatedClientId = await authenticateClientBasic(
      context,
      authHeader.credentials,
      authCode.clientId
    );
  } else {
    throw new InvalidRequestError("Unsupported client authentication method");
  }

  // Verify PKCE if present
  if (authCode.codeChallenge) {
    if (!tokenRequest.code_verifier) {
      throw new InvalidRequestError("code_verifier is required when PKCE is used");
    }
    validatePkce(
      tokenRequest.code_verifier,
      authCode.codeChallenge,
      authCode.codeChallengeMethod || "S256"
    );
  } else if (client.requirePkce || client.type === "public") {
    throw new InvalidGrantError("PKCE is required for this client");
  }

  // Get user with permissions
  const user = await getUserWithPermissions(context, authCode.userSub);
  if (!user) {
    throw new InvalidGrantError("User not found");
  }

  // Create ID token
  const idTokenTtl = await getIdTokenTtl(context, client);
  const idTokenClaims = await createIdTokenClaims(context, user, client, authenticatedClientId);
  const idToken = await generateIdToken(context, idTokenClaims, idTokenTtl);

  // Prepare token response
  const tokenResponse: TokenResponse = {
    id_token: idToken,
    token_type: "Bearer",
    expires_in: idTokenTtl,
  };

  // Handle ZK delivery
  if (authCode.hasZk) {
    if (authCode.drkHash) tokenResponse.zk_drk_hash = authCode.drkHash;
    console.log("[token] ZK delivery - drk_hash included, JWE handled client-side");
  }

  // Create session and refresh token
  const sessionData = {
    sub: user.sub,
    email: user.email,
    name: user.name,
  };
  const session = await createSession(context, "user", sessionData);
  tokenResponse.refresh_token = session.refreshToken;

  // Consume the authorization code
  await consumeAuthorizationCode(context, tokenRequest.code);

  return tokenResponse;
}