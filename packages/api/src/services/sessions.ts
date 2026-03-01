import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { sessions } from "../db/schema.ts";
import { UnauthorizedError } from "../errors.ts";
import type { Context, SessionData } from "../types.ts";
import { generateRandomString, sha256Base64Url } from "../utils/crypto.ts";
import { getSetting } from "./settings.ts";

export const USER_AUTH_COOKIE_NAME = "__Host-DarkAuth-User";
export const ADMIN_AUTH_COOKIE_NAME = "__Host-DarkAuth-Admin";
export const USER_CSRF_COOKIE_NAME = "__Host-DarkAuth-User-Csrf";
export const ADMIN_CSRF_COOKIE_NAME = "__Host-DarkAuth-Admin-Csrf";
export const USER_REFRESH_COOKIE_NAME = "__Host-DarkAuth-User-Refresh";
export const ADMIN_REFRESH_COOKIE_NAME = "__Host-DarkAuth-Admin-Refresh";

function getAuthCookieName(isAdmin: boolean): string {
  return isAdmin ? ADMIN_AUTH_COOKIE_NAME : USER_AUTH_COOKIE_NAME;
}

function getCsrfCookieName(isAdmin: boolean): string {
  return isAdmin ? ADMIN_CSRF_COOKIE_NAME : USER_CSRF_COOKIE_NAME;
}

function getRefreshCookieName(isAdmin: boolean): string {
  return isAdmin ? ADMIN_REFRESH_COOKIE_NAME : USER_REFRESH_COOKIE_NAME;
}

function parseCookies(request: IncomingMessage): Record<string, string> {
  const raw = request.headers.cookie;
  if (!raw) return {};
  return raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return acc;
    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function appendSetCookie(response: ServerResponse, cookie: string): void {
  const existing = response.getHeader("Set-Cookie");
  if (!existing) {
    response.setHeader("Set-Cookie", [cookie]);
    return;
  }
  if (Array.isArray(existing)) {
    response.setHeader("Set-Cookie", [...existing.map(String), cookie]);
    return;
  }
  response.setHeader("Set-Cookie", [String(existing), cookie]);
}

function buildCookie(
  name: string,
  value: string,
  options: { maxAge?: number; httpOnly: boolean }
): string {
  const encoded = encodeURIComponent(value);
  const parts = [
    `${name}=${encoded}`,
    "Path=/",
    "SameSite=Lax",
    "Secure",
    options.httpOnly ? "HttpOnly" : "",
    typeof options.maxAge === "number" ? `Max-Age=${Math.max(0, options.maxAge)}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

async function getDurations(context: Context, cohort: "user" | "admin") {
  if (cohort === "admin") {
    const s = (await getSetting(context, "admin_session")) as
      | { lifetime_seconds?: number }
      | undefined
      | null;
    let lifetime = s?.lifetime_seconds;
    if (lifetime === undefined) {
      const v = (await getSetting(context, "admin_session.lifetime_seconds")) as
        | number
        | undefined
        | null;
      if (typeof v === "number") lifetime = v;
    }
    const sessionSeconds = lifetime && lifetime > 0 ? lifetime : 15 * 60;
    const refreshSeconds = 7 * 24 * 60 * 60;
    return { sessionMs: sessionSeconds * 1000, refreshMs: refreshSeconds * 1000 };
  }
  return { sessionMs: 15 * 60 * 1000, refreshMs: 7 * 24 * 60 * 60 * 1000 };
}

export async function getSessionTtlSeconds(
  context: Context,
  cohort: "user" | "admin"
): Promise<number> {
  const { sessionMs } = await getDurations(context, cohort);
  return Math.floor(sessionMs / 1000);
}

export function issueSessionCookies(
  response: ServerResponse,
  sessionId: string,
  ttlSeconds: number,
  isAdmin = false,
  csrfToken?: string
): string {
  const csrf = csrfToken || generateRandomString(32);
  const authCookieName = getAuthCookieName(isAdmin);
  const csrfCookieName = getCsrfCookieName(isAdmin);
  appendSetCookie(
    response,
    buildCookie(authCookieName, sessionId, {
      httpOnly: true,
      maxAge: ttlSeconds,
    })
  );
  appendSetCookie(
    response,
    buildCookie(csrfCookieName, csrf, {
      httpOnly: false,
      maxAge: ttlSeconds,
    })
  );
  return csrf;
}

export function issueRefreshTokenCookie(
  response: ServerResponse,
  refreshToken: string,
  ttlSeconds: number,
  isAdmin = false
): void {
  appendSetCookie(
    response,
    buildCookie(getRefreshCookieName(isAdmin), refreshToken, {
      httpOnly: true,
      maxAge: ttlSeconds,
    })
  );
}

export function clearSessionCookies(response: ServerResponse, isAdmin = false): void {
  const authCookieName = getAuthCookieName(isAdmin);
  const csrfCookieName = getCsrfCookieName(isAdmin);
  appendSetCookie(
    response,
    buildCookie(authCookieName, "", {
      httpOnly: true,
      maxAge: 0,
    })
  );
  appendSetCookie(
    response,
    buildCookie(csrfCookieName, "", {
      httpOnly: false,
      maxAge: 0,
    })
  );
}

export function clearRefreshTokenCookie(response: ServerResponse, isAdmin = false): void {
  appendSetCookie(
    response,
    buildCookie(getRefreshCookieName(isAdmin), "", {
      httpOnly: true,
      maxAge: 0,
    })
  );
}

export function getSessionIdFromCookie(request: IncomingMessage, isAdmin = false): string | null {
  const cookies = parseCookies(request);
  const sessionId = cookies[getAuthCookieName(isAdmin)];
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
}

export function getCsrfCookieToken(request: IncomingMessage, isAdmin = false): string | null {
  const cookies = parseCookies(request);
  const token = cookies[getCsrfCookieName(isAdmin)];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function getRefreshTokenFromCookie(
  request: IncomingMessage,
  isAdmin = false
): string | null {
  const cookies = parseCookies(request);
  const token = cookies[getRefreshCookieName(isAdmin)];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function getRefreshTokenTtlSeconds(
  context: Context,
  cohort: "user" | "admin"
): Promise<number> {
  const { refreshMs } = await getDurations(context, cohort);
  return Math.floor(refreshMs / 1000);
}

export async function createSession(
  context: Context,
  cohort: "user" | "admin",
  data: SessionData
): Promise<{ sessionId: string; refreshToken: string }> {
  const sessionId = generateRandomString(32);
  const refreshToken = generateRandomString(64);
  const refreshTokenHash = sha256Base64Url(refreshToken);
  const { sessionMs, refreshMs } = await getDurations(context, cohort);
  const expiresAt = new Date(Date.now() + sessionMs);
  const refreshTokenExpiresAt = new Date(Date.now() + refreshMs);

  await context.db.insert(sessions).values({
    id: sessionId,
    cohort,
    userSub: data.sub,
    adminId: data.adminId,
    createdAt: new Date(),
    expiresAt,
    refreshToken: refreshTokenHash,
    refreshTokenExpiresAt,
    data,
  });

  try {
    context.logger.info(
      {
        event: "session.create",
        sessionId,
        cohort,
        userSub: data.sub,
        adminId: data.adminId,
        expiresAt,
      },
      "session created"
    );
  } catch {}

  return { sessionId, refreshToken };
}

export async function rotateSession(
  context: Context,
  currentSessionId: string,
  data: SessionData
): Promise<{ sessionId: string; refreshToken: string } | null> {
  const current = await context.db.query.sessions.findFirst({
    where: eq(sessions.id, currentSessionId),
  });
  if (!current) return null;

  const rotated = await createSession(context, current.cohort as "user" | "admin", data);
  await deleteSession(context, currentSessionId);
  return rotated;
}

export async function getSession(context: Context, sessionId: string): Promise<SessionData | null> {
  const session = await context.db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });

  if (!session) return null;

  if (new Date() > session.expiresAt) {
    await deleteSession(context, sessionId);
    return null;
  }

  return session.data as SessionData;
}

export async function updateSession(
  context: Context,
  sessionId: string,
  data: SessionData
): Promise<void> {
  await context.db.update(sessions).set({ data }).where(eq(sessions.id, sessionId));
}

export async function deleteSession(context: Context, sessionId: string): Promise<void> {
  try {
    if (!sessionId || typeof sessionId !== "string") {
      context.logger.error({ sessionId }, "Invalid sessionId for deletion");
      return;
    }

    await context.db.delete(sessions).where(eq(sessions.id, sessionId));
  } catch (error) {
    context.logger.error(error);
  }
}

export async function refreshSession(context: Context, sessionId: string): Promise<void> {
  const session = await context.db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  const cohort: "user" | "admin" = (session?.cohort as "user" | "admin") || "user";
  const { sessionMs } = await getDurations(context, cohort);
  const expiresAt = new Date(Date.now() + sessionMs);

  await context.db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
}

export function getSessionId(request: IncomingMessage, _isAdmin = false): string | null {
  return getSessionIdFromCookie(request, _isAdmin);
}

export async function requireSession(
  context: Context,
  request: IncomingMessage,
  isAdmin = false
): Promise<SessionData> {
  const sessionId = getSessionId(request, isAdmin);

  if (!sessionId) {
    throw new UnauthorizedError("No session cookie");
  }

  const sessionData = await getSession(context, sessionId);

  if (!sessionData) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  if (isAdmin && !sessionData.adminId) {
    throw new UnauthorizedError("Admin session required");
  }

  if (!isAdmin && !sessionData.sub) {
    throw new UnauthorizedError("User session required");
  }

  if (!isAdmin && sessionData.sub) {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const path = url.pathname || "";
    const otpAllowed = path.startsWith("/otp/") || path === "/logout" || path === "/session";
    if (sessionData.otpRequired && !sessionData.otpVerified && !otpAllowed) {
      throw new UnauthorizedError("OTP verification required");
    }
  }

  if (isAdmin && sessionData.adminId) {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const path = url.pathname || "";
    const otpAllowed =
      path.startsWith("/admin/otp/") || path === "/admin/session" || path === "/admin/logout";
    if (sessionData.otpRequired && !sessionData.otpVerified && !otpAllowed) {
      throw new UnauthorizedError("OTP verification required");
    }
  }

  return sessionData;
}

export async function refreshSessionWithToken(
  context: Context,
  refreshToken: string
): Promise<{ sessionId: string; refreshToken: string } | null> {
  const refreshTokenHash = sha256Base64Url(refreshToken);
  const now = new Date();

  return context.db.transaction(async (transaction) => {
    const [session] = await transaction
      .update(sessions)
      .set({ refreshTokenConsumedAt: now })
      .where(
        and(
          eq(sessions.refreshToken, refreshTokenHash),
          isNull(sessions.refreshTokenConsumedAt),
          gt(sessions.refreshTokenExpiresAt, now)
        )
      )
      .returning();

    if (!session) {
      return null;
    }

    const newSessionId = generateRandomString(32);
    const newRefreshToken = generateRandomString(64);
    const newRefreshTokenHash = sha256Base64Url(newRefreshToken);
    const { sessionMs, refreshMs } = await getDurations(
      context,
      session.cohort as "user" | "admin"
    );
    const expiresAt = new Date(Date.now() + sessionMs);
    const refreshTokenExpiresAt = new Date(Date.now() + refreshMs);

    await transaction.insert(sessions).values({
      id: newSessionId,
      cohort: session.cohort,
      userSub: session.userSub,
      adminId: session.adminId,
      createdAt: new Date(),
      expiresAt,
      refreshToken: newRefreshTokenHash,
      refreshTokenExpiresAt,
      data: session.data,
    });

    await transaction.delete(sessions).where(eq(sessions.id, session.id));

    return { sessionId: newSessionId, refreshToken: newRefreshToken };
  });
}

export async function cleanupExpiredSessions(context: Context): Promise<void> {
  await context.db.delete(sessions).where(lt(sessions.refreshTokenExpiresAt, new Date()));
}

export async function getActorFromRefreshToken(
  context: Context,
  refreshToken: string
): Promise<{ adminId?: string | null; userSub?: string | null } | null> {
  const refreshTokenHash = sha256Base64Url(refreshToken);
  const session = await context.db.query.sessions.findFirst({
    where: eq(sessions.refreshToken, refreshTokenHash),
  });
  if (!session) return null;
  return { adminId: session.adminId, userSub: session.userSub };
}

export async function getRefreshTokenSessionData(
  context: Context,
  refreshToken: string
): Promise<SessionData | null> {
  const refreshTokenHash = sha256Base64Url(refreshToken);
  const now = new Date();
  const session = await context.db.query.sessions.findFirst({
    where: and(
      eq(sessions.refreshToken, refreshTokenHash),
      isNull(sessions.refreshTokenConsumedAt),
      gt(sessions.refreshTokenExpiresAt, now)
    ),
  });
  if (!session) return null;
  return session.data as SessionData;
}

export async function getActorFromSessionId(
  context: Context,
  sessionId: string
): Promise<{ adminId?: string | null; userSub?: string | null } | null> {
  const session = await context.db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return null;
  return { adminId: session.adminId, userSub: session.userSub };
}
