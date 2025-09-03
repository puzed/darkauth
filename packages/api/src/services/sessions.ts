import type { IncomingMessage, ServerResponse } from "node:http";
import { eq, lt } from "drizzle-orm";
import { sessions } from "../db/schema.js";
import { UnauthorizedError } from "../errors.js";
import type { Context, SessionData } from "../types.js";
import { generateRandomString } from "../utils/crypto.js";
import {
  clearSessionCookie,
  getSessionIdFromSecureCookie,
  setSecureSessionCookie,
} from "../utils/security.js";
import { getSetting } from "./settings.js";

const _SESSION_COOKIE_NAME = "__Host-DarkAuth";

async function getDurations(context: Context, cohort: "user" | "admin") {
  if (cohort === "admin") {
    const s = (await getSetting(context, "admin_session")) as
      | { lifetime_seconds?: number; refresh_lifetime_seconds?: number }
      | undefined
      | null;
    let lifetime = s?.lifetime_seconds;
    let refreshLifetime = s?.refresh_lifetime_seconds;
    if (lifetime === undefined) {
      const v = (await getSetting(context, "admin_session.lifetime_seconds")) as
        | number
        | undefined
        | null;
      if (typeof v === "number") lifetime = v;
    }
    if (refreshLifetime === undefined) {
      const v = (await getSetting(context, "admin_session.refresh_lifetime_seconds")) as
        | number
        | undefined
        | null;
      if (typeof v === "number") refreshLifetime = v;
    }
    const sessionSeconds = lifetime && lifetime > 0 ? lifetime : 15 * 60;
    const refreshSeconds =
      refreshLifetime && refreshLifetime > 0 ? refreshLifetime : 7 * 24 * 60 * 60;
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

export async function createSession(
  context: Context,
  cohort: "user" | "admin",
  data: SessionData
): Promise<{ sessionId: string; refreshToken: string }> {
  const sessionId = generateRandomString(32);
  const refreshToken = generateRandomString(64);
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
    refreshToken,
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
    // Ensure sessionId is a valid string
    if (!sessionId || typeof sessionId !== "string") {
      console.error("Invalid sessionId for deletion:", sessionId);
      return;
    }

    // Use execute instead of the query builder to avoid prepared statement issues
    await context.db.delete(sessions).where(eq(sessions.id, sessionId));
  } catch (error) {
    console.error("Error deleting session:", error);
    // Don't throw the error to prevent logout from failing
    // The session cookie will still be cleared
  }
}

export async function refreshSession(context: Context, sessionId: string): Promise<void> {
  const session = await context.db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  const cohort: "user" | "admin" = (session?.cohort as "user" | "admin") || "user";
  const { sessionMs } = await getDurations(context, cohort);
  const expiresAt = new Date(Date.now() + sessionMs);

  await context.db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
}

export function setSessionCookie(
  response: ServerResponse,
  sessionId: string,
  isAdmin = false,
  isDevelopment = false,
  maxAgeSeconds?: number
): void {
  if (!isAdmin) {
    setSecureSessionCookie(
      response,
      sessionId,
      typeof maxAgeSeconds === "number" ? maxAgeSeconds : 15 * 60,
      isDevelopment
    );
  } else {
    const name = isDevelopment ? "DarkAuth-admin" : "__Host-DarkAuth-admin";
    const cookieOptions = [
      `${name}=${sessionId}`,
      `Max-Age=${typeof maxAgeSeconds === "number" ? maxAgeSeconds : 15 * 60}`,
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
    ];

    if (!isDevelopment) {
      cookieOptions.push("Secure");
    }

    response.setHeader("Set-Cookie", cookieOptions.join("; "));
  }
}

export function clearSessionCookieLocal(
  response: ServerResponse,
  isAdmin = false,
  isDevelopment = false
): void {
  if (!isAdmin) {
    clearSessionCookie(response, isDevelopment);
  } else {
    const names = isDevelopment ? ["DarkAuth-admin"] : ["__Host-DarkAuth-admin"];

    const headers = names.map((n) =>
      [`${n}=`, "Max-Age=0", "HttpOnly", "SameSite=Lax", "Path=/", !isDevelopment ? "Secure" : ""]
        .filter(Boolean)
        .join("; ")
    );

    response.setHeader("Set-Cookie", headers);
  }
}

export function getSessionIdFromCookie(request: IncomingMessage, isAdmin = false): string | null {
  if (!isAdmin) {
    return getSessionIdFromSecureCookie(request);
  }
  const cookies = request.headers.cookie;
  if (!cookies) return null;

  const adminMatch =
    cookies.match(/(?:^|;\s*)__Host-DarkAuth-admin=([^;]+)/) ||
    cookies.match(/(?:^|;\s*)DarkAuth-admin=([^;]+)/);
  return adminMatch ? adminMatch[1] || null : null;
}

export async function requireSession(
  context: Context,
  request: IncomingMessage,
  isAdmin = false
): Promise<SessionData> {
  const sessionId = getSessionIdFromCookie(request, isAdmin);

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

  await refreshSession(context, sessionId);

  return sessionData;
}

export async function refreshSessionWithToken(
  context: Context,
  refreshToken: string
): Promise<{ sessionId: string; refreshToken: string } | null> {
  const session = await context.db.query.sessions.findFirst({
    where: eq(sessions.refreshToken, refreshToken),
  });

  if (!session) return null;

  // Check if refresh token is expired
  if (!session.refreshTokenExpiresAt || new Date() > session.refreshTokenExpiresAt) {
    await deleteSession(context, session.id);
    return null;
  }

  // Generate new session ID and refresh token
  const newSessionId = generateRandomString(32);
  const newRefreshToken = generateRandomString(64);
  const { sessionMs, refreshMs } = await getDurations(context, session.cohort as "user" | "admin");
  const expiresAt = new Date(Date.now() + sessionMs);
  const refreshTokenExpiresAt = new Date(Date.now() + refreshMs);

  // Create new session with same data
  await context.db.insert(sessions).values({
    id: newSessionId,
    cohort: session.cohort,
    userSub: session.userSub,
    adminId: session.adminId,
    createdAt: new Date(),
    expiresAt,
    refreshToken: newRefreshToken,
    refreshTokenExpiresAt,
    data: session.data,
  });

  // Delete old session
  await deleteSession(context, session.id);

  return { sessionId: newSessionId, refreshToken: newRefreshToken };
}

export async function cleanupExpiredSessions(context: Context): Promise<void> {
  // Clean up sessions where both access token and refresh token have expired
  await context.db.delete(sessions).where(lt(sessions.refreshTokenExpiresAt, new Date()));
}

export async function getActorFromRefreshToken(
  context: Context,
  refreshToken: string
): Promise<{ adminId?: string | null; userSub?: string | null } | null> {
  const session = await context.db.query.sessions.findFirst({
    where: eq(sessions.refreshToken, refreshToken),
  });
  if (!session) return null;
  return { adminId: session.adminId, userSub: session.userSub };
}

export async function getActorFromSessionId(
  context: Context,
  sessionId: string
): Promise<{ adminId?: string | null; userSub?: string | null } | null> {
  const session = await context.db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) return null;
  return { adminId: session.adminId, userSub: session.userSub };
}
