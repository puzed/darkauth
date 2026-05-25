import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOpaqueClientService, createOpaqueServerService } from "./opaque-ts-wrapper.ts";

describe("opaque-ts wrapper", () => {
  it("finishes login on a different server instance using persisted state", async () => {
    const identityU = "user@example.com";
    const identityS = "DarkAuth";
    const password = "correct horse battery staple";
    const serverA = await createOpaqueServerService();
    const serverB = await createOpaqueServerService(serverA.getState());
    const registerClient = await createOpaqueClientService();
    const registrationStart = await registerClient.startRegistration(password, identityU);
    const registrationResponse = await serverA.startRegistration(
      registrationStart.request,
      identityU,
      identityS
    );
    const registrationFinish = await registerClient.finishRegistration(
      registrationResponse.response,
      registrationStart.state,
      serverA.getSetup().serverPublicKey,
      identityS,
      identityU
    );
    const record = await serverA.finishRegistration(
      registrationFinish.upload,
      identityU,
      identityS
    );
    const loginClient = await createOpaqueClientService();
    const loginStart = await loginClient.startLogin(password, identityU);
    const loginResponse = await serverA.startLogin(
      loginStart.request,
      record.envelope,
      record.serverPublicKey,
      identityU,
      identityS
    );
    const loginFinish = await loginClient.finishLogin(
      loginResponse.response,
      loginStart.state,
      serverA.getSetup().serverPublicKey,
      identityS,
      identityU
    );
    const result = await serverB.finishLogin(
      loginFinish.finish,
      loginResponse.state,
      identityU,
      identityS
    );

    assert.equal(result.sessionKey.length, loginFinish.session_key.length);
    assert.deepEqual(Array.from(result.sessionKey), Array.from(loginFinish.session_key));
  });
});
