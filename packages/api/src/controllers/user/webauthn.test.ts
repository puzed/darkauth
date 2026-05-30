import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { organizationMembers, organizations, sessions, users } from "../../db/schema.ts";
import { createAccountKey } from "../../models/keybag.ts";
import {
  createPasskeyPrfEnvelope,
  createWebAuthnChallenge,
  createWebAuthnCredential,
} from "../../models/webauthn.ts";
import type { Context } from "../../types.ts";
import { toBase64Url } from "../../utils/crypto.ts";
import {
  getWebAuthnCredentials,
  postPasskeyPrfEnvelope,
  postWebAuthnCredentialRevoke,
  postWebAuthnLoginFinish,
  postWebAuthnLoginStart,
  postWebAuthnRegisterFinish,
  postWebAuthnRegisterStart,
} from "./webauthn.ts";

function createLogger() {
  return {
    error() {},
    warn() {},
    info() {},
    debug() {},
    trace() {},
    fatal() {},
  };
}

async function createContext() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-webauthn-controller-test-"));
  const { db, close } = await createPglite(directory);
  const context = {
    db,
    logger: createLogger(),
    services: {},
    config: { rpId: "auth.example.com" },
  } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

async function createUserSession(context: Context, sub: string, sessionId = `session-${sub}`) {
  await context.db.insert(users).values({
    sub,
    email: `${sub}@example.com`,
    name: sub,
  });
  await context.db.insert(sessions).values({
    id: sessionId,
    cohort: "user",
    userSub: sub,
    expiresAt: new Date(Date.now() + 60_000),
    data: { sub, email: `${sub}@example.com`, name: sub, otpVerified: true },
  });
  return sessionId;
}

function createRequest(options: {
  method?: string;
  url?: string;
  sessionId?: string;
  body?: unknown;
}): IncomingMessage {
  const rawBody = options.body === undefined ? "" : JSON.stringify(options.body);
  const request = Readable.from(rawBody ? [rawBody] : []) as IncomingMessage;
  request.method = options.method ?? "POST";
  request.url = options.url ?? "/";
  request.headers = {
    host: "auth.example.com",
    ...(options.sessionId
      ? { cookie: `__Host-DarkAuth-User=${encodeURIComponent(options.sessionId)}` }
      : {}),
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & {
  body: string;
  headers: Record<string, string | number | string[]>;
  json: unknown;
} {
  const response = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string | number | string[]>,
    json: undefined as unknown,
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        this.json = JSON.parse(this.body);
      }
      return this;
    },
    write(chunk?: unknown) {
      if (chunk !== undefined) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      return true;
    },
  };
  return response as ServerResponse & {
    body: string;
    headers: Record<string, string | number | string[]>;
    json: unknown;
  };
}

test("webauthn start endpoints return bounded public key options with PRF detection hints", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    await createWebAuthnCredential(context, {
      credentialId: "existing-credential",
      sub: "user-a",
      publicKey: Buffer.from("public-key"),
      transports: ["internal"],
    });
    await createAccountKey(context, { keyId: "ark_user-a_1", sub: "user-a" });
    await createWebAuthnCredential(context, {
      credentialId: "credential-prf-login",
      sub: "user-a",
      publicKey: Buffer.from("public-key-prf"),
      transports: ["internal"],
      prfSupported: true,
    });
    await createPasskeyPrfEnvelope(context, {
      credentialId: "credential-prf-login",
      sub: "user-a",
      keyId: "ark_user-a_1",
      envelopeId: "env_prf_login",
      wrappingAlg: "WebAuthn-PRF-HKDF-SHA256+A256GCM/v2",
      wrappedKey: Buffer.from("wrapped-key"),
      aad: Buffer.from("aad"),
      prfSalt: Buffer.from("login-prf-salt-32-byte-value!!"),
      prfResultConfirmed: true,
    });

    const registerResponse = createResponse();
    await postWebAuthnRegisterStart(
      context,
      createRequest({ url: "/webauthn/register/start", sessionId }),
      registerResponse
    );

    const registerBody = registerResponse.json as {
      public_key: {
        rp: { id: string };
        excludeCredentials: Array<{ id: string }>;
        extensions: { prf: { eval: { first: string } } };
      };
    };
    assert.equal(registerResponse.statusCode, 200);
    assert.equal(registerBody.public_key.rp.id, "auth.example.com");
    assert.equal(registerBody.public_key.excludeCredentials[0]?.id, "existing-credential");
    assert.match(registerBody.public_key.extensions.prf.eval.first, /^[A-Za-z0-9_-]+$/);

    const loginResponse = createResponse();
    await postWebAuthnLoginStart(
      context,
      createRequest({ url: "/webauthn/login/start" }),
      loginResponse
    );

    const loginBody = loginResponse.json as {
      public_key: {
        rpId: string;
        allowCredentials: unknown[];
        extensions: { prf: { eval: { first: string }; evalByCredential: Record<string, unknown> } };
      };
    };
    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginBody.public_key.rpId, "auth.example.com");
    assert.deepEqual(loginBody.public_key.allowCredentials, []);
    assert.match(loginBody.public_key.extensions.prf.eval.first, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(Object.keys(loginBody.public_key.extensions.prf.evalByCredential), [
      "credential-prf-login",
    ]);
  } finally {
    await cleanup();
  }
});

test("webauthn registration finish verifies and stores PRF-capable credentials", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    const challenge = await createWebAuthnChallenge(context, {
      type: "registration",
      sub: "user-a",
    });
    context.services.webauthn = {
      verifyRegistrationResponse: async () => ({
        verified: true,
        registrationInfo: {
          aaguid: "00000000-0000-0000-0000-000000000000",
          credential: {
            id: "credential-created",
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 7,
            transports: ["internal"],
          },
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true,
          userVerified: true,
        },
      }),
    };

    const response = createResponse();
    await postWebAuthnRegisterFinish(
      context,
      createRequest({
        url: "/webauthn/register/finish",
        sessionId,
        body: {
          challenge_id: challenge.challengeId,
          response: {
            id: "credential-created",
            rawId: "credential-created",
            response: { clientDataJSON: "abc", attestationObject: "def", transports: ["internal"] },
            clientExtensionResults: { prf: { enabled: true } },
            type: "public-key",
          },
        },
      }),
      response
    );

    const body = response.json as {
      credential: { credential_id: string; can_unlock: boolean; prf_supported: boolean };
    };
    assert.equal(response.statusCode, 201);
    assert.equal(body.credential.credential_id, "credential-created");
    assert.equal(body.credential.prf_supported, true);
    assert.equal(body.credential.can_unlock, false);
  } finally {
    await cleanup();
  }
});

test("webauthn login finish creates a key-locked user session", async () => {
  const { context, cleanup } = await createContext();
  try {
    await context.db.insert(users).values({
      sub: "user-a",
      email: "user-a@example.com",
      name: "user-a",
    });
    const [organization] = await context.db
      .insert(organizations)
      .values({ slug: "org-a", name: "Org A" })
      .returning();
    await context.db.insert(organizationMembers).values({
      organizationId: organization.id,
      userSub: "user-a",
      status: "active",
    });
    await createWebAuthnCredential(context, {
      credentialId: "credential-login",
      sub: "user-a",
      publicKey: Buffer.from("public-key"),
      signCount: 2,
      prfSupported: false,
    });
    const challenge = await createWebAuthnChallenge(context, { type: "login" });
    context.services.webauthn = {
      verifyAuthenticationResponse: async () => ({
        verified: true,
        authenticationInfo: { newCounter: 3 },
      }),
    };

    const response = createResponse();
    await postWebAuthnLoginFinish(
      context,
      createRequest({
        url: "/webauthn/login/finish",
        body: {
          challenge_id: challenge.challengeId,
          response: {
            id: "credential-login",
            rawId: "credential-login",
            response: {
              clientDataJSON: "abc",
              authenticatorData: "def",
              signature: "sig",
            },
            clientExtensionResults: {},
            type: "public-key",
          },
        },
      }),
      response
    );
    const body = response.json as {
      sub: string;
      key_state: string;
      credential: { can_unlock: boolean };
    };
    assert.equal(response.statusCode, 200);
    assert.equal(body.sub, "user-a");
    assert.equal(body.key_state, "locked");
    assert.equal(body.credential.can_unlock, false);
    assert.match(String(response.getHeader("set-cookie")), /__Host-DarkAuth-User=/);
  } finally {
    await cleanup();
  }
});

test("webauthn login finish returns PRF unlock envelope when confirmed", async () => {
  const { context, cleanup } = await createContext();
  try {
    await context.db.insert(users).values({
      sub: "user-a",
      email: "user-a@example.com",
      name: "user-a",
    });
    const [organization] = await context.db
      .insert(organizations)
      .values({ slug: "org-a", name: "Org A" })
      .returning();
    await context.db.insert(organizationMembers).values({
      organizationId: organization.id,
      userSub: "user-a",
      status: "active",
    });
    await createAccountKey(context, { keyId: "ark_user-a_1", sub: "user-a" });
    await createWebAuthnCredential(context, {
      credentialId: "credential-prf-login",
      sub: "user-a",
      publicKey: Buffer.from("public-key"),
      signCount: 2,
      prfSupported: true,
    });
    await createPasskeyPrfEnvelope(context, {
      credentialId: "credential-prf-login",
      sub: "user-a",
      keyId: "ark_user-a_1",
      envelopeId: "env_prf_login",
      wrappingAlg: "WebAuthn-PRF-HKDF-SHA256+A256GCM/v2",
      wrappedKey: Buffer.from("wrapped-key"),
      aad: Buffer.from("aad"),
      prfSalt: Buffer.from("login-prf-salt-32-byte-value!!"),
      prfResultConfirmed: true,
    });
    const challenge = await createWebAuthnChallenge(context, { type: "login" });
    context.services.webauthn = {
      verifyAuthenticationResponse: async () => ({
        verified: true,
        authenticationInfo: { newCounter: 3 },
      }),
    };

    const response = createResponse();
    await postWebAuthnLoginFinish(
      context,
      createRequest({
        url: "/webauthn/login/finish",
        body: {
          challenge_id: challenge.challengeId,
          prf_result_confirmed: true,
          response: {
            id: "credential-prf-login",
            rawId: "credential-prf-login",
            response: {
              clientDataJSON: "abc",
              authenticatorData: "def",
              signature: "sig",
            },
            clientExtensionResults: {},
            type: "public-key",
          },
        },
      }),
      response
    );
    const body = response.json as {
      sub: string;
      key_state: string;
      credential: { can_unlock: boolean };
      unlock: { prf_salt: string; envelope: { envelope_id: string; wrapped_key: string } } | null;
    };
    assert.equal(response.statusCode, 200);
    assert.equal(body.sub, "user-a");
    assert.equal(body.key_state, "unlocked");
    assert.equal(body.credential.can_unlock, true);
    assert.equal(body.unlock?.envelope.envelope_id, "env_prf_login");
    assert.equal(body.unlock?.envelope.wrapped_key, toBase64Url(Buffer.from("wrapped-key")));
    assert.equal(body.unlock?.prf_salt, toBase64Url(Buffer.from("login-prf-salt-32-byte-value!!")));
  } finally {
    await cleanup();
  }
});

test("passkey PRF envelope endpoint requires a PRF-capable credential and confirmed result", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    await createAccountKey(context, { keyId: "ark_user-a_1", sub: "user-a" });
    await createWebAuthnCredential(context, {
      credentialId: "cred-prf",
      sub: "user-a",
      publicKey: Buffer.from("public-key-prf"),
      prfSupported: true,
    });

    const response = createResponse();
    await postPasskeyPrfEnvelope(
      context,
      createRequest({
        url: "/webauthn/prf-envelope",
        sessionId,
        body: {
          credential_id: "cred-prf",
          key_id: "ark_user-a_1",
          envelope_id: "env_prf",
          wrapping_alg: "WebAuthn-PRF-HKDF-SHA256+A256GCM",
          wrapped_key: toBase64Url(Buffer.from("wrapped-key")),
          aad: toBase64Url(Buffer.from("aad")),
          prf_salt: toBase64Url(Buffer.from("prf-salt")),
          prf_result_confirmed: true,
        },
      }),
      response
    );

    const body = response.json as {
      envelope: {
        envelope_id: string;
        type: string;
        metadata: { credential_id: string; prf_result_confirmed: boolean };
      };
    };
    assert.equal(response.statusCode, 201);
    assert.equal(body.envelope.envelope_id, "env_prf");
    assert.equal(body.envelope.type, "passkey_prf");
    assert.deepEqual(body.envelope.metadata, {
      credential_id: "cred-prf",
      prf_result_confirmed: true,
    });
  } finally {
    await cleanup();
  }
});

test("webauthn credentials endpoint lists and revokes passkeys", async () => {
  const { context, cleanup } = await createContext();
  try {
    const sessionId = await createUserSession(context, "user-a");
    await createAccountKey(context, { keyId: "ark_user-a_1", sub: "user-a" });
    await createWebAuthnCredential(context, {
      credentialId: "credential-auth-only",
      sub: "user-a",
      publicKey: Buffer.from("public-key"),
      prfSupported: false,
    });
    await createWebAuthnCredential(context, {
      credentialId: "credential-prf",
      sub: "user-a",
      publicKey: Buffer.from("public-key-prf"),
      prfSupported: true,
    });
    await createPasskeyPrfEnvelope(context, {
      credentialId: "credential-prf",
      sub: "user-a",
      keyId: "ark_user-a_1",
      envelopeId: "env_prf",
      wrappingAlg: "WebAuthn-PRF-HKDF-SHA256+A256GCM/v2",
      wrappedKey: Buffer.from("wrapped-key"),
      aad: Buffer.from("aad"),
      prfSalt: Buffer.from("login-prf-salt-32-byte-value!!"),
      prfResultConfirmed: true,
    });

    const listResponse = createResponse();
    await getWebAuthnCredentials(
      context,
      createRequest({ method: "GET", url: "/webauthn/credentials", sessionId }),
      listResponse
    );
    const listBody = listResponse.json as {
      credentials: Array<{ credential_id: string; can_unlock: boolean }>;
    };

    assert.equal(listResponse.statusCode, 200);
    assert.deepEqual(
      listBody.credentials
        .map((credential) => [credential.credential_id, credential.can_unlock])
        .sort(),
      [
        ["credential-auth-only", false],
        ["credential-prf", true],
      ]
    );

    const revokeResponse = createResponse();
    await postWebAuthnCredentialRevoke(
      context,
      createRequest({
        method: "POST",
        url: "/webauthn/credentials/credential-prf/revoke",
        sessionId,
      }),
      revokeResponse,
      "credential-prf"
    );
    const revokeBody = revokeResponse.json as {
      credential: { credential_id: string; revoked_at: string };
    };

    assert.equal(revokeResponse.statusCode, 200);
    assert.equal(revokeBody.credential.credential_id, "credential-prf");
    assert.ok(revokeBody.credential.revoked_at);

    const afterRevokeResponse = createResponse();
    await getWebAuthnCredentials(
      context,
      createRequest({ method: "GET", url: "/webauthn/credentials", sessionId }),
      afterRevokeResponse
    );
    const afterRevokeBody = afterRevokeResponse.json as {
      credentials: Array<{ credential_id: string }>;
    };
    assert.deepEqual(
      afterRevokeBody.credentials.map((credential) => credential.credential_id).sort(),
      ["credential-auth-only"]
    );
  } finally {
    await cleanup();
  }
});
