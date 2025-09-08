import type { IncomingMessage, ServerResponse } from "node:http";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../errors.js";
import { getAdminById } from "../../models/adminUsers.js";
import { createSession } from "../../services/sessions.js";
import type { Context, OpaqueLoginResult } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

interface OpaqueLoginFinishRequest {
  finish: string;
  adminId: string;
  sessionId: string;
}

function isOpaqueLoginFinishRequest(data: unknown): data is OpaqueLoginFinishRequest {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.finish === "string" &&
    typeof obj.adminId === "string" &&
    typeof obj.sessionId === "string"
  );
}

async function postAdminOpaqueLoginFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  try {
    context.logger.debug({ path: "/admin/opaque/login/finish" }, "admin opaque login finish");
    if (!context.services.opaque) {
      throw new ValidationError("OPAQUE service not available");
    }

    // Read and parse request body
    const body = await readBody(request);
    const data = parseJsonSafely(body);
    context.logger.debug({ bodyLen: body?.length || 0 }, "parsed body");

    // Validate request format
    if (!isOpaqueLoginFinishRequest(data)) {
      throw new ValidationError(
        "Invalid request format. Expected finish, adminId, and sessionId fields."
      );
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

    const adminUser = await getAdminById(context, data.adminId);
    context.logger.info({ adminId: data.adminId, found: !!adminUser }, "admin lookup on finish");
    if (!adminUser) {
      throw new NotFoundError("Admin user not found");
    }

    // Call OPAQUE service to finish login
    let loginResult: OpaqueLoginResult;
    try {
      context.logger.info(
        { sessionId: data.sessionId },
        "[admin:login:finish] Calling OPAQUE finishLogin"
      );
      loginResult = await context.services.opaque.finishLogin(finishBuffer, data.sessionId);
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

    // Create admin session
    const { sessionId, refreshToken } = await createSession(context, "admin", {
      adminId: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      adminRole: adminUser.role,
    });

    // Return session token as Bearer token
    const responseData = {
      success: true,
      sessionKey: toBase64Url(Buffer.from(loginResult.sessionKey)),
      accessToken: sessionId, // Use sessionId as bearer token
      refreshToken,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      },
    };

    sendJson(response, 200, responseData);
  } catch (error) {
    context.logger.error({ err: error }, "admin opaque login finish failed");
    sendError(response, error as Error);
  }
}

export const postAdminOpaqueLoginFinish = withAudit({
  eventType: "ADMIN_LOGIN",
  resourceType: "admin",
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const b = body as { adminId?: string };
      return b.adminId;
    }
    return undefined;
  },
})(postAdminOpaqueLoginFinishHandler);
