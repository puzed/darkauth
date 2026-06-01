import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { decodeProtectedHeader, importJWK, type JWK, type JWTPayload, jwtVerify } from "jose";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import {
  consumeOidcCallbackState,
  createOidcCallbackState,
  decryptFederationClientSecret,
  findFederationConnectionForEmail,
  getFederationConnectionSecret,
  resolveFederatedUserForClaims,
} from "../../models/federation.ts";
import { getUserBySub } from "../../models/users.ts";
import { getClientIp, logAuditEvent } from "../../services/audit.ts";
import {
  createSession,
  getRefreshTokenTtlSeconds,
  getSessionTtlSeconds,
  issueRefreshTokenCookie,
  issueSessionCookies,
} from "../../services/sessions.ts";
import { getSetting } from "../../services/settings.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { generateRandomString } from "../../utils/crypto.ts";
import { redirect } from "../../utils/http.ts";

const callbackCookieName = "__Host-DarkAuth-Federation";

const StartQuerySchema = z
  .object({
    connection_id: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    organization_id: z.string().uuid().optional(),
    return_to: z.string().trim().max(2048).optional(),
  })
  .refine((value) => value.connection_id || value.email, "connection_id or email is required");

const TokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
});

type FederationConnection = Awaited<ReturnType<typeof getFederationConnectionSecret>>;
type CallbackCookie = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export async function getFederationStart(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const parsed = StartQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const connection = parsed.connection_id
    ? await getFederationConnectionSecret(context, parsed.connection_id)
    : await findConnectionForEmail(context, parsed.email as string, parsed.organization_id);
  if (!connection.enabled) throw new ValidationError("Federation connection is disabled");
  if (parsed.organization_id && parsed.organization_id !== connection.organizationId) {
    throw new ValidationError("Federation connection does not belong to the selected organization");
  }

  const nonce = generateRandomString(32);
  const codeVerifier = generateRandomString(64);
  const clientId = await getUserClientId(context);
  const state = await createOidcCallbackState(context, {
    connectionId: connection.id,
    organizationId: connection.organizationId,
    clientId,
    nonce,
    codeVerifier,
    returnTo: normalizeReturnTo(context, parsed.return_to),
  });
  const authorizationUrl = new URL(connection.authorizationEndpoint);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", connection.clientId);
  authorizationUrl.searchParams.set("redirect_uri", getCallbackUrl(context));
  authorizationUrl.searchParams.set("scope", connection.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state.state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  setCallbackCookie(response, { state: state.state, nonce, codeVerifier });
  await auditFederationEvent(context, request, {
    eventType: "FEDERATION_LOGIN_START",
    success: true,
    statusCode: 302,
    resourceId: connection.id,
    details: {
      issuer: connection.issuer,
      organization_id: connection.organizationId,
      client_id: clientId,
      return_to: normalizeReturnTo(context, parsed.return_to),
    },
  });
  redirect(response, authorizationUrl.toString(), 302);
}

export async function getFederationCallback(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  const cookie = getCallbackCookie(request);
  clearCallbackCookie(response);
  let auditConnectionId: string | undefined;
  let auditUserSub: string | undefined;
  let auditIdentityId: string | undefined;
  try {
    if (!state || !cookie || cookie.state !== state) {
      throw new ValidationError("Invalid OIDC state");
    }
    if (providerError) {
      const rejectedState = await consumeOidcCallbackState(context, {
        state,
        nonce: cookie.nonce,
        codeVerifier: cookie.codeVerifier,
      });
      auditConnectionId = rejectedState.connectionId;
      throw new UnauthorizedError("Federation provider rejected the request");
    }
    if (!code) throw new ValidationError("code is required");

    const stateRow = await consumeOidcCallbackState(context, {
      state,
      nonce: cookie.nonce,
      codeVerifier: cookie.codeVerifier,
    });
    auditConnectionId = stateRow.connectionId;
    const connection = await getFederationConnectionSecret(context, stateRow.connectionId);
    if (!connection.enabled) throw new ValidationError("Federation connection is disabled");
    if (stateRow.organizationId !== connection.organizationId) {
      throw new ValidationError("Federation state organization mismatch");
    }

    const tokenResponse = await exchangeCode(context, connection, code, cookie.codeVerifier);
    const idTokenClaims = await validateIdToken(connection, tokenResponse.id_token, cookie.nonce);
    const claims = tokenResponse.access_token
      ? await mergeUserinfoClaims(connection, idTokenClaims, tokenResponse.access_token)
      : idTokenClaims;
    const resolved = await resolveFederatedUserForClaims(context, connection.id, claims);
    auditIdentityId = resolved.identityId;
    if (!resolved.userSub) throw new UnauthorizedError("Federation account is not linked");
    auditUserSub = resolved.userSub;
    const user = await getUserBySub(context, resolved.userSub);
    if (!user) throw new UnauthorizedError("Federation account is not linked");

    const { getUserOrganizations } = await import("../../models/rbac.ts");
    const activeMemberships = (await getUserOrganizations(context, user.sub)).filter(
      (membership) => membership.status === "active"
    );
    const sessionMembership = activeMemberships.find(
      (membership) => membership.organizationId === connection.organizationId
    );
    if (!sessionMembership) throw new UnauthorizedError("Authentication not permitted");
    const { sessionId, refreshToken } = await createSession(context, "user", {
      sub: user.sub,
      email: user.email || undefined,
      name: user.name || undefined,
      organizationId: sessionMembership.organizationId,
      organizationSlug: sessionMembership.slug,
      clientId: stateRow.clientId || (await getUserClientId(context)),
      keyState: "locked",
      otpRequired: sessionMembership.forceOtp,
      otpVerified: false,
    });
    const ttlSeconds = await getSessionTtlSeconds(context, "user");
    const refreshTtlSeconds = await getRefreshTokenTtlSeconds(context, "user");
    issueSessionCookies(response, sessionId, ttlSeconds, false);
    issueRefreshTokenCookie(response, refreshToken, refreshTtlSeconds, false);
    if (resolved.created) {
      await auditFederationEvent(context, request, {
        eventType: "FEDERATION_ACCOUNT_LINK",
        success: true,
        statusCode: 302,
        resourceId: connection.id,
        userId: user.sub,
        details: {
          identity_id: auditIdentityId,
          issuer: connection.issuer,
          organization_id: connection.organizationId,
        },
      });
    }
    await auditFederationEvent(context, request, {
      eventType: "FEDERATION_CALLBACK",
      success: true,
      statusCode: 302,
      resourceId: connection.id,
      userId: user.sub,
      details: {
        identity_id: auditIdentityId,
        issuer: connection.issuer,
        organization_id: connection.organizationId,
      },
    });
    await auditFederationEvent(context, request, {
      eventType: "FEDERATION_LOGIN",
      success: true,
      statusCode: 302,
      resourceId: connection.id,
      userId: user.sub,
      details: {
        key_state: "locked",
        issuer: connection.issuer,
        organization_id: connection.organizationId,
      },
    });
    redirect(response, stateRow.returnTo || "/dashboard", 302);
  } catch (error) {
    const err = error as { statusCode?: number; code?: string; message?: string };
    await auditFederationEvent(context, request, {
      eventType: "FEDERATION_LOGIN_FAILURE",
      success: false,
      statusCode: err.statusCode ?? 500,
      errorCode: err.code ?? "INTERNAL_ERROR",
      errorMessage: err.message,
      resourceId: auditConnectionId,
      userId: auditUserSub,
      details: { identity_id: auditIdentityId },
    });
    throw error;
  }
}

async function auditFederationEvent(
  context: Context,
  request: IncomingMessage,
  data: {
    eventType: string;
    success: boolean;
    statusCode: number;
    resourceId?: string;
    userId?: string;
    errorCode?: string;
    errorMessage?: string;
    details?: Record<string, unknown>;
  }
) {
  const userAgent = request.headers["user-agent"];
  await logAuditEvent(context, {
    eventType: data.eventType,
    method: request.method || "GET",
    path: request.url || "/",
    cohort: "user",
    userId: data.userId,
    ipAddress: getClientIp(request),
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    success: data.success,
    statusCode: data.statusCode,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
    resourceType: "federation_connection",
    resourceId: data.resourceId,
    action: "login",
    details: data.details,
  });
}

async function findConnectionForEmail(context: Context, email: string, organizationId?: string) {
  const connection = await findFederationConnectionForEmail(context, email, { organizationId });
  if (!connection) throw new ValidationError("No federation connection matches email domain");
  return await getFederationConnectionSecret(context, connection.id);
}

async function exchangeCode(
  context: Context,
  connection: FederationConnection,
  code: string,
  codeVerifier: string
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getCallbackUrl(context),
    client_id: connection.clientId,
    code_verifier: codeVerifier,
  });
  const clientSecret = await decryptFederationClientSecret(context, connection.clientSecretEnc);
  if (clientSecret) body.set("client_secret", clientSecret);
  const tokenResponse = await fetch(connection.tokenEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    redirect: "error",
  });
  if (!tokenResponse.ok) throw new UnauthorizedError("Federation token exchange failed");
  const json = TokenResponseSchema.safeParse(await tokenResponse.json());
  if (!json.success) throw new UnauthorizedError("Federation token response is invalid");
  return json.data;
}

async function validateIdToken(
  connection: FederationConnection,
  idToken: string,
  expectedNonce: string
) {
  const header = decodeProtectedHeader(idToken);
  if (!header.alg || header.alg === "none") throw new UnauthorizedError("Invalid ID token");
  const jwksResponse = await fetch(connection.jwksUri, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (!jwksResponse.ok) throw new UnauthorizedError("Federation JWKS fetch failed");
  const jwks = (await jwksResponse.json()) as { keys?: JWK[] };
  const keys = Array.isArray(jwks.keys) ? jwks.keys : [];
  const matchingKeys = keys.filter((key) => !header.kid || !key.kid || key.kid === header.kid);
  for (const key of matchingKeys) {
    try {
      const imported = await importJWK(key, header.alg);
      const result = await jwtVerify(idToken, imported, {
        issuer: connection.issuer,
        audience: connection.clientId,
        clockTolerance: 60,
      });
      if (result.payload.nonce !== expectedNonce) throw new UnauthorizedError("Invalid OIDC nonce");
      if (typeof result.payload.sub !== "string" || !result.payload.sub) {
        throw new UnauthorizedError("Invalid ID token subject");
      }
      return result.payload as JWTPayload & Record<string, unknown>;
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
    }
  }
  throw new UnauthorizedError("Invalid ID token signature");
}

async function mergeUserinfoClaims(
  connection: FederationConnection,
  idTokenClaims: JWTPayload & Record<string, unknown>,
  accessToken: string
) {
  if (!connection.userinfoEndpoint) return idTokenClaims;
  const response = await fetch(connection.userinfoEndpoint, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
    redirect: "error",
  });
  if (!response.ok) throw new UnauthorizedError("Federation userinfo fetch failed");
  const claims = (await response.json()) as Record<string, unknown>;
  if (claims.sub !== idTokenClaims.sub) {
    throw new UnauthorizedError("Federation userinfo subject mismatch");
  }
  return { ...claims, ...idTokenClaims };
}

async function getUserClientId(context: Context) {
  const uiUserSettings = (await getSetting(context, "ui_user")) as
    | { clientId?: string }
    | undefined
    | null;
  return typeof uiUserSettings?.clientId === "string" && uiUserSettings.clientId.length > 0
    ? uiUserSettings.clientId
    : "user";
}

function getCallbackUrl(context: Context) {
  return new URL(
    "/api/user/federation/oidc/callback",
    context.config.publicOrigin || context.config.issuer
  )
    .toString()
    .replace(/\/$/, "");
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function normalizeReturnTo(context: Context, value?: string | null) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const parsed = new URL(value);
    const publicOrigin = new URL(context.config.publicOrigin || context.config.issuer).origin;
    if (parsed.origin === publicOrigin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {}
  throw new ValidationError("return_to must stay on the DarkAuth origin");
}

function setCallbackCookie(response: ServerResponse, value: CallbackCookie) {
  appendSetCookie(
    response,
    `${callbackCookieName}=${encodeURIComponent(JSON.stringify(value))}; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=600`
  );
}

function clearCallbackCookie(response: ServerResponse) {
  appendSetCookie(
    response,
    `${callbackCookieName}=; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=0`
  );
}

function getCallbackCookie(request: IncomingMessage): CallbackCookie | null {
  const raw = request.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== callbackCookieName) continue;
    try {
      const parsed = JSON.parse(decodeURIComponent(part.slice(index + 1).trim()));
      if (
        parsed &&
        typeof parsed.state === "string" &&
        typeof parsed.nonce === "string" &&
        typeof parsed.codeVerifier === "string"
      ) {
        return parsed;
      }
    } catch {}
  }
  return null;
}

function appendSetCookie(response: ServerResponse, cookie: string) {
  const existing = response.getHeader("Set-Cookie");
  if (!existing) {
    response.setHeader("Set-Cookie", [cookie]);
    return;
  }
  if (Array.isArray(existing)) {
    response.setHeader("Set-Cookie", [...existing.map(String), cookie]);
    return;
  }
  response.setHeader("Set-Cookie", [String(existing), cookie]);
}

export const startSchema = {
  method: "GET",
  path: "/federation/oidc/start",
  tags: ["Federation"],
  summary: "Start upstream OIDC federation sign-in",
  query: StartQuerySchema,
  responses: {
    302: { description: "Redirect to upstream OIDC provider" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const callbackSchema = {
  method: "GET",
  path: "/federation/oidc/callback",
  tags: ["Federation"],
  summary: "Complete upstream OIDC federation sign-in",
  query: z.object({
    state: z.string(),
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  responses: {
    302: { description: "Redirect after sign-in" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
