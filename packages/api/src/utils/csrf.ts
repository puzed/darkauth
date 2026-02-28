import type { IncomingMessage } from "node:http";
import { ForbiddenError } from "../errors.ts";
import { getCsrfCookieToken, getSessionIdFromCookie } from "../services/sessions.ts";

export function isSameOrigin(request: IncomingMessage): boolean {
  const method = request.method || "GET";
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const host = typeof request.headers.host === "string" ? request.headers.host : "";
  const sfs =
    typeof request.headers["sec-fetch-site"] === "string"
      ? request.headers["sec-fetch-site"]
      : undefined;
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
  const referer = typeof request.headers.referer === "string" ? request.headers.referer : undefined;

  if (sfs === "same-origin") return true;

  if (origin) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {}
  }

  if (referer) {
    try {
      if (new URL(referer).host === host) return true;
    } catch {}
  }

  return false;
}

export function assertSameOrigin(request: IncomingMessage): void {
  if (!isSameOrigin(request)) throw new ForbiddenError("Cross-site request blocked");
}

export function assertCsrf(request: IncomingMessage): void {
  const method = request.method || "GET";
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;
  assertSameOrigin(request);

  const hasSession = !!getSessionIdFromCookie(request);
  if (!hasSession) return;

  const cookieToken = getCsrfCookieToken(request);
  const headerValue = request.headers["x-csrf-token"];
  const headerToken =
    typeof headerValue === "string"
      ? headerValue
      : Array.isArray(headerValue)
        ? headerValue[0]
        : undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ForbiddenError("Missing or invalid CSRF token");
  }
}
