import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { createPglite } from "../../db/pglite.ts";
import { scimUsers, sessions, users } from "../../db/schema.ts";
import { setSetting } from "../../services/settings.ts";
import type { Context } from "../../types.ts";
import { getUnlockPolicy } from "./unlockPolicy.ts";

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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-unlock-policy-test-"));
  const { db, close } = await createPglite(directory);
  const context = { db, logger: createLogger(), services: {} } as Context;
  const cleanup = async () => {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  };
  return { context, cleanup };
}

async function createUserSession(context: Context) {
  await context.db.insert(users).values({
    sub: "user-sub",
    email: "user@example.com",
    name: "User",
  });
  await context.db.insert(sessions).values({
    id: "session-id",
    cohort: "user",
    userSub: "user-sub",
    expiresAt: new Date(Date.now() + 60_000),
    data: { sub: "user-sub", email: "user@example.com", otpVerified: true },
  });
}

function createRequest(): IncomingMessage {
  const request = Readable.from([]) as IncomingMessage;
  request.method = "GET";
  request.url = "/crypto/unlock-policy";
  request.headers = {
    host: "auth.example.com",
    cookie: "__Host-DarkAuth-User=session-id",
  };
  request.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return request;
}

function createResponse(): ServerResponse & { body: string; json: unknown } {
  let body = "";
  return {
    statusCode: 0,
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) body += String(chunk);
      return this;
    },
    get body() {
      return body;
    },
    get json() {
      return body ? JSON.parse(body) : undefined;
    },
  } as ServerResponse & { body: string; json: unknown };
}

test("unlock policy exposes SCIM managed method restrictions", async () => {
  const { context, cleanup } = await createContext();
  try {
    await createUserSession(context);
    await context.db.insert(scimUsers).values({
      userSub: "user-sub",
      userName: "user@example.com",
      active: true,
    });
    await setSetting(context, "users.scim.allow_password_envelopes", false);
    await setSetting(context, "users.scim.allow_passkey_prf_envelopes", false);
    await setSetting(context, "users.scim.allow_trusted_device_approval", false);
    const response = createResponse();

    await getUnlockPolicy(context, createRequest(), response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {
      policy: {
        managed: true,
        allow_password_envelopes: false,
        allow_passkey_prf_envelopes: false,
        allow_trusted_device_approval: false,
        allow_recovery_key: true,
        allow_new_key_setup: false,
        require_key_unlock_for_zk: true,
        reason: "scim",
      },
    });
  } finally {
    await cleanup();
  }
});
