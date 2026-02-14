import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { test } from "node:test";
import type { Context } from "../../types.js";
import { hasValidAppSecret } from "./usersAppSecret.js";

function createRequest(authorization?: string): IncomingMessage {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as IncomingMessage;
}

function createContext(client: unknown, decryptedSecret = "secret-value"): Context {
  return {
    db: {
      query: {
        clients: {
          findFirst: async () => client,
        },
      },
    },
    services: {
      kek: {
        isAvailable: () => true,
        decrypt: async () => Buffer.from(decryptedSecret),
      },
    },
  } as unknown as Context;
}

test("hasValidAppSecret accepts confidential client basic auth with matching secret", async () => {
  const client = {
    clientId: "support-desk",
    type: "confidential",
    tokenEndpointAuthMethod: "client_secret_basic",
    clientSecretEnc: Buffer.from("enc"),
  };
  const context = createContext(client, "top-secret");
  const authorization = `Basic ${Buffer.from("support-desk:top-secret").toString("base64")}`;
  const request = createRequest(authorization);

  const result = await hasValidAppSecret(context, request);
  assert.equal(result, true);
});

test("hasValidAppSecret rejects bearer token", async () => {
  const client = {
    clientId: "support-desk",
    type: "confidential",
    tokenEndpointAuthMethod: "client_secret_basic",
    clientSecretEnc: Buffer.from("enc"),
  };
  const context = createContext(client, "top-secret");
  const request = createRequest("Bearer top-secret");

  const result = await hasValidAppSecret(context, request);
  assert.equal(result, false);
});

test("hasValidAppSecret rejects public clients", async () => {
  const client = {
    clientId: "app-web",
    type: "public",
    tokenEndpointAuthMethod: "none",
    clientSecretEnc: null,
  };
  const context = createContext(client);
  const authorization = `Basic ${Buffer.from("app-web:anything").toString("base64")}`;
  const request = createRequest(authorization);

  const result = await hasValidAppSecret(context, request);
  assert.equal(result, false);
});

test("hasValidAppSecret rejects when KEK is unavailable", async () => {
  const client = {
    clientId: "support-desk",
    type: "confidential",
    tokenEndpointAuthMethod: "client_secret_basic",
    clientSecretEnc: Buffer.from("enc"),
  };
  const context = {
    db: {
      query: {
        clients: {
          findFirst: async () => client,
        },
      },
    },
    services: {},
  } as unknown as Context;
  const authorization = `Basic ${Buffer.from("support-desk:top-secret").toString("base64")}`;
  const request = createRequest(authorization);

  const result = await hasValidAppSecret(context, request);
  assert.equal(result, false);
});
