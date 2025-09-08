import { eq } from "drizzle-orm";
import { adminOpaqueRecords, adminUsers, users, opaqueRecords } from "../db/schema.js";
import { NotFoundError, UnauthorizedError } from "../errors.js";
import type { Context } from "../types.js";
import { fromBase64Url, toBase64Url } from "../utils/crypto.js";

export interface OpaqueStartRequest {
  email: string;
  start: string;
}

export interface OpaqueStartResponse {
  response: string;
  sessionId: string;
}

export interface OpaqueFinishRequest {
  sessionId: string;
  finish: string;
}

export interface OpaqueFinishResponse {
  success: boolean;
  userId?: string;
  sessionToken?: string;
}

export interface OpaqueRecord {
  id: string;
  sessionId: string;
  email: string;
  opaqueRecord: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Starts OPAQUE login for admin users
 */
export async function startAdminOpaqueLogin(
  context: Context,
  request: OpaqueStartRequest
): Promise<OpaqueStartResponse> {
  // Find admin user by email
  const adminUser = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.email, request.email),
  });

  if (!adminUser) {
    throw new NotFoundError("Admin user not found");
  }

  // Get OPAQUE record for user
  const opaqueRecord = await context.db.query.adminOpaqueRecords.findFirst({
    where: eq(adminOpaqueRecords.adminId, adminUser.id),
  });

  if (!opaqueRecord || !opaqueRecord.serverRecord) {
    throw new UnauthorizedError("User authentication not configured");
  }

  // Process OPAQUE login start
  try {
    const clientStart = fromBase64Url(request.start);
    const serverRecord = fromBase64Url(opaqueRecord.serverRecord);

    // Use OPAQUE library to process login start
    const result = await context.services.opaque.loginStart(clientStart, serverRecord);

    // Store session for login finish
    const sessionId = context.services.crypto.generateRandomString(32);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OPAQUE session data temporarily
    await context.db.insert(adminOpaqueRecords).values({
      adminId: adminUser.id,
      sessionId,
      response: toBase64Url(result.response),
      serverSession: toBase64Url(result.serverSession),
      createdAt: new Date(),
      expiresAt,
    }).onConflictDoUpdate({
      target: [adminOpaqueRecords.adminId],
      set: {
        sessionId,
        response: toBase64Url(result.response),
        serverSession: toBase64Url(result.serverSession),
        updatedAt: new Date(),
        expiresAt,
      },
    });

    return {
      response: toBase64Url(result.response),
      sessionId,
    };
  } catch (error) {
    throw new UnauthorizedError("Authentication failed");
  }
}

/**
 * Finishes OPAQUE login for admin users
 */
export async function finishAdminOpaqueLogin(
  context: Context,
  request: OpaqueFinishRequest
): Promise<OpaqueFinishResponse> {
  // Find OPAQUE session
  const opaqueSession = await context.db.query.adminOpaqueRecords.findFirst({
    where: eq(adminOpaqueRecords.sessionId, request.sessionId),
  });

  if (!opaqueSession || !opaqueSession.serverSession) {
    throw new UnauthorizedError("Invalid session");
  }

  // Check if session has expired
  if (new Date() > opaqueSession.expiresAt) {
    throw new UnauthorizedError("Session expired");
  }

  // Get admin user
  const adminUser = await context.db.query.adminUsers.findFirst({
    where: eq(adminUsers.id, opaqueSession.adminId),
  });

  if (!adminUser) {
    throw new NotFoundError("Admin user not found");
  }

  try {
    const clientFinish = fromBase64Url(request.finish);
    const serverSession = fromBase64Url(opaqueSession.serverSession);

    // Verify OPAQUE login finish
    const result = await context.services.opaque.loginFinish(clientFinish, serverSession);

    if (!result.success) {
      throw new UnauthorizedError("Authentication failed");
    }

    // Create admin session
    const sessionData = {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
    };

    const session = await context.services.sessions.createAdminSession(sessionData);

    // Clean up OPAQUE session
    await context.db.delete(adminOpaqueRecords).where(
      eq(adminOpaqueRecords.sessionId, request.sessionId)
    );

    return {
      success: true,
      userId: adminUser.id,
      sessionToken: session.token,
    };
  } catch (error) {
    throw new UnauthorizedError("Authentication failed");
  }
}

/**
 * Starts OPAQUE login for regular users
 */
export async function startUserOpaqueLogin(
  context: Context,
  request: OpaqueStartRequest
): Promise<OpaqueStartResponse> {
  // Find user by email
  const user = await context.db.query.users.findFirst({
    where: eq(users.email, request.email),
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Get OPAQUE record for user
  const opaqueRecord = await context.db.query.opaqueRecords.findFirst({
    where: eq(opaqueRecords.userSub, user.sub),
  });

  if (!opaqueRecord || !opaqueRecord.serverRecord) {
    throw new UnauthorizedError("User authentication not configured");
  }

  try {
    const clientStart = fromBase64Url(request.start);
    const serverRecord = fromBase64Url(opaqueRecord.serverRecord);

    // Use OPAQUE library to process login start
    const result = await context.services.opaque.loginStart(clientStart, serverRecord);

    // Store session for login finish
    const sessionId = context.services.crypto.generateRandomString(32);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OPAQUE session data temporarily
    await context.db.insert(opaqueRecords).values({
      userSub: user.sub,
      sessionId,
      response: toBase64Url(result.response),
      serverSession: toBase64Url(result.serverSession),
      createdAt: new Date(),
      expiresAt,
    }).onConflictDoUpdate({
      target: [opaqueRecords.userSub],
      set: {
        sessionId,
        response: toBase64Url(result.response),
        serverSession: toBase64Url(result.serverSession),
        updatedAt: new Date(),
        expiresAt,
      },
    });

    return {
      response: toBase64Url(result.response),
      sessionId,
    };
  } catch (error) {
    throw new UnauthorizedError("Authentication failed");
  }
}

/**
 * Finishes OPAQUE login for regular users
 */
export async function finishUserOpaqueLogin(
  context: Context,
  request: OpaqueFinishRequest
): Promise<OpaqueFinishResponse> {
  // Find OPAQUE session
  const opaqueSession = await context.db.query.opaqueRecords.findFirst({
    where: eq(opaqueRecords.sessionId, request.sessionId),
  });

  if (!opaqueSession || !opaqueSession.serverSession) {
    throw new UnauthorizedError("Invalid session");
  }

  // Check if session has expired
  if (new Date() > opaqueSession.expiresAt) {
    throw new UnauthorizedError("Session expired");
  }

  // Get user
  const user = await context.db.query.users.findFirst({
    where: eq(users.sub, opaqueSession.userSub),
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  try {
    const clientFinish = fromBase64Url(request.finish);
    const serverSession = fromBase64Url(opaqueSession.serverSession);

    // Verify OPAQUE login finish
    const result = await context.services.opaque.loginFinish(clientFinish, serverSession);

    if (!result.success) {
      throw new UnauthorizedError("Authentication failed");
    }

    // Create user session
    const sessionData = {
      sub: user.sub,
      email: user.email,
      name: user.name,
    };

    const session = await context.services.sessions.createUserSession(sessionData);

    // Clean up OPAQUE session
    await context.db.delete(opaqueRecords).where(
      eq(opaqueRecords.sessionId, request.sessionId)
    );

    return {
      success: true,
      userId: user.sub,
      sessionToken: session.token,
    };
  } catch (error) {
    throw new UnauthorizedError("Authentication failed");
  }
}

/**
 * Starts OPAQUE registration for admin users
 */
export async function startAdminOpaqueRegister(
  context: Context,
  email: string,
  registrationStart: string
): Promise<{ response: string; sessionId: string }> {
  try {
    const clientStart = fromBase64Url(registrationStart);
    
    // Generate OPAQUE registration start response
    const result = await context.services.opaque.registerStart(clientStart);
    
    // Store session for registration finish
    const sessionId = context.services.crypto.generateRandomString(32);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store temporary registration data
    await context.db.insert(adminOpaqueRecords).values({
      email,
      sessionId,
      response: toBase64Url(result.response),
      serverState: toBase64Url(result.serverState),
      createdAt: new Date(),
      expiresAt,
    });

    return {
      response: toBase64Url(result.response),
      sessionId,
    };
  } catch (error) {
    throw new UnauthorizedError("Registration start failed");
  }
}

/**
 * Finishes OPAQUE registration for admin users
 */
export async function finishAdminOpaqueRegister(
  context: Context,
  sessionId: string,
  registrationFinish: string,
  userData: { email: string; name: string; role: "read" | "write" }
): Promise<{ success: boolean; adminId: string }> {
  // Find registration session
  const registrationSession = await context.db.query.adminOpaqueRecords.findFirst({
    where: eq(adminOpaqueRecords.sessionId, sessionId),
  });

  if (!registrationSession || !registrationSession.serverState) {
    throw new UnauthorizedError("Invalid registration session");
  }

  // Check if session has expired
  if (new Date() > registrationSession.expiresAt) {
    throw new UnauthorizedError("Registration session expired");
  }

  try {
    const clientFinish = fromBase64Url(registrationFinish);
    const serverState = fromBase64Url(registrationSession.serverState);

    // Complete OPAQUE registration
    const result = await context.services.opaque.registerFinish(clientFinish, serverState);

    if (!result.success) {
      throw new UnauthorizedError("Registration failed");
    }

    // Create admin user
    const adminUserResult = await context.db.insert(adminUsers).values({
      email: userData.email,
      name: userData.name,
      role: userData.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    const adminUser = adminUserResult[0];
    if (!adminUser) {
      throw new Error("Failed to create admin user");
    }

    // Store OPAQUE server record
    await context.db.insert(adminOpaqueRecords).values({
      adminId: adminUser.id,
      serverRecord: toBase64Url(result.serverRecord),
      createdAt: new Date(),
    }).onConflictDoUpdate({
      target: [adminOpaqueRecords.adminId],
      set: {
        serverRecord: toBase64Url(result.serverRecord),
        updatedAt: new Date(),
      },
    });

    // Clean up registration session
    await context.db.delete(adminOpaqueRecords).where(
      eq(adminOpaqueRecords.sessionId, sessionId)
    );

    return {
      success: true,
      adminId: adminUser.id,
    };
  } catch (error) {
    throw new UnauthorizedError("Registration completion failed");
  }
}