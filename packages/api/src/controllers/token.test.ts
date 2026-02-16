import assert from "node:assert/strict";
import { test } from "node:test";
import { InvalidRequestError, UnauthorizedClientError } from "../errors.js";
import {
  assertClientSecretMatches,
  buildUserIdTokenClaims,
  resolveGrantedScopes,
  TokenRequestSchema,
} from "./user/token.js";

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
    permissions: ["darkauth.users:read"],
    groups: ["users"],
    amr: ["pwd", "otp"],
    nonce: "nonce-value",
  });

  assert.equal(claims.nonce, "nonce-value");
  assert.equal(claims.aud, "client-id");
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
