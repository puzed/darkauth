import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createPglite } from "../db/pglite.ts";
import { opaqueLoginSessions } from "../db/schema.ts";
import { createOpaqueClientService } from "../lib/opaque/opaque-ts-wrapper.ts";
import type { Context } from "../types.ts";
import { createOpaqueService } from "./opaque.ts";

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

function createContext(db: Context["db"]): Context {
  return {
    db,
    config: {
      publicOrigin: "http://localhost:9080",
      issuer: "http://localhost:9080",
      kekPassphrase: "",
      inInstallMode: false,
    },
    logger: createLogger(),
    services: {},
    cleanupFunctions: [],
    destroy: async () => {},
  } as Context;
}

test("OPAQUE login finish works on a different service instance using database state", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "darkauth-opaque-service-test-"));
  const { db, close } = await createPglite(directory);
  const contextA = createContext(db);
  const contextB = createContext(db);

  try {
    const identityU = "user@example.com";
    const identityS = "DarkAuth";
    const password = "correct horse battery staple";
    const opaqueA = await createOpaqueService(contextA);
    const opaqueB = await createOpaqueService(contextB);
    const registerClient = await createOpaqueClientService();
    const registrationStart = await registerClient.startRegistration(password, identityU);
    const registrationResponse = await opaqueA.startRegistration(
      registrationStart.request,
      identityU,
      identityS
    );
    const registrationFinish = await registerClient.finishRegistration(
      registrationResponse.message,
      registrationStart.state,
      registrationResponse.serverPublicKey,
      identityS,
      identityU
    );
    const record = await opaqueA.finishRegistration(
      registrationFinish.upload,
      identityU,
      identityS
    );
    const loginClient = await createOpaqueClientService();
    const loginStart = await loginClient.startLogin(password, identityU);
    const loginResponse = await opaqueA.startLogin(
      loginStart.request,
      record,
      identityU,
      identityS
    );
    const loginFinish = await loginClient.finishLogin(
      loginResponse.message,
      loginStart.state,
      registrationResponse.serverPublicKey,
      identityS,
      identityU
    );
    const result = await opaqueB.finishLogin(loginFinish.finish, loginResponse.sessionId);
    const remaining = await db.query.opaqueLoginSessions.findFirst({
      where: eq(opaqueLoginSessions.id, loginResponse.sessionId),
    });

    assert.deepEqual(Array.from(result.sessionKey), Array.from(loginFinish.session_key));
    assert.equal(remaining, undefined);
  } finally {
    await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
