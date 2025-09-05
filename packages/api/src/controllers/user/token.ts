import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { eq } from "drizzle-orm";
import {
  authCodes,
  clients,
  groupPermissions,
  userGroups,
  userPermissions,
  users,
} from "../../db/schema.js";
import { InvalidGrantError, InvalidRequestError, UnauthorizedClientError } from "../../errors.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { signJWT } from "../../services/jwks.js";
import {
  createSession,
  getActorFromRefreshToken,
  refreshSessionWithToken,
} from "../../services/sessions.js";
import { getSetting } from "../../services/settings.js";
import type { Context, IdTokenClaims, TokenRequest, TokenResponse } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { constantTimeCompare } from "../../utils/crypto.js";
import {
  decodeBasicAuth,
  parseAuthorizationHeader,
  parseFormBody,
  sendJson,
} from "../../utils/http.js";
import { verifyCodeChallenge } from "../../utils/pkce.js";

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

      const tokenRequest: TokenRequest = {
        grant_type: formData.get("grant_type") || "",
        code: formData.get("code") || undefined,
        redirect_uri: formData.get("redirect_uri") || undefined,
        client_id: formData.get("client_id") || undefined,
        client_secret: formData.get("client_secret") || undefined,
        code_verifier: formData.get("code_verifier") || undefined,
        refresh_token: formData.get("refresh_token") || undefined,
      };

      if (tokenRequest.grant_type === "refresh_token") {
        if (!tokenRequest.refresh_token) throw new InvalidRequestError("refresh_token is required");
        let providedClientId: string | undefined;
        let clientAuthOk = false;
        const basic = parseAuthorizationHeader(request);
        if (basic && basic.type === "Basic") {
          const credentials = decodeBasicAuth(basic.credentials);
          if (!credentials)
            throw new UnauthorizedClientError("Invalid Basic authentication format");
          const client = await context.db.query.clients.findFirst({
            where: eq(clients.clientId, credentials.username),
          });
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
          const client = await context.db.query.clients.findFirst({
            where: eq(clients.clientId, tokenRequest.client_id),
          });
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
        const user = await context.db.query.users.findFirst({
          where: eq(users.sub, actor.userSub),
        });
        if (!user) throw new InvalidGrantError("User not found");
        if (!providedClientId) throw new UnauthorizedClientError("Client authentication failed");
        const client = await context.db.query.clients.findFirst({
          where: eq(clients.clientId, providedClientId),
        });
        if (!client) throw new UnauthorizedClientError("Unknown client");

        const userGroupsData = await context.db.query.userGroups.findMany({
          where: eq(userGroups.userSub, user.sub),
          with: { group: true },
        });
        const userPermissionsData = await context.db.query.userPermissions.findMany({
          where: eq(userPermissions.userSub, user.sub),
          with: { permission: true },
        });
        const allGroupPermissions: string[] = [];
        for (const ug of userGroupsData) {
          const permissions = await context.db.query.groupPermissions.findMany({
            where: eq(groupPermissions.groupKey, ug.groupKey),
            with: { permission: true },
          });
          for (const p of permissions) allGroupPermissions.push(p.permission.key);
        }
        const allPermissions = [
          ...userPermissionsData.map((up) => up.permission.key),
          ...allGroupPermissions,
        ];
        const uniquePermissions = [...new Set(allPermissions)];
        const groupsList = userGroupsData.map((ug) => ug.group.key);
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
        const idTokenClaims: IdTokenClaims = {
          iss: context.config.issuer,
          sub: user.sub,
          aud: providedClientId,
          exp: now + idTokenTtl,
          iat: now,
          email: user.email || undefined,
          email_verified: !!user.email,
          name: user.name || undefined,
          permissions: uniquePermissions.length > 0 ? uniquePermissions : undefined,
          groups: groupsList.length > 0 ? groupsList : undefined,
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
      const authCode = await context.db.query.authCodes.findFirst({
        where: eq(authCodes.code, tokenRequest.code),
      });

      if (!authCode) {
        console.warn("[token] code not found", tokenRequest.code);
        throw new InvalidGrantError("Invalid authorization code");
      }

      // Check if code has expired
      if (new Date() > authCode.expiresAt) {
        await context.db.delete(authCodes).where(eq(authCodes.code, tokenRequest.code));
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
      const client = await context.db.query.clients.findFirst({
        where: eq(clients.clientId, authCode.clientId),
      });

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
      const user = await context.db.query.users.findFirst({
        where: eq(users.sub, authCode.userSub),
      });

      if (!user) {
        throw new InvalidGrantError("User not found");
      }

      // Get user permissions and groups for claims
      const userGroupsData = await context.db.query.userGroups.findMany({
        where: eq(userGroups.userSub, user.sub),
        with: {
          group: true,
        },
      });

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
      const idTokenClaims: IdTokenClaims = {
        iss: context.config.issuer,
        sub: user.sub,
        aud: authenticatedClientId,
        exp: now + idTokenTtl,
        iat: now,
        email: user.email || undefined,
        email_verified: !!user.email,
        name: user.name || undefined,
        permissions: uniquePermissions.length > 0 ? uniquePermissions : undefined,
        groups: groups.length > 0 ? groups : undefined,
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
        if (authCode.drkJwe) {
          tokenResponse.zk_drk_jwe = authCode.drkJwe;
          console.log("[token] include zk_drk_jwe", { len: authCode.drkJwe.length });
        } else {
          console.log("[token] has_zk but no drk_jwe stored");
        }
      }

      const sessionData = {
        sub: user.sub,
        email: user.email || undefined,
        name: user.name || undefined,
      };
      const s = await createSession(context, "user", sessionData);
      tokenResponse.refresh_token = s.refreshToken;

      // Consume the authorization code (mark as used)
      await context.db
        .update(authCodes)
        .set({ consumed: true })
        .where(eq(authCodes.code, tokenRequest.code));

      sendJson(response, 200, tokenResponse);
    }
  )
);

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Resp = z.object({
    id_token: z.string().optional(),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().positive(),
    refresh_token: z.string().optional(),
  });
  registry.registerPath({
    method: "post",
    path: "/token",
    tags: ["Auth"],
    summary: "Token endpoint",
    request: {
      body: { content: { "application/x-www-form-urlencoded": { schema: TokenRequestSchema } } },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
