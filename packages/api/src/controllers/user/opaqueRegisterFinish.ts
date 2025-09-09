import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { userOpaqueRegisterFinish } from "../../models/registration.js";
import { getSetting } from "../../services/settings.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendError, sendJson } from "../../utils/http.js";

export const postOpaqueRegisterFinish = withAudit({
  eventType: "USER_REGISTER",
  resourceType: "user",
  extractResourceId: (body) =>
    body && typeof body === "object" && "email" in body
      ? (body as { email?: string }).email
      : undefined,
})(
  async (
    context: Context,
    request: IncomingMessage,
    response: ServerResponse,
    ..._params: unknown[]
  ): Promise<void> => {
    try {
      if (!context.services.opaque) {
        throw new ValidationError("OPAQUE service not available");
      }

      const enabled = (await getSetting(context, "users.self_registration_enabled")) as
        | boolean
        | undefined
        | null;
      if (!enabled) {
        throw new ForbiddenError("Self-registration disabled");
      }

      // Read and parse request body
      const body = await readBody(request);
      const data = parseJsonSafely(body) as {
        record?: unknown;
        message?: unknown;
        name?: unknown;
        email?: unknown;
        __debug?: unknown;
      };

      // Validate request format (accept both `record` and `message` for compatibility)
      const recordBase64: string | undefined =
        typeof data.record === "string"
          ? data.record
          : typeof data.message === "string"
            ? data.message
            : undefined;
      if (!recordBase64) {
        throw new ValidationError("Missing or invalid record/message field");
      }

      if (!data.email || typeof data.email !== "string") {
        throw new ValidationError("Missing or invalid email field");
      }

      if (!data.name || typeof data.name !== "string") {
        throw new ValidationError("Missing or invalid name field");
      }

      // At this point, we know email and name are strings
      const email = data.email as string;
      const name = data.name as string;

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationError("Invalid email format");
      }

      let recordBuffer: Uint8Array;
      try {
        recordBuffer = fromBase64Url(recordBase64);
      } catch {
        throw new ValidationError("Invalid base64url encoding in record");
      }

      const result = await userOpaqueRegisterFinish(context, { record: recordBuffer, email, name });
      sendJson(response, 201, { ...result, message: "User registered successfully" });
    } catch (error) {
      sendError(response, error as Error);
    }
  }
);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/opaque/register/finish",
    tags: ["OPAQUE"],
    summary: "opaqueRegisterFinish",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
