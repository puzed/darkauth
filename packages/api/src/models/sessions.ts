import { eq, and, lt } from "drizzle-orm";
import { sessions, adminUsers, users } from "../db/schema.js";
import { UnauthorizedError, NotFoundError } from "../errors.js";
import type { Context } from "../types.js";

export interface SessionData {
  id: string;
  type: "admin" | "user";
  actorId: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  lastAccessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminSessionData {
  id: string;
  email: string;
  name: string;
  role: "read" | "write";
}

export interface UserSessionData {
  sub: string;
  email?: string;
  name?: string;
}

/**
 * Validates an admin session
 */
export async function validateAdminSession(
  context: Context,
  sessionId: string
): Promise<AdminSessionData | null> {
  const session = await context.db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      eq(sessions.type, "admin")
    ),
  });

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await context.db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Get admin user details
  const adminUser = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, session.actorId),
  });

  if (!adminUser) {
    // Clean up session for non-existent user
    await context.db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Update last accessed time
  await context.db
    .update(sessions)
    .set({ lastAccessedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return {
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: adminUser.role,
  };
}

/**
 * Validates a user session
 */
export async function validateUserSession(
  context: Context,
  sessionId: string
): Promise<UserSessionData | null> {
  const session = await context.db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, sessionId),
      eq(sessions.type, "user")
    ),
  });

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await context.db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Get user details
  const user = await context.db.query.users.findFirst({
    where: eq(users.sub, session.actorId),
  });

  if (!user) {
    // Clean up session for non-existent user
    await context.db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Update last accessed time
  await context.db
    .update(sessions)
    .set({ lastAccessedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return {
    sub: user.sub,
    email: user.email,
    name: user.name,
  };
}

/**
 * Creates a new admin session
 */
export async function createAdminSession(
  context: Context,
  adminData: AdminSessionData,
  options: {
    expiresInHours?: number;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<{ sessionId: string; refreshToken: string }> {
  const sessionId = context.services.crypto.generateRandomString(32);
  const refreshToken = context.services.crypto.generateRandomString(64);
  
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (options.expiresInHours || 24));

  await context.db.insert(sessions).values({
    id: sessionId,
    type: "admin",
    actorId: adminData.id,
    refreshToken,
    expiresAt,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });

  return { sessionId, refreshToken };
}

/**
 * Creates a new user session
 */
export async function createUserSession(
  context: Context,
  userData: UserSessionData,
  options: {
    expiresInHours?: number;
    ipAddress?: string;
    userAgent?: string;
  } = {}
): Promise<{ sessionId: string; refreshToken: string }> {
  const sessionId = context.services.crypto.generateRandomString(32);
  const refreshToken = context.services.crypto.generateRandomString(64);
  
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (options.expiresInHours || 168)); // 7 days for users

  await context.db.insert(sessions).values({
    id: sessionId,
    type: "user",
    actorId: userData.sub,
    refreshToken,
    expiresAt,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });

  return { sessionId, refreshToken };
}

/**
 * Refreshes a session (extends expiration)
 */
export async function refreshSession(
  context: Context,
  refreshToken: string
): Promise<{ sessionId: string; refreshToken: string } | null> {
  const session = await context.db.query.sessions.findFirst({
    where: eq(sessions.refreshToken, refreshToken),
  });

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    await context.db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  // Generate new refresh token and extend expiration
  const newRefreshToken = context.services.crypto.generateRandomString(64);
  const newExpiresAt = new Date();
  
  if (session.type === "admin") {
    newExpiresAt.setHours(newExpiresAt.getHours() + 24);
  } else {
    newExpiresAt.setHours(newExpiresAt.getHours() + 168); // 7 days
  }

  await context.db
    .update(sessions)
    .set({
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      lastAccessedAt: new Date(),
    })
    .where(eq(sessions.id, session.id));

  return { sessionId: session.id, refreshToken: newRefreshToken };
}

/**
 * Invalidates a session (logout)
 */
export async function invalidateSession(context: Context, sessionId: string): Promise<boolean> {
  const result = await context.db.delete(sessions).where(eq(sessions.id, sessionId)).returning();
  return result.length > 0;
}

/**
 * Invalidates all sessions for a user
 */
export async function invalidateAllUserSessions(
  context: Context,
  actorId: string,
  type: "admin" | "user"
): Promise<number> {
  const result = await context.db
    .delete(sessions)
    .where(and(
      eq(sessions.actorId, actorId),
      eq(sessions.type, type)
    ))
    .returning();

  return result.length;
}

/**
 * Cleans up expired sessions
 */
export async function cleanupExpiredSessions(context: Context): Promise<number> {
  const result = await context.db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning();

  return result.length;
}

/**
 * Lists active sessions for a user
 */
export async function listUserSessions(
  context: Context,
  actorId: string,
  type: "admin" | "user"
): Promise<SessionData[]> {
  const results = await context.db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.actorId, actorId),
      eq(sessions.type, type)
    ))
    .orderBy(sessions.lastAccessedAt);

  return results;
}