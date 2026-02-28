import type { IncomingMessage, ServerResponse } from "node:http";
import { TooManyRequestsError } from "../errors.ts";
import type { Context } from "../types.ts";
import { sendError } from "../utils/http.ts";
import { checkRateLimit, type RateLimitType, setRateLimitHeaders } from "../utils/security.ts";

/**
 * Rate limiting middleware
 * Applies rate limits based on endpoint type and optionally by identifier (e.g., email)
 */
export function withRateLimit(
  limitType: RateLimitType,
  extractIdentifier?: (body: unknown) => string | undefined
) {
  return <
    T extends (
      context: Context,
      request: IncomingMessage,
      response: ServerResponse,
      ...args: string[]
    ) => Promise<void>,
  >(
    handler: T
  ): T =>
    (async (
      context: Context,
      request: IncomingMessage,
      response: ServerResponse,
      ...params: string[]
    ) => {
      let identifier: string | undefined;

      // For POST requests with email-based rate limiting, extract the identifier
      if (extractIdentifier && request.method === "POST") {
        try {
          // Read body for identifier extraction (if needed)
          const { readBody, parseJsonSafely } = await import("../utils/http.ts");
          const bodyStr = await readBody(request);
          const body = parseJsonSafely(bodyStr);
          identifier = extractIdentifier(body);

          // Restore body for the handler
          (request as BodyCachedRequest).body = bodyStr;
        } catch {
          // If we can't parse the body, proceed without identifier
        }
      }

      // Check rate limit
      const rateLimitResult = await checkRateLimit(context, request, limitType, identifier);

      // Always set rate limit headers
      const config = await import("../utils/security.ts").then((m) =>
        m.getRateLimitConfig(context, limitType)
      );
      setRateLimitHeaders(
        response,
        config.maxRequests,
        rateLimitResult.remaining,
        rateLimitResult.resetTime
      );

      // If rate limit exceeded, return error
      if (!rateLimitResult.allowed) {
        const error = new TooManyRequestsError(
          rateLimitResult.blocked
            ? "Too many failed attempts. Please try again later."
            : "Rate limit exceeded. Please slow down."
        );
        sendError(response, error);
        return;
      }

      // Call the original handler
      return handler(context, request, response, ...params);
    }) as T;
}

/**
 * Helper to read cached body from request
 */
export async function getCachedBody(request: IncomingMessage): Promise<string> {
  if ((request as BodyCachedRequest).body !== undefined) {
    return (request as BodyCachedRequest).body as string;
  }

  const { readBody } = await import("../utils/http.ts");
  const body = await readBody(request);
  (request as BodyCachedRequest).body = body;
  return body;
}

interface BodyCachedRequest extends IncomingMessage {
  body?: string;
}
