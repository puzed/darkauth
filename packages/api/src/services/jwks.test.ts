import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJwt } from "jose";
import type { Context } from "../types.ts";
import { generateEdDSAKeyPair, signJWT } from "./jwks.ts";

function createContextWithKey(issuer: string) {
  return async () => {
    const { publicJwk, privateJwk } = await generateEdDSAKeyPair();
    const privateJwkEnc = Buffer.from(JSON.stringify(privateJwk));

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
              privateJwkEnc,
              createdAt: new Date(),
            }),
          },
        },
      },
      services: {
        kek: {
          decrypt: async (data: Buffer) => data,
          encrypt: async (data: Buffer) => data,
          isAvailable: () => true,
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
