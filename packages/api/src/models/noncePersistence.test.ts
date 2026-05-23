import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../types.ts";
import { createAuthCode } from "./authCodes.ts";
import { createPendingAuth } from "./authorize.ts";

test("createPendingAuth stores nonce in pending auth record", async () => {
  let insertedValues: Record<string, unknown> | undefined;

  const context = {
    db: {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValues = values;
          return Promise.resolve();
        },
      }),
    },
  } as unknown as Context;

  const result = await createPendingAuth(context, {
    requestId: "request-id",
    clientId: "client-id",
    redirectUri: "https://client.example/callback",
    scope: "openid profile",
    state: "state-value",
    nonce: "nonce-value",
    codeChallenge: "challenge",
    codeChallengeMethod: "S256",
    origin: "https://issuer.example",
    expiresAt: new Date("2026-02-15T00:00:00.000Z"),
  });

  assert.equal(result.requestId, "request-id");
  assert.equal(insertedValues?.nonce, "nonce-value");
  assert.equal(insertedValues?.scope, "openid profile");
});

test("createPendingAuth explains pending auth schema drift", async () => {
  const context = {
    db: {
      insert: () => ({
        values: () =>
          Promise.reject({
            code: "42703",
            message: 'column "scope" of relation "pending_auth" does not exist',
          }),
      }),
    },
  } as unknown as Context;

  await assert.rejects(
    () =>
      createPendingAuth(context, {
        requestId: "request-id",
        clientId: "client-id",
        redirectUri: "https://client.example/callback",
        scope: "openid profile",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        origin: "https://issuer.example",
        expiresAt: new Date("2026-02-15T00:00:00.000Z"),
      }),
    {
      name: "AppError",
      error: "server_error",
      error_description: "DarkAuth database schema is out of date; run migrations",
      statusCode: 500,
    }
  );
});

test("createAuthCode stores nonce in auth code record", async () => {
  let insertedValues: Record<string, unknown> | undefined;

  const context = {
    db: {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValues = values;
          return Promise.resolve();
        },
      }),
    },
  } as unknown as Context;

  await createAuthCode(context, {
    code: "code-value",
    clientId: "client-id",
    userSub: "user-sub",
    redirectUri: "https://client.example/callback",
    scope: "openid profile",
    nonce: "nonce-value",
    codeChallenge: "challenge",
    codeChallengeMethod: "S256",
    expiresAt: new Date("2026-02-15T00:00:00.000Z"),
  });

  assert.equal(insertedValues?.nonce, "nonce-value");
  assert.equal(insertedValues?.scope, "openid profile");
});
