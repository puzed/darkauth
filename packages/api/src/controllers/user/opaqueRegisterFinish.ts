import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { opaqueRecords, users } from "../../db/schema.js";
import { ConflictError, ValidationError } from "../../errors.js";
import { createSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url, generateRandomString } from "../../utils/crypto.js";
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

      // Call OPAQUE service to process registration
      const opaqueRecord = await context.services.opaque.finishRegistration(recordBuffer, email);

      // Generate unique subject identifier for the user
      const sub = generateRandomString(16);

      try {
        // Begin transaction
        await context.db.transaction(async (tx) => {
          // Check if email already exists
          const existingUser = await tx.query.users.findFirst({
            where: eq(users.email, email as string),
          });

          if (existingUser) {
            throw new ConflictError("User with this email already exists");
          }

          // Create user record
          await tx.insert(users).values({
            sub,
            email: email as string,
            name: name,
            createdAt: new Date(),
          });

          // Store OPAQUE record
          await tx.insert(opaqueRecords).values({
            sub,
            envelope: Buffer.from(opaqueRecord.envelope),
            serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
            updatedAt: new Date(),
          });
        });

        // Create session for the new user
        const sessionInfo = await createSession(context, "user", {
          sub,
          email: email as string,
          name: name,
        });

        // Return success response with tokens
        sendJson(response, 201, {
          sub,
          accessToken: sessionInfo.sessionId, // Use sessionId as bearer token
          refreshToken: sessionInfo.refreshToken,
          message: "User registered successfully",
        });
      } catch (dbError) {
        // Handle database constraint errors
        if (dbError instanceof ConflictError) {
          throw dbError;
        }
        console.error("Database error during user registration:", dbError);
        throw new ValidationError("Failed to create user account");
      }
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
