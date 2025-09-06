import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { AppError, OAuthError, ValidationError } from "../errors.js";

export function readBody(request: IncomingMessage): Promise<string> {
  const reqWithRaw = request as IncomingMessage & { rawBody?: unknown };
  if (typeof reqWithRaw.rawBody === "string") {
    return Promise.resolve(reqWithRaw.rawBody);
  }
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      reqWithRaw.rawBody = body;
      resolve(body);
    });
    request.on("error", reject);
  });
}

export function parseJsonSafely(jsonString: string): unknown {
  try {
    return JSON.parse(jsonString);
  } catch {
    throw new ValidationError("Invalid JSON");
  }
}

export function parseJsonAs<T>(jsonString: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    throw new ValidationError("Invalid JSON");
  }
}

export function sendJson(response: ServerResponse, statusCode: number, data: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(data));
}

export function sendJsonValidated<T>(
  response: ServerResponse,
  statusCode: number,
  data: unknown,
  schema: { parse: (data: unknown) => T }
): void {
  try {
    const validatedData = schema.parse(data);
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(validatedData));
  } catch (error) {
    console.error("Response validation failed:", error);
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Internal server error" }));
  }
}

export function sendError(response: ServerResponse, error: Error): void {
  if (error instanceof AppError) {
    response.statusCode = error.statusCode;
    response.setHeader("Content-Type", "application/json");

    if (error instanceof OAuthError) {
      const errorResponse: Record<string, string> = { error: error.error };
      if (error.error_description) {
        errorResponse.error_description = error.error_description as string;
      }
      response.end(JSON.stringify(errorResponse));
    } else {
      response.end(
        JSON.stringify({
          error: error.message,
          code: error.code,
          ...(error instanceof ValidationError && error.details ? { details: error.details } : {}),
        })
      );
    }
    return;
  }

  console.error("Unexpected error:", error);
  response.statusCode = 500;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ error: "Internal server error" }));
}

export function parseQueryParams(url: string): URLSearchParams {
  try {
    const u = new URL(url, "http://localhost");
    return u.searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export function parseFormBody(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function redirect(response: ServerResponse, location: string, statusCode = 302): void {
  response.statusCode = statusCode;
  response.setHeader("Location", location);
  response.end();
}

export function serveStaticFile(
  response: ServerResponse,
  content: string,
  contentType: string
): void {
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "public, max-age=3600");
  response.end(content);
}

export function getClientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.socket.remoteAddress || "unknown";
}

export function parseAuthorizationHeader(
  request: IncomingMessage
): { type: string; credentials: string } | null {
  const authHeader = request.headers.authorization;
  if (!authHeader) return null;

  const [type, ...credentialsParts] = authHeader.split(" ");
  const credentials = credentialsParts.join(" ");

  if (!type || !credentials) return null;

  return { type, credentials };
}

export function decodeBasicAuth(
  credentials: string
): { username: string; password: string } | null {
  try {
    const decoded = Buffer.from(credentials, "base64").toString("utf-8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;

    return {
      username: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    };
  } catch {
    return null;
  }
}
