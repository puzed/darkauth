import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { opaqueLoginSessions } from "../db/schema.js";
import { ValidationError } from "../errors.js";
import {
  createOpaqueClientService,
  createOpaqueServerService,
  type OpaqueServerService,
  toBase64Url,
} from "../lib/opaque/opaque-ts-wrapper.js";
import type {
  Context,
  OpaqueLoginResponse,
  OpaqueLoginResult,
  OpaqueRecord,
  OpaqueRegistrationResponse,
  OpaqueServerSetup,
} from "../types.js";
import { ensureKekService } from "./kek.js";
import { loadOpaqueServerState, saveOpaqueServerState } from "./opaqueState.js";

export async function createOpaqueService(context?: Context) {
  try {
    context?.logger?.debug("[opaque] server.init: loading persisted state");
  } catch {}
  const persistedState = context ? await loadOpaqueServerState(context) : undefined;
  const serverState = persistedState
    ? {
        oprfSeed: persistedState.oprfSeed,
        serverKeypair: persistedState.serverKeypair,
        serverIdentity: persistedState.serverIdentity || "DarkAuth",
      }
    : undefined;

  const server: OpaqueServerService = await createOpaqueServerService(serverState, context?.logger);

  if (context) {
    const state = server.getState();
    try {
      context.logger.debug(
        {
          oprfSeedLen: state.oprfSeed?.length || 0,
          pubLen: state.serverKeypair?.public_key?.length || 0,
        },
        "[opaque] server.state"
      );
    } catch {}
    const stateToSave = {
      oprfSeed: state.oprfSeed,
      serverKeypair: state.serverKeypair,
      serverIdentity: state.serverIdentity || "DarkAuth",
    };
    await saveOpaqueServerState(context, stateToSave);
  }

  let dummyRecord: { envelope: Uint8Array; serverPublicKey: Uint8Array } | null = null;

  async function ensureDummyRecord() {
    if (dummyRecord) return dummyRecord;
    const client = await createOpaqueClientService();
    const identityU = "dummy@example.invalid";
    const password = Buffer.from(randomBytes(32)).toString("base64");
    const regStart = await client.startRegistration(password, identityU);
    const srvResp = await server.startRegistration(regStart.request, identityU, "DarkAuth");
    const clientFinish = await client.finishRegistration(
      srvResp.response,
      regStart.state,
      server.getSetup().serverPublicKey,
      "DarkAuth",
      identityU
    );
    const rec = await server.finishRegistration(clientFinish.upload, identityU, "DarkAuth");
    dummyRecord = { envelope: rec.envelope, serverPublicKey: rec.serverPublicKey };
    return dummyRecord;
  }

  const service = {
    async serverSetup(): Promise<OpaqueServerSetup> {
      const setup = server.getSetup();
      try {
        context?.logger?.debug({ event: "opaque.serverSetup" });
      } catch {}
      return {
        serverPublicKey: toBase64Url(setup.serverPublicKey),
      };
    },

    async startRegistration(
      request: Uint8Array,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueRegistrationResponse> {
      const result = await server.startRegistration(request, identityU, identityS);
      try {
        context?.logger?.debug({
          event: "opaque.startRegistration",
          identityU,
          respLen: result.response.length,
        });
      } catch {}

      return {
        message: result.response,
        serverPublicKey: server.getSetup().serverPublicKey,
      };
    },

    async finishRegistration(
      upload: Uint8Array,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueRecord> {
      const result = await server.finishRegistration(upload, identityU, identityS);
      try {
        context?.logger?.debug({
          event: "opaque.finishRegistration",
          envLen: result.envelope.length,
        });
      } catch {}

      return {
        envelope: result.envelope,
        serverPublicKey: result.serverPublicKey,
      };
    },

    async startLogin(
      request: Uint8Array,
      record: OpaqueRecord,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueLoginResponse> {
      const result = await server.startLogin(
        request,
        record.envelope,
        record.serverPublicKey,
        identityU,
        identityS
      );
      try {
        context?.logger?.debug({ event: "opaque.startLogin", respLen: result.response.length });
      } catch {}

      const sessionId = Buffer.from(result.state).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      if (!context) {
        throw new Error("Database context is required for OPAQUE login sessions");
      }

      let identitySToStore: string;
      let identityUToStore: string;

      if (context.services?.kek) {
        const kekSvc = context.services.kek;
        const encryptedIdentityS = await kekSvc.encrypt(Buffer.from(identityS, "utf-8"));
        const encryptedIdentityU = await kekSvc.encrypt(Buffer.from(identityU, "utf-8"));
        identitySToStore = encryptedIdentityS.toString("base64");
        identityUToStore = encryptedIdentityU.toString("base64");
      } else {
        identitySToStore = Buffer.from(identityS, "utf-8").toString("base64");
        identityUToStore = Buffer.from(identityU, "utf-8").toString("base64");
      }

      await context.db
        .insert(opaqueLoginSessions)
        .values({
          id: sessionId,
          serverState: Buffer.from(result.state),
          identityS: identitySToStore,
          identityU: identityUToStore,
          expiresAt,
        })
        .onConflictDoNothing();
      try {
        context?.logger?.info({ event: "opaque.session.persist", sessionId });
      } catch {}
      await context.db
        .delete(opaqueLoginSessions)
        .where(lt(opaqueLoginSessions.expiresAt, new Date()));

      return {
        message: result.response,
        sessionId,
      };
    },

    async startLoginWithDummy(
      request: Uint8Array,
      identityU: string,
      identityS = "DarkAuth"
    ): Promise<OpaqueLoginResponse> {
      const rec = await ensureDummyRecord();
      return service.startLogin(request, rec, identityU, identityS);
    },

    async finishLogin(finish: Uint8Array, sessionId: string): Promise<OpaqueLoginResult> {
      if (!context) {
        throw new Error("Database context is required for OPAQUE login sessions");
      }

      const row = await context.db.query.opaqueLoginSessions.findFirst({
        where: eq(opaqueLoginSessions.id, sessionId),
      });
      try {
        context?.logger?.info({ event: "opaque.finishLogin.lookup", sessionId, found: !!row });
      } catch {}
      if (!row) {
        throw new Error("Invalid or expired login session");
      }
      if (row.expiresAt && new Date() > row.expiresAt) {
        await context.db.delete(opaqueLoginSessions).where(eq(opaqueLoginSessions.id, sessionId));
        throw new Error("Invalid or expired login session");
      }

      let decryptedIdentityS: string;
      let decryptedIdentityU: string;

      if (context.services?.kek) {
        try {
          const kekSvc = context.services.kek;
          const decS = await kekSvc.decrypt(Buffer.from(row.identityS, "base64"));
          const decU = await kekSvc.decrypt(Buffer.from(row.identityU, "base64"));
          decryptedIdentityS = decS.toString("utf-8");
          decryptedIdentityU = decU.toString("utf-8");
        } catch {
          decryptedIdentityS = Buffer.from(row.identityS, "base64").toString("utf-8");
          decryptedIdentityU = Buffer.from(row.identityU, "base64").toString("utf-8");
        }
      } else {
        decryptedIdentityS = Buffer.from(row.identityS, "base64").toString("utf-8");
        decryptedIdentityU = Buffer.from(row.identityU, "base64").toString("utf-8");
      }

      try {
        context?.logger?.info({
          event: "opaque.finishLogin.calling",
          sessionId,
          finishLen: finish.length,
          serverStateLen: (row.serverState ?? []).length,
          identityU: decryptedIdentityU,
          identityS: decryptedIdentityS,
        });
      } catch {}

      let result: OpaqueLoginResult;
      try {
        result = await server.finishLogin(
          finish,
          new Uint8Array(row.serverState ?? []),
          decryptedIdentityU,
          decryptedIdentityS
        );
      } catch (error) {
        try {
          context?.logger?.error({
            event: "opaque.finishLogin.failed",
            sessionId,
            error: (error as Error).message,
            stack: (error as Error).stack,
            identityU: decryptedIdentityU,
            identityS: decryptedIdentityS,
          });
        } catch {}
        throw error;
      }

      await context.db.delete(opaqueLoginSessions).where(eq(opaqueLoginSessions.id, sessionId));
      try {
        context?.logger?.info({
          event: "opaque.finishLogin.success",
          sessionKeyLen: result.sessionKey.length,
        });
      } catch {}

      return {
        sessionKey: result.sessionKey,
      };
    },
  } satisfies Context["services"]["opaque"];

  return service;
}

export async function createOpaqueClient() {
  return createOpaqueClientService();
}

export async function ensureOpaqueService(
  context: Context
): Promise<NonNullable<Context["services"]["opaque"]>> {
  if (context.services.opaque) {
    return context.services.opaque;
  }

  if (!context.services.kek?.isAvailable() && context.config.kekPassphrase) {
    await ensureKekService(context);
  }

  const tempDb = context.services.install?.tempDb;
  const baseContext = tempDb ? { ...context, db: tempDb } : context;
  const service = await createOpaqueService(baseContext);
  context.services.opaque = service;
  return service;
}

export async function requireOpaqueService(
  context: Context
): Promise<NonNullable<Context["services"]["opaque"]>> {
  try {
    return await ensureOpaqueService(context);
  } catch (error) {
    throw new ValidationError("OPAQUE service not available", { cause: error });
  }
}
