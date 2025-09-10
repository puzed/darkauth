import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { createPglite } from "../../db/pglite.js";
import {
  AlreadyInitializedError,
  ExpiredInstallTokenError,
  ValidationError,
} from "../../errors.js";
import { createOpaqueService } from "../../services/opaque.js";
import { isSystemInitialized } from "../../services/settings.js";
import type { Context } from "../../types.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

const Req = z.object({
  token: z.string().optional(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["read", "write"]).optional(),
  request: z.string(),
  dbMode: z.enum(["remote", "pglite"]).optional(),
  postgresUri: z.string().optional(),
  pgliteDir: z.string().optional(),
});

export async function postInstallOpaqueRegisterStart(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  try {
    context.logger.info("[install:opaque:start] Beginning OPAQUE registration start");
    const initialized = await isSystemInitialized(context);
    if (initialized) {
      throw new AlreadyInitializedError();
    }
    const body = await readBody(request);
    context.logger.debug({ bodyLen: body.length }, "[install:opaque:start] Read request body");
    const data = Req.parse(parseJsonSafely(body));
    context.logger.info(
      { email: data.email, name: data.name },
      "[install:opaque:start] Parsed request"
    );
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const providedToken =
      data.token || url.searchParams.get("token") || context.config.installToken || "";
    if (!context.services.install?.token || providedToken !== context.services.install.token) {
      context.logger.error("[install:opaque:start] Invalid install token");
      throw new ValidationError("Invalid install token");
    }
    if (context.services.install?.createdAt) {
      const tokenAge = Date.now() - (context.services.install.createdAt || 0);
      if (tokenAge > 10 * 60 * 1000) {
        throw new ExpiredInstallTokenError();
      }
    }
    if (context.services.install?.adminCreated) {
      throw new ValidationError("Bootstrap admin already created");
    }

    if (
      context.services.install?.adminEmail &&
      context.services.install.adminEmail !== data.email
    ) {
      throw new ValidationError("Admin email does not match installation");
    }

    if (!context.services.install?.tempDb) {
      try {
        if (data.dbMode === "pglite" && data.pgliteDir) {
          context.logger.info("[install:opaque:start] Starting PGLite");
          const { db, close } = await createPglite(data.pgliteDir);
          context.services.install = {
            ...(context.services.install || {}),
            tempDb: db,
            tempDbClose: close,
            chosenDbMode: "pglite",
            chosenPgliteDir: data.pgliteDir,
          };
          context.logger.info("[install:opaque:start] PGLite setup complete");
        } else if (data.dbMode === "remote" && data.postgresUri) {
          context.logger.info(
            { uri: data.postgresUri },
            "[install:opaque:start] Using existing Postgres"
          );
          const { Pool } = await import("pg");
          const { drizzle } = await import("drizzle-orm/node-postgres");
          const { migrate } = await import("drizzle-orm/node-postgres/migrator");
          context.logger.info("[install:opaque:start] Creating database pool");
          const pool = new Pool({ connectionString: data.postgresUri });
          try {
            const client = await pool.connect();
            context.logger.info("[install:opaque:start] Database connection successful");
            client.release();
          } catch (connErr) {
            context.logger.error(
              { err: connErr },
              "[install:opaque:start] Database connection failed"
            );
            throw connErr;
          }
          context.logger.info("[install:opaque:start] Importing schema");
          const schema = await import("../../db/schema.js");
          context.logger.info(
            { schemaKeys: Object.keys(schema) },
            "[install:opaque:start] Schema imported"
          );
          context.logger.info("[install:opaque:start] Creating drizzle instance");
          const db = drizzle(pool, { schema });
          const migrationsPath = new URL("../../../drizzle", import.meta.url).pathname;
          context.logger.info({ migrationsPath }, "[install:opaque:start] Running migrations");
          try {
            await migrate(db as import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema>, {
              migrationsFolder: migrationsPath,
            });
            context.logger.info("[install:opaque:start] Migrations completed successfully");
            const testQuery = await pool.query(
              "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
            );
            context.logger.info(
              { tables: testQuery.rows.map((r) => r.table_name) },
              "[install:opaque:start] Database tables after migration"
            );
          } catch (migrationError) {
            context.logger.error(
              { err: migrationError, migrationsPath },
              "[install:opaque:start] Migration failed"
            );
            throw migrationError;
          }
          context.logger.info("[install:opaque:start] Storing database in context");
          context.services.install = {
            ...(context.services.install || {}),
            tempDb: db,
            tempPool: pool,
            chosenPostgresUri: data.postgresUri,
            chosenDbMode: "remote",
          };
          context.logger.info("[install:opaque:start] Database setup complete");
        }
      } catch (err) {
        context.logger.error({ err }, "[install:opaque:start] Failed to prepare database");
        throw new ValidationError("Failed to prepare database");
      }
    }

    let install = context.services.install;
    if (!install) {
      install = { adminEmail: data.email };
      context.services.install = install;
    } else if (!install.adminEmail) {
      install.adminEmail = data.email;
    }
    let svc = context.services.opaque;
    context.logger.info(
      { hasTempDb: !!context.services.install?.tempDb, hasOpaque: !!svc },
      "[install:opaque:start] Checking OPAQUE service"
    );
    if (context.services.install?.tempDb) {
      context.logger.info("[install:opaque:start] Creating OPAQUE service with temporary database");
      const tempContext = { ...context, db: context.services.install.tempDb } as Context;
      try {
        svc = await createOpaqueService(tempContext);
        context.logger.info("[install:opaque:start] OPAQUE service created successfully");
      } catch (err) {
        context.logger.error({ err }, "[install:opaque:start] Failed to create OPAQUE service");
        svc = undefined;
      }
    }
    if (!svc) {
      context.logger.error("[install:opaque:start] No OPAQUE service available");
      throw new ValidationError("Database not prepared");
    }
    const reqBuf = fromBase64Url(data.request);
    context.logger.debug(
      { reqLen: reqBuf.length },
      "[install:opaque:start] Decoded OPAQUE request"
    );
    const reg = await svc.startRegistration(reqBuf, data.email);
    context.logger.info(
      { msgLen: reg.message.length, pubKeyLen: reg.serverPublicKey.length },
      "[install:opaque:start] OPAQUE registration started"
    );
    const responseData = {
      message: toBase64Url(Buffer.from(reg.message)),
      serverPublicKey: toBase64Url(Buffer.from(reg.serverPublicKey)),
    };
    context.logger.debug(
      { msgB64Len: responseData.message.length, pubKeyB64Len: responseData.serverPublicKey.length },
      "[install:opaque:start] Sending response"
    );
    sendJson(response, 200, responseData);
  } catch (err) {
    context.logger.error({ err }, "[install:opaque:start] Failed");
    sendError(response, err as Error);
  }
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/install/opaque/start",
    tags: ["Installation"],
    summary: "Start OPAQUE registration for bootstrap admin",
    responses: { 200: { description: "OK" } },
  });
}
