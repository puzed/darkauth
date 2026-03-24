import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJwt, exportJWK, generateKeyPair } from "jose";
import type { Context } from "../types.ts";
import { signJWT } from "./jwks.ts";

function createContextWithKey(issuer: string) {
  return async () => {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA");
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);

    const context = {
      config: {
        issuer,
      },
      db: {
        query: {
          jwks: {
            findFirst: async () => ({
              kid: "test-kid",
              publicJwk,
              privateJwk,
              privateJwkEnc: null,
              createdAt: new Date(),
            }),
          },
        },
      },
    } as unknown as Context;

    return context;
  };
}

test("signJWT preserves payload issuer when provided", async () => {
  const context = await createContextWithKey("http://localhost:9080")();

  const token = await signJWT(
    context,
    {
      sub: "user-sub",
      iss: "https://auth.puzed.com",
    },
    "5m"
  );

  const claims = decodeJwt(token);
  assert.equal(claims.iss, "https://auth.puzed.com");
});

test("signJWT falls back to context issuer when payload issuer is absent", async () => {
  const context = await createContextWithKey("https://auth.puzed.com")();

  const token = await signJWT(
    context,
    {
      sub: "user-sub",
    },
    "5m"
  );

  const claims = decodeJwt(token);
  assert.equal(claims.iss, "https://auth.puzed.com");
});
