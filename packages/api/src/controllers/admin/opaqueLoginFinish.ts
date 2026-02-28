import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { opaqueLoginSessions } from "../../db/schema.ts";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { getAdminByEmail } from "../../models/adminUsers.ts";
import { getOtpStatusModel } from "../../models/otp.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import {
  createSession,
  getSessionTtlSeconds,
  issueSessionCookies,
} from "../../services/sessions.ts";
import type { Context, ControllerSchema, OpaqueLoginResult } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

interface OpaqueLoginFinishRequest {
  finish: string;
  sessionId: string;
  // Note: adminId field is ignored for security - identity comes from server session
}

const AdminOpaqueLoginFinishRequestSchema = z.object({
  finish: z.string(),
  sessionId: z.string(),
});

const AdminOpaqueLoginFinishResponseSchema = z.object({
  success: z.literal(true),
  sessionKey: z.string(),
  admin: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable().optional(),
    role: z.string(),
  }),
  otpRequired: z.boolean(),
});

function isOpaqueLoginFinishRequest(data: unknown): data is OpaqueLoginFinishRequest {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.finish === "string" && typeof obj.sessionId === "string";
}

async function postAdminOpaqueLoginFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  context.logger.debug({ path: "/admin/opaque/login/finish" }, "admin opaque login finish");
  const opaque = await requireOpaqueService(context);

  // Read and parse request body
  const body = await getCachedBody(request);
  const data = parseJsonSafely(body);
  context.logger.debug({ bodyLen: body?.length || 0 }, "parsed body");

  // Validate request format
  if (!isOpaqueLoginFinishRequest(data)) {
    throw new ValidationError("Invalid request format. Expected finish and sessionId fields.");
  }

  if (!context.db) {
    throw new ValidationError("Database context not available");
  }

  let finishBuffer: Uint8Array;
  try {
    finishBuffer = fromBase64Url(data.finish);
  } catch {
    throw new ValidationError("Invalid base64url encoding in finish");
  }
  context.logger.debug(
    { finishLen: finishBuffer.length, sessionId: data.sessionId },
    "decoded finish"
  );

  // CRITICAL SECURITY FIX: Retrieve identity from server-side OPAQUE session
  // This prevents account takeover by ensuring the authenticated identity
  // comes from the server's session store, not client input
  const sessionRow = await context.db.query.opaqueLoginSessions.findFirst({
    where: eq(opaqueLoginSessions.id, data.sessionId),
  });

  if (!sessionRow) {
    throw new UnauthorizedError("Invalid or expired login session");
  }

  // Decrypt identityU from the session to get the admin's email
  let adminEmail: string;
  if (context.services?.kek) {
    try {
      const kekSvc = context.services.kek;
      const decU = await kekSvc.decrypt(Buffer.from(sessionRow.identityU, "base64"));
      adminEmail = decU.toString("utf-8");
    } catch {
      adminEmail = Buffer.from(sessionRow.identityU, "base64").toString("utf-8");
    }
  } else {
    adminEmail = Buffer.from(sessionRow.identityU, "base64").toString("utf-8");
  }

  // Call OPAQUE service to finish login first to normalize timing
  let loginResult: OpaqueLoginResult;
  try {
    context.logger.info(
      { sessionId: data.sessionId },
      "[admin:login:finish] Calling OPAQUE finishLogin"
    );
    loginResult = await opaque.finishLogin(finishBuffer, data.sessionId);
    context.logger.info(
      {
        sessionId: data.sessionId,
        sessionKeyLen: loginResult.sessionKey.length,
      },
      "[admin:login:finish] OPAQUE login successful"
    );
  } catch (error) {
    context.logger.error(
      {
        err: error,
        sessionId: data.sessionId,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
      },
      "[admin:login:finish] OPAQUE finishLogin failed"
    );
    throw new UnauthorizedError("Authentication failed");
  }
  context.logger.debug({ sessionKeyLen: loginResult.sessionKey.length }, "opaque finish ok");

  // Look up admin by the email from the server session only
  const adminUser = await getAdminByEmail(context, adminEmail);
  context.logger.info({ email: adminEmail, found: !!adminUser }, "admin lookup on finish");
  if (!adminUser) {
    throw new UnauthorizedError("Authentication failed");
  }

  // Create admin session
  let otpRequired = false;
  const otpInventory = await getOtpStatusModel(context, "admin", adminUser.id);
  const s = await (await import("../../services/settings.ts")).getSetting(context, "otp");
  const forced = !!(
    s &&
    typeof s === "object" &&
    (s as { require_for_admin?: unknown }).require_for_admin
  );
  const configured = otpInventory.enabled || otpInventory.pending;
  otpRequired = forced || configured;

  const { sessionId } = await createSession(context, "admin", {
    adminId: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    adminRole: adminUser.role,
    otpRequired,
    otpVerified: false,
  });
  const ttlSeconds = await getSessionTtlSeconds(context, "admin");
  issueSessionCookies(response, sessionId, ttlSeconds, true);

  const responseData = {
    success: true,
    sessionKey: toBase64Url(Buffer.from(loginResult.sessionKey)),
    admin: {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
    },
    otpRequired,
  };

  sendJson(response, 200, responseData);
}

export const postAdminOpaqueLoginFinish = withRateLimit("opaque", (body) => {
  const data = body as { sessionId?: string };
  return data?.sessionId;
})(
  withAudit({
    eventType: "ADMIN_LOGIN",
    resourceType: "admin",
    extractResourceId: (body) => {
      // Use sessionId for audit correlation
      const data = body as { sessionId?: string };
      return data?.sessionId;
    },
  })(postAdminOpaqueLoginFinishHandler)
);

export const schema = {
  method: "POST",
  path: "/admin/opaque/login/finish",
  tags: ["Auth"],
  summary: "Complete admin OPAQUE login",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: AdminOpaqueLoginFinishRequestSchema,
  },
  responses: {
    200: {
      description: "Authentication successful",
      content: {
        "application/json": {
          schema: AdminOpaqueLoginFinishResponseSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
