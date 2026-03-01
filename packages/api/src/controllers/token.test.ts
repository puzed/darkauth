import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidGrantError, InvalidRequestError, UnauthorizedClientError } from "../errors.ts";
import {
  assertClientSecretMatches,
  assertRefreshTokenClientBinding,
  buildUserIdTokenClaims,
  resolveGrantedScopes,
  resolveSessionClientId,
  shouldIssueFirstPartyRefreshCookies,
  shouldIssueRefreshTokenForClient,
  TokenRequestSchema,
} from "./user/token.ts";

test("resolveGrantedScopes returns allowed scopes when no scope is requested", () => {
  const allowed = ["darkauth.users:read", "darkauth.groups:read"];
  const granted = resolveGrantedScopes(allowed);
  assert.deepEqual(granted, allowed);
});

test("resolveGrantedScopes returns requested scopes when all are allowed", () => {
  const granted = resolveGrantedScopes(
    ["darkauth.users:read", "darkauth.groups:read"],
    "darkauth.users:read"
  );
  assert.deepEqual(granted, ["darkauth.users:read"]);
});

test("resolveGrantedScopes throws when any requested scope is not allowed", () => {
  assert.throws(
    () => resolveGrantedScopes(["darkauth.users:read"], "darkauth.users:read darkauth.admin"),
    (error: unknown) =>
      error instanceof InvalidRequestError &&
      error.message === "Requested scope is not allowed for this client"
  );
});

test("assertClientSecretMatches throws unauthorized when decrypt fails", async () => {
  const context = {
    services: {
      kek: {
        isAvailable: () => true,
        decrypt: async () => {
          throw new Error("decrypt failed");
        },
      },
    },
  } as const;

  await assert.rejects(
    () => assertClientSecretMatches(context, Buffer.from("enc"), "secret"),
    (error: unknown) =>
      error instanceof UnauthorizedClientError &&
      error.message === "Client secret verification failed"
  );
});

test("TokenRequestSchema strips nonce on authorization_code grants", () => {
  const parsed = TokenRequestSchema.safeParse({
    grant_type: "authorization_code",
    code: "code-value",
    redirect_uri: "https://client.example/callback",
    nonce: "nonce-value",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal("nonce" in parsed.data, false);
});

test("buildUserIdTokenClaims includes nonce when provided", () => {
  const claims = buildUserIdTokenClaims({
    issuer: "https://issuer.example",
    subject: "user-sub",
    audience: "client-id",
    expiresAtSeconds: 200,
    issuedAtSeconds: 100,
    email: "user@example.com",
    name: "Test User",
    orgId: "8d1285e7-44f3-4d33-9f5c-36b7ec1ee804",
    orgSlug: "default",
    roles: ["member"],
    permissions: ["darkauth.users:read"],
    amr: ["pwd", "otp"],
    nonce: "nonce-value",
  });

  assert.equal(claims.nonce, "nonce-value");
  assert.equal(claims.aud, "client-id");
  assert.equal(claims.org_slug, "default");
});

test("buildUserIdTokenClaims omits nonce when not provided", () => {
  const claims = buildUserIdTokenClaims({
    issuer: "https://issuer.example",
    subject: "user-sub",
    audience: "client-id",
    expiresAtSeconds: 200,
    issuedAtSeconds: 100,
  });

  assert.equal(claims.nonce, undefined);
});

test("resolveSessionClientId returns client id for valid session data", () => {
  assert.equal(resolveSessionClientId({ clientId: "demo-client" }), "demo-client");
});

test("resolveSessionClientId returns null when client id is missing", () => {
  assert.equal(resolveSessionClientId({}), null);
});

test("resolveSessionClientId returns null for invalid shapes", () => {
  assert.equal(resolveSessionClientId(null), null);
  assert.equal(resolveSessionClientId("bad"), null);
  assert.equal(resolveSessionClientId({ clientId: 42 }), null);
});

test("assertRefreshTokenClientBinding accepts matching client ids", () => {
  assert.doesNotThrow(() => assertRefreshTokenClientBinding("demo-client", "demo-client"));
});

test("assertRefreshTokenClientBinding rejects mismatched client ids", () => {
  assert.throws(
    () => assertRefreshTokenClientBinding("demo-client", "other-client"),
    (error: unknown) =>
      error instanceof InvalidGrantError &&
      error.message === "Refresh token was not issued to this client"
  );
});

test("assertRefreshTokenClientBinding allows legacy unbound tokens", () => {
  assert.doesNotThrow(() => assertRefreshTokenClientBinding(null, "demo-client"));
});

test("shouldIssueFirstPartyRefreshCookies returns true for cookie-transport refresh requests", () => {
  assert.equal(
    shouldIssueFirstPartyRefreshCookies({
      grant_type: "refresh_token",
      client_id: "demo-public-client",
    }),
    true
  );
});

test("shouldIssueFirstPartyRefreshCookies returns false for body refresh token requests", () => {
  assert.equal(
    shouldIssueFirstPartyRefreshCookies({
      grant_type: "refresh_token",
      client_id: "demo-public-client",
      refresh_token: "rt-123",
    }),
    false
  );
});

test("shouldIssueRefreshTokenForClient returns true when client allows refresh_token grant", () => {
  assert.equal(shouldIssueRefreshTokenForClient(["authorization_code", "refresh_token"]), true);
});

test("shouldIssueRefreshTokenForClient returns false when client does not allow refresh_token grant", () => {
  assert.equal(shouldIssueRefreshTokenForClient(["authorization_code"]), false);
});
