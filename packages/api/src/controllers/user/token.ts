import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { InvalidGrantError, InvalidRequestError, UnauthorizedClientError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { signJWT } from "../../services/jwks.js";
import {
  createSession,
  getActorFromRefreshToken,
  refreshSessionWithToken,
} from "../../services/sessions.js";
import { getSetting } from "../../services/settings.js";
import type {
  Context,
  ControllerSchema,
  IdTokenClaims,
  TokenRequest,
  TokenResponse,
} from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { constantTimeCompare } from "../../utils/crypto.js";
import {
  decodeBasicAuth,
  parseAuthorizationHeader,
  parseFormBody,
  sendJson,
} from "../../utils/http.js";
import { verifyCodeChallenge } from "../../utils/pkce.js";

async function resolveIssuer(context: Context): Promise<string> {
  const issuerSetting = await getSetting(context, "issuer");
  if (typeof issuerSetting === "string" && issuerSetting.length > 0) return issuerSetting;
  return context.config.issuer;
}

export const TokenRequestSchema = z.union([
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.string().url().optional(),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    code_verifier: z.string().optional(),
    refresh_token: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    code: z.string().optional(),
    redirect_uri: z.string().url().optional(),
    code_verifier: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal("client_credentials"),
    code: z.string().optional(),
    redirect_uri: z.string().url().optional(),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    code_verifier: z.string().optional(),
    refresh_token: z.string().optional(),
  }),
]);

export const postToken = withRateLimit("token")(
  withAudit({
    eventType: "TOKEN_ISSUED",
    resourceType: "token",
    extractResourceId: (body) =>
      body && typeof body === "object" && "client_id" in body
        ? (body as { client_id?: string }).client_id
        : undefined,
  })(
    async (
      context: Context,
      request: IncomingMessage,
      response: ServerResponse,
      ..._params: unknown[]
    ): Promise<void> => {
      const body = await getCachedBody(request);
      const formData = parseFormBody(body);

      const rawRequest = Object.fromEntries(formData as unknown as Iterable<[string, string]>);
      const parsedRequest = TokenRequestSchema.safeParse(rawRequest);
      if (!parsedRequest.success) {
        throw new InvalidRequestError(parsedRequest.error.issues[0]?.message || "Invalid request");
      }
      const tokenRequest = parsedRequest.data as TokenRequest;

      if (tokenRequest.grant_type === "refresh_token") {
        if (!tokenRequest.refresh_token) throw new InvalidRequestError("refresh_token is required");
        let providedClientId: string | undefined;
        let clientAuthOk = false;
        const basic = parseAuthorizationHeader(request);
        if (basic && basic.type === "Basic") {
          const credentials = decodeBasicAuth(basic.credentials);
          if (!credentials)
            throw new UnauthorizedClientError("Invalid Basic authentication format");
          const client = await (await import("../../models/clients.js")).getClient(
            context,
            credentials.username
          );
          if (!client) throw new UnauthorizedClientError("Unknown client");
          if (client.tokenEndpointAuthMethod !== "client_secret_basic")
            throw new UnauthorizedClientError("Invalid client auth method");
          if (!client.clientSecretEnc || !context.services.kek?.isAvailable())
            throw new UnauthorizedClientError("Client secret verification failed");
          const decryptedSecret = await context.services.kek.decrypt(client.clientSecretEnc);
          const storedSecret = decryptedSecret.toString("utf-8");
          if (!constantTimeCompare(credentials.password, storedSecret))
            throw new UnauthorizedClientError("Invalid client credentials");
          providedClientId = client.clientId;
          clientAuthOk = true;
        } else {
          if (!tokenRequest.client_id)
            throw new InvalidRequestError("client_id is required for public clients");
          const client = await (await import("../../models/clients.js")).getClient(
            context,
            tokenRequest.client_id
          );
          if (!client) throw new UnauthorizedClientError("Unknown client");
          if (client.tokenEndpointAuthMethod !== "none")
            throw new UnauthorizedClientError("Invalid client auth method");
          providedClientId = client.clientId;
          clientAuthOk = true;
        }
        if (!clientAuthOk) throw new UnauthorizedClientError("Client authentication failed");
        const actor = await getActorFromRefreshToken(context, tokenRequest.refresh_token);
        if (!actor || !actor.userSub)
          throw new InvalidGrantError("Invalid or expired refresh token");
        const { getUserBySub } = await import("../../models/users.js");
        const user = await getUserBySub(context, actor.userSub);
        if (!user) throw new InvalidGrantError("User not found");
        if (!providedClientId) throw new UnauthorizedClientError("Client authentication failed");
        const client = await (await import("../../models/clients.js")).getClient(
          context,
          providedClientId
        );
        if (!client) throw new UnauthorizedClientError("Unknown client");

        const { getUserAccess } = await import("../../models/access.js");
        const { groupsList, permissions: uniquePermissions } = await getUserAccess(
          context,
          user.sub
        );
        const now = Math.floor(Date.now() / 1000);
        let defaultIdTtl = 300;
        const idSettings = (await getSetting(context, "id_token")) as
          | { lifetime_seconds?: number }
          | undefined
          | null;
        if (idSettings?.lifetime_seconds && idSettings.lifetime_seconds > 0)
          defaultIdTtl = idSettings.lifetime_seconds;
        else {
          const flat = (await getSetting(context, "id_token.lifetime_seconds")) as
            | number
            | undefined
            | null;
          if (typeof flat === "number" && flat > 0) defaultIdTtl = flat;
        }
        const idTokenTtl =
          client.idTokenLifetimeSeconds && client.idTokenLifetimeSeconds > 0
            ? client.idTokenLifetimeSeconds
            : defaultIdTtl;
        let amr: string[] | undefined = ["pwd"];
        const { sessions } = await import("../../db/schema.js");
        const { eq } = await import("drizzle-orm");
        const sess = await context.db.query.sessions.findFirst({
          where: eq(sessions.refreshToken, tokenRequest.refresh_token),
        });
        const data = (sess?.data || {}) as Record<string, unknown>;
        if (data && data.otpVerified === true) amr = ["pwd", "otp"];
        const issuer = await resolveIssuer(context);
        const idTokenClaims: IdTokenClaims = {
          iss: issuer,
          sub: user.sub,
          aud: providedClientId,
          exp: now + idTokenTtl,
          iat: now,
          email: user.email || undefined,
          email_verified: !!user.email,
          name: user.name || undefined,
          permissions: uniquePermissions.length > 0 ? uniquePermissions : undefined,
          groups: groupsList.length > 0 ? groupsList : undefined,
          acr: amr ? "mfa" : undefined,
          amr,
        };
        const idToken = await signJWT(
          context,
          idTokenClaims as import("jose").JWTPayload,
          `${idTokenTtl}s`
        );
        const rotated = await refreshSessionWithToken(context, tokenRequest.refresh_token);
        if (!rotated) throw new InvalidGrantError("Invalid or expired refresh token");
        const tokenResponse: TokenResponse = {
          id_token: idToken,
          token_type: "Bearer",
          expires_in: idTokenTtl,
          refresh_token: rotated.refreshToken,
        };
        sendJson(response, 200, tokenResponse);
        return;
      }

      if (tokenRequest.grant_type !== "authorization_code") {
        throw new InvalidRequestError("Only authorization_code grant type is supported");
      }

      if (!tokenRequest.code) {
        throw new InvalidRequestError("code is required");
      }

      if (!tokenRequest.redirect_uri) {
        throw new InvalidRequestError("redirect_uri is required");
      }

      // Look up authorization code
      const authCode = await (await import("../../models/authCodes.js")).getAuthCode(
        context,
        tokenRequest.code
      );

      if (!authCode) {
        context.logger.warn("token code not found");
        throw new InvalidGrantError("Invalid authorization code");
      }

      // Check if code has expired
      if (new Date() > authCode.expiresAt) {
        await (await import("../../models/authCodes.js")).deleteAuthCode(
          context,
          tokenRequest.code
        );
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
      const client = await (await import("../../models/clients.js")).getClient(
        context,
        authCode.clientId
      );

      if (!client) {
        throw new UnauthorizedClientError("Unknown client");
      }

      // Handle client authentication
      let authenticatedClientId: string | undefined;

      if (client.tokenEndpointAuthMethod === "none") {
        // Public client - client_id in form data is sufficient
        if (!tokenRequest.client_id) {
          throw new InvalidRequestError("client_id is required for public clients");
        }
        if (tokenRequest.client_id !== authCode.clientId) {
          throw new UnauthorizedClientError("client_id does not match authorization code");
        }
        authenticatedClientId = tokenRequest.client_id;
      } else if (client.tokenEndpointAuthMethod === "client_secret_basic") {
        // Confidential client - require Basic auth
        const authHeader = parseAuthorizationHeader(request);
        if (!authHeader || authHeader.type !== "Basic") {
          throw new UnauthorizedClientError("Basic authentication required");
        }

        const credentials = decodeBasicAuth(authHeader.credentials);
        if (!credentials) {
          throw new UnauthorizedClientError("Invalid Basic authentication format");
        }

        if (credentials.username !== authCode.clientId) {
          throw new UnauthorizedClientError("Client ID does not match authorization code");
        }

        // Decrypt and verify client secret
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

        authenticatedClientId = credentials.username;
      } else {
        throw new InvalidRequestError("Unsupported client authentication method");
      }

      // Verify PKCE if present
      if (authCode.codeChallenge) {
        if (!tokenRequest.code_verifier) {
          throw new InvalidRequestError("code_verifier is required when PKCE is used");
        }

        if (
          !verifyCodeChallenge(
            tokenRequest.code_verifier,
            authCode.codeChallenge,
            authCode.codeChallengeMethod || "S256"
          )
        ) {
          throw new InvalidGrantError("Invalid PKCE code verifier");
        }
      } else if (client.requirePkce || client.type === "public") {
        throw new InvalidGrantError("PKCE is required for this client");
      }

      // Look up user
      const { getUserBySub } = await import("../../models/users.js");
      const user = await getUserBySub(context, authCode.userSub);

      if (!user) {
        throw new InvalidGrantError("User not found");
      }

      const { getUserAccess } = await import("../../models/access.js");
      const access = await getUserAccess(context, user.sub);
      const uniquePermissions = access.permissions;
      const groups = access.groupsList;

      // Create ID token claims
      const now = Math.floor(Date.now() / 1000);
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
      const idTokenTtl =
        client.idTokenLifetimeSeconds && client.idTokenLifetimeSeconds > 0
          ? client.idTokenLifetimeSeconds
          : defaultIdTtl;
      let amr: string[] | undefined = ["pwd"];
      const { sessions } = await import("../../db/schema.js");
      const { and, eq, gt } = await import("drizzle-orm");
      const row = await context.db.query.sessions.findFirst({
        where: and(eq(sessions.userSub, user.sub), gt(sessions.expiresAt, new Date())),
      });
      const data = (row?.data || {}) as Record<string, unknown>;
      if (data && data.otpVerified === true) amr = ["pwd", "otp"];
      const issuer = await resolveIssuer(context);
      const idTokenClaims: IdTokenClaims = {
        iss: issuer,
        sub: user.sub,
        aud: authenticatedClientId,
        exp: now + idTokenTtl,
        iat: now,
        email: user.email || undefined,
        email_verified: !!user.email,
        name: user.name || undefined,
        permissions: uniquePermissions.length > 0 ? uniquePermissions : undefined,
        groups: groups.length > 0 ? groups : undefined,
        acr: amr ? "mfa" : undefined,
        amr: amr,
      };

      // Generate and sign ID token
      const idToken = await signJWT(
        context,
        idTokenClaims as import("jose").JWTPayload,
        `${idTokenTtl}s`
      );

      // Prepare token response
      const tokenResponse: TokenResponse = {
        id_token: idToken,
        token_type: "Bearer",
        expires_in: idTokenTtl,
      };

      // Handle ZK delivery (include zk_drk_hash if applicable)
      if (authCode.hasZk) {
        if (authCode.drkHash) tokenResponse.zk_drk_hash = authCode.drkHash;
        context.logger.info("token zk delivery: drk_hash included");
      }

      const sessionData = {
        sub: user.sub,
        email: user.email || undefined,
        name: user.name || undefined,
      };
      const s = await createSession(context, "user", sessionData);
      tokenResponse.refresh_token = s.refreshToken;

      // Consume the authorization code (mark as used)
      await (await import("../../models/authCodes.js")).consumeAuthCode(context, tokenRequest.code);

      sendJson(response, 200, tokenResponse);
    }
  )
);

const TokenResponseSchema = z.object({
  id_token: z.string().optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().optional(),
});

export const schema = {
  method: "POST",
  path: "/token",
  tags: ["Auth"],
  summary: "Token endpoint",
  body: {
    description: "",
    required: true,
    contentType: "application/x-www-form-urlencoded",
    schema: TokenRequestSchema,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: TokenResponseSchema } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
