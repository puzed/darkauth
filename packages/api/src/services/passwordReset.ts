import { and, eq, gt, isNull, ne } from "drizzle-orm";
import {
  authCodes,
  opaqueRecords,
  passwordResetTokens,
  pendingAuth,
  sessions,
  userOpaqueRecordHistory,
  userPasswordHistory,
  users,
} from "../db/schema.ts";
import { ConflictError, NotFoundError, ValidationError } from "../errors.ts";
import {
  countPasswordResetTokensSince,
  createPasswordResetToken,
  getActivePasswordResetToken,
  getLatestPasswordResetTokenForUser,
  hashPasswordResetToken,
  invalidateActivePasswordResetTokens,
} from "../models/passwordResetTokens.ts";
import type { Context } from "../types.ts";
import { toBase64Url } from "../utils/crypto.ts";
import { logAuditEvent } from "./audit.ts";
import { isEmailSendingAvailable, sendTemplatedEmail } from "./email.ts";
import { getSetting } from "./settings.ts";

export const PASSWORD_RESET_GENERIC_MESSAGE = "If an account exists, we sent reset instructions.";

export function normalizePasswordResetEmail(email: string): string {
  return email.trim().toLowerCase();
}

function asNumberSetting(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export async function getPasswordResetTokenTtlMinutes(context: Context): Promise<number> {
  return asNumberSetting(
    await getSetting(context, "users.password_reset_token_ttl_minutes"),
    30,
    5,
    1440
  );
}

async function getPasswordResetCooldownMinutes(context: Context): Promise<number> {
  return asNumberSetting(
    await getSetting(context, "users.password_reset_request_cooldown_minutes"),
    5,
    1,
    60
  );
}

async function getPasswordResetMaxRequestsPerHour(context: Context): Promise<number> {
  return asNumberSetting(
    await getSetting(context, "users.password_reset_max_requests_per_hour"),
    3,
    1,
    20
  );
}

export async function isPasswordResetEmailEnabled(context: Context): Promise<boolean> {
  const enabled = (await getSetting(context, "users.password_reset_email_enabled")) === true;
  if (!enabled) return false;
  return isEmailSendingAvailable(context);
}

export async function shouldShowPasswordResetLink(context: Context): Promise<boolean> {
  const showLink = (await getSetting(context, "users.password_reset_show_login_link")) !== false;
  if (!showLink) return false;
  return isPasswordResetEmailEnabled(context);
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

async function auditPasswordReset(
  context: Context,
  params: {
    eventType: string;
    ipAddress: string;
    userAgent?: string;
    userId?: string;
    success: boolean;
    errorMessage?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await logAuditEvent(context, {
    eventType: params.eventType,
    cohort: "user",
    userId: params.userId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: params.success,
    errorMessage: params.errorMessage,
    resourceType: "user",
    resourceId: params.userId,
    details: params.details,
  });
}

async function sendPasswordResetTemplate(
  context: Context,
  user: { email: string; name?: string | null },
  token: string,
  ttlMinutes: number,
  ipAddress: string
): Promise<void> {
  const resetLink = `${context.config.publicOrigin.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  await sendTemplatedEmail(context, {
    to: user.email,
    template: "password_recovery",
    variables: {
      name: user.name || user.email,
      email: user.email,
      reset_link: resetLink,
      recovery_link: resetLink,
      expires_minutes: String(ttlMinutes),
      requested_at: new Date().toISOString(),
      ip_hint: ipAddress,
    },
  });
}

export async function requestPasswordResetEmail(
  context: Context,
  params: { email: string; ipAddress: string; userAgent?: string }
): Promise<{ success: true; message: string }> {
  const email = normalizePasswordResetEmail(params.email);
  try {
    if (!(await isPasswordResetEmailEnabled(context))) {
      await auditPasswordReset(context, {
        eventType: "USER_PASSWORD_RESET_EMAIL_SKIPPED",
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        success: true,
        details: { reason: "disabled" },
      });
      return { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const user = await context.db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user || !user.email) {
      return { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const requireEmailVerification =
      (await getSetting(context, "users.require_email_verification")) === true;
    if (requireEmailVerification && !user.emailVerifiedAt) {
      await auditPasswordReset(context, {
        eventType: "USER_PASSWORD_RESET_EMAIL_SKIPPED",
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        userId: user.sub,
        success: true,
        details: { reason: "unverified" },
      });
      return { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const cooldownMinutes = await getPasswordResetCooldownMinutes(context);
    const latest = await getLatestPasswordResetTokenForUser(context, user.sub);
    if (latest && latest.createdAt > new Date(Date.now() - cooldownMinutes * 60 * 1000)) {
      await auditPasswordReset(context, {
        eventType: "USER_PASSWORD_RESET_EMAIL_SKIPPED",
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        userId: user.sub,
        success: true,
        details: { reason: "cooldown" },
      });
      return { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const maxPerHour = await getPasswordResetMaxRequestsPerHour(context);
    const count = await countPasswordResetTokensSince(
      context,
      user.sub,
      new Date(Date.now() - 60 * 60 * 1000)
    );
    if (count >= maxPerHour) {
      await auditPasswordReset(context, {
        eventType: "USER_PASSWORD_RESET_RATE_LIMITED",
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        userId: user.sub,
        success: false,
      });
      return { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    const ttlMinutes = await getPasswordResetTokenTtlMinutes(context);
    const { token } = await createPasswordResetToken(context, {
      userSub: user.sub,
      email: user.email,
      ttlMinutes,
      requestedIp: params.ipAddress,
      userAgent: params.userAgent,
    });
    try {
      await sendPasswordResetTemplate(
        context,
        { email: user.email, name: user.name },
        token,
        ttlMinutes,
        params.ipAddress
      );
    } catch (error) {
      await invalidateActivePasswordResetTokens(context, user.sub);
      context.logger.warn(error, "Failed to send password reset email");
      await auditPasswordReset(context, {
        eventType: "USER_PASSWORD_RESET_EMAIL_SKIPPED",
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        userId: user.sub,
        success: false,
        errorMessage: error instanceof Error ? error.message : "Email send failed",
        details: { reason: "smtp_failure" },
      });
      return { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
    }

    await auditPasswordReset(context, {
      eventType: "USER_PASSWORD_RESET_EMAIL_SENT",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      userId: user.sub,
      success: true,
    });
  } catch (error) {
    context.logger.warn(error, "Password reset request failed");
  }

  return { success: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
}

export async function sendAdminPasswordResetEmail(
  context: Context,
  params: {
    userSub: string;
    adminId: string;
    ipAddress: string;
    userAgent?: string;
  }
): Promise<{ success: true }> {
  if (!(await isPasswordResetEmailEnabled(context))) {
    throw new ValidationError(
      "Password reset email cannot be sent until SMTP and password reset are enabled"
    );
  }
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, params.userSub) });
  if (!user?.email) throw new NotFoundError("User not found");

  const ttlMinutes = await getPasswordResetTokenTtlMinutes(context);
  const { token } = await createPasswordResetToken(context, {
    userSub: user.sub,
    email: user.email,
    ttlMinutes,
    requestedIp: params.ipAddress,
    userAgent: params.userAgent,
  });

  try {
    await sendPasswordResetTemplate(
      context,
      { email: user.email, name: user.name },
      token,
      ttlMinutes,
      params.ipAddress
    );
  } catch (error) {
    await invalidateActivePasswordResetTokens(context, user.sub);
    context.logger.warn(error, "Failed to send admin-triggered password reset email");
    await logAuditEvent(context, {
      eventType: "ADMIN_USER_PASSWORD_RESET_EMAIL_SENT",
      cohort: "admin",
      adminId: params.adminId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Email send failed",
      resourceType: "user",
      resourceId: user.sub,
      details: { reason: "smtp_failure" },
    });
    throw new ValidationError("Password reset email could not be sent");
  }

  await logAuditEvent(context, {
    eventType: "ADMIN_USER_PASSWORD_RESET_EMAIL_SENT",
    cohort: "admin",
    adminId: params.adminId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: true,
    resourceType: "user",
    resourceId: user.sub,
  });

  return { success: true };
}

export async function validatePasswordResetTokenForDisplay(
  context: Context,
  token: string
): Promise<{ valid: boolean; email?: string }> {
  try {
    const row = await getActivePasswordResetToken(context, token);
    return { valid: true, email: maskEmail(row.email) };
  } catch {
    return { valid: false };
  }
}

export async function startPasswordResetRegistration(
  context: Context,
  params: { token: string; requestBuffer: Uint8Array; ipAddress: string; userAgent?: string }
): Promise<{ message: string; serverPublicKey: string; identityU: string }> {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  let token: Awaited<ReturnType<typeof getActivePasswordResetToken>>;
  try {
    token = await getActivePasswordResetToken(context, params.token);
  } catch {
    await auditPasswordReset(context, {
      eventType: "USER_PASSWORD_RESET_TOKEN_INVALID",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: false,
    });
    throw new ValidationError("This password reset link is invalid or expired.");
  }
  const registrationResponse = await context.services.opaque.startRegistration(
    params.requestBuffer,
    token.email
  );
  return {
    message: toBase64Url(Buffer.from(registrationResponse.message)),
    serverPublicKey: toBase64Url(Buffer.from(registrationResponse.serverPublicKey)),
    identityU: token.email,
  };
}

export async function finishPasswordResetRegistration(
  context: Context,
  params: {
    token: string;
    recordBuffer: Uint8Array;
    exportKeyHash: string;
    ipAddress: string;
    userAgent?: string;
  }
): Promise<{ success: true }> {
  if (!context.services.opaque) throw new ValidationError("OPAQUE service not available");
  let active: Awaited<ReturnType<typeof getActivePasswordResetToken>>;
  try {
    active = await getActivePasswordResetToken(context, params.token);
  } catch {
    await auditPasswordReset(context, {
      eventType: "USER_PASSWORD_RESET_TOKEN_INVALID",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: false,
    });
    throw new ValidationError("This password reset link is invalid or expired.");
  }
  const opaqueRecord = await context.services.opaque.finishRegistration(
    params.recordBuffer,
    active.email
  );
  const tokenHash = hashPasswordResetToken(context, params.token);
  const now = new Date();
  let userSub = active.userSub;

  await context.db.transaction(async (tx) => {
    const [token] = await tx
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, now)
        )
      )
      .returning();
    if (!token) throw new ValidationError("This password reset link is invalid or expired.");

    userSub = token.userSub;
    const user = await tx.query.users.findFirst({ where: eq(users.sub, token.userSub) });
    if (!user || !user.email || user.email !== token.email) {
      throw new ValidationError("This password reset link is invalid or expired.");
    }

    const anyMatch = await tx.query.userPasswordHistory.findFirst({
      where: and(
        eq(userPasswordHistory.userSub, token.userSub),
        eq(userPasswordHistory.exportKeyHash, params.exportKeyHash)
      ),
    });
    if (anyMatch) throw new ConflictError("Choose a password you have not used before.");

    const existing = await tx.query.opaqueRecords.findFirst({
      where: eq(opaqueRecords.sub, token.userSub),
    });
    if (existing) {
      await tx
        .insert(userOpaqueRecordHistory)
        .values({
          userSub: token.userSub,
          envelope: existing.envelope,
          serverPubkey: existing.serverPubkey,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userOpaqueRecordHistory.userSub,
          set: {
            envelope: existing.envelope,
            serverPubkey: existing.serverPubkey,
            updatedAt: now,
          },
        });
      await tx
        .update(opaqueRecords)
        .set({
          envelope: Buffer.from(opaqueRecord.envelope),
          serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
          updatedAt: now,
        })
        .where(eq(opaqueRecords.sub, token.userSub));
    } else {
      await tx.insert(opaqueRecords).values({
        sub: token.userSub,
        envelope: Buffer.from(opaqueRecord.envelope),
        serverPubkey: Buffer.from(opaqueRecord.serverPublicKey),
        updatedAt: now,
      });
    }

    await tx
      .insert(userPasswordHistory)
      .values({ userSub: token.userSub, exportKeyHash: params.exportKeyHash });
    await tx
      .update(users)
      .set({ passwordResetRequired: false })
      .where(eq(users.sub, token.userSub));
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userSub, token.userSub),
          ne(passwordResetTokens.id, token.id),
          isNull(passwordResetTokens.consumedAt)
        )
      );
    await tx.delete(sessions).where(eq(sessions.userSub, token.userSub));
    await tx.delete(authCodes).where(eq(authCodes.userSub, token.userSub));
    await tx.delete(pendingAuth).where(eq(pendingAuth.userSub, token.userSub));
  });

  await auditPasswordReset(context, {
    eventType: "USER_PASSWORD_RESET_COMPLETED",
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    userId: userSub,
    success: true,
  });

  return { success: true };
}
