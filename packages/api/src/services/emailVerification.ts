import { and, eq, ne } from "drizzle-orm";
import { users } from "../db/schema.ts";
import { AppError, ValidationError } from "../errors.ts";
import {
  consumeEmailVerificationToken,
  createEmailVerificationToken,
  type EmailVerificationPurpose,
  invalidateActiveEmailVerificationTokens,
} from "../models/emailVerificationTokens.ts";
import type { Context } from "../types.ts";
import { logAuditEvent } from "./audit.ts";
import { isEmailSendingAvailable, sendTemplatedEmail } from "./email.ts";
import { isPasswordResetEmailEnabled } from "./passwordReset.ts";
import { updateUserSessionsProfile } from "./sessions.ts";
import { getSetting } from "./settings.ts";

function getVerificationLink(context: Context, token: string): string {
  const base = context.config.publicOrigin;
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

export async function getVerificationTokenTtlMinutes(context: Context): Promise<number> {
  const raw = (await getSetting(context, "email.verification.token_ttl_minutes")) as
    | number
    | undefined
    | null;
  const ttl = typeof raw === "number" ? raw : 1440;
  if (ttl < 5) return 5;
  if (ttl > 10080) return 10080;
  return ttl;
}

async function issueVerificationEmail(
  context: Context,
  params: {
    userSub: string;
    name: string;
    targetEmail: string;
    purpose: EmailVerificationPurpose;
  }
): Promise<void> {
  const ttlMinutes = await getVerificationTokenTtlMinutes(context);
  const { token } = await createEmailVerificationToken(context, {
    userSub: params.userSub,
    purpose: params.purpose,
    targetEmail: params.targetEmail,
    ttlMinutes,
  });
  const verificationLink = getVerificationLink(context, token);
  const template =
    params.purpose === "signup_verify" ? "signup_verification" : "email_change_verification";
  await sendTemplatedEmail(context, {
    to: params.targetEmail,
    template,
    variables: {
      name: params.name || params.targetEmail,
      verification_link: verificationLink,
    },
  });
}

export async function ensureRegistrationAllowedForVerification(context: Context): Promise<void> {
  const requireVerification =
    (await getSetting(context, "users.require_email_verification")) === true;
  if (!requireVerification) return;
  const available = await isEmailSendingAvailable(context);
  if (!available) {
    throw new AppError("Registration currently disabled", "REGISTRATION_DISABLED", 403);
  }
}

export async function sendSignupVerification(
  context: Context,
  params: { userSub: string; email: string; name: string }
): Promise<void> {
  await issueVerificationEmail(context, {
    userSub: params.userSub,
    name: params.name,
    targetEmail: params.email,
    purpose: "signup_verify",
  });
  await logAuditEvent(context, {
    eventType: "USER_EMAIL_VERIFICATION_SENT",
    cohort: "user",
    userId: params.userSub,
    ipAddress: "system",
    success: true,
    resourceType: "user",
    resourceId: params.userSub,
  });
}

export async function resendPendingEmailChangeVerification(
  context: Context,
  params: { userSub: string }
): Promise<{ pendingEmail: string; pendingEmailSetAt: string | null }> {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, params.userSub) });
  if (!user) {
    throw new ValidationError("User not found");
  }
  if (!user.pendingEmail) {
    throw new ValidationError("No pending email change");
  }

  const available = await isEmailSendingAvailable(context);
  if (!available) {
    throw new ValidationError("Email transport is not available");
  }

  await issueVerificationEmail(context, {
    userSub: user.sub,
    name: user.name || "",
    targetEmail: user.pendingEmail,
    purpose: "email_change_verify",
  });

  await logAuditEvent(context, {
    eventType: "USER_EMAIL_CHANGE_VERIFICATION_RESENT",
    cohort: "user",
    userId: params.userSub,
    ipAddress: "system",
    success: true,
    resourceType: "user",
    resourceId: params.userSub,
  });

  return {
    pendingEmail: user.pendingEmail,
    pendingEmailSetAt: user.pendingEmailSetAt ? user.pendingEmailSetAt.toISOString() : null,
  };
}

export async function cancelPendingEmailChange(
  context: Context,
  params: { userSub: string }
): Promise<{ success: true; pendingEmail: null; pendingEmailSetAt: null }> {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, params.userSub) });
  if (!user) {
    throw new ValidationError("User not found");
  }

  await invalidateActiveEmailVerificationTokens(context, params.userSub, "email_change_verify");
  await context.db
    .update(users)
    .set({ pendingEmail: null, pendingEmailSetAt: null })
    .where(eq(users.sub, params.userSub));

  await logAuditEvent(context, {
    eventType: "USER_EMAIL_CHANGE_CANCELLED",
    cohort: "user",
    userId: params.userSub,
    ipAddress: "system",
    success: true,
    resourceType: "user",
    resourceId: params.userSub,
  });

  return { success: true, pendingEmail: null, pendingEmailSetAt: null };
}

export async function sendSignupExistingAccountNotice(
  context: Context,
  params: { email: string; name: string }
): Promise<void> {
  const recoveryLink = (await isPasswordResetEmailEnabled(context))
    ? `${context.config.publicOrigin}/forgot-password`
    : `${context.config.publicOrigin}/login`;
  await sendTemplatedEmail(context, {
    to: params.email,
    template: "signup_existing_account_notice",
    variables: {
      name: params.name || params.email,
      recovery_link: recoveryLink,
    },
  });
}

export async function resendSignupVerificationByEmail(
  context: Context,
  email: string
): Promise<void> {
  const user = await context.db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || user.emailVerifiedAt) {
    return;
  }

  const available = await isEmailSendingAvailable(context);
  if (!available) {
    return;
  }

  await issueVerificationEmail(context, {
    userSub: user.sub,
    name: user.name || "",
    targetEmail: user.email || email,
    purpose: "signup_verify",
  });

  await logAuditEvent(context, {
    eventType: "USER_EMAIL_VERIFICATION_RESENT",
    cohort: "user",
    userId: user.sub,
    ipAddress: "system",
    success: true,
    resourceType: "user",
    resourceId: user.sub,
  });
}

export async function consumeVerificationTokenAndApply(
  context: Context,
  token: string
): Promise<{ purpose: EmailVerificationPurpose; userSub: string; targetEmail: string }> {
  const consumed = await consumeEmailVerificationToken(context, token);

  if (consumed.purpose === "signup_verify") {
    await context.db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.sub, consumed.userSub));

    await logAuditEvent(context, {
      eventType: "USER_EMAIL_VERIFIED",
      cohort: "user",
      userId: consumed.userSub,
      ipAddress: "system",
      success: true,
      resourceType: "user",
      resourceId: consumed.userSub,
    });

    return {
      purpose: consumed.purpose,
      userSub: consumed.userSub,
      targetEmail: consumed.targetEmail,
    };
  }

  let updatedProfile: { email: string | null; name: string | null } | null = null;
  await context.db.transaction(async (tx) => {
    const conflict = await tx.query.users.findFirst({
      where: and(eq(users.email, consumed.targetEmail), ne(users.sub, consumed.userSub)),
    });
    if (conflict) {
      throw new ValidationError("Email is already in use");
    }

    const user = await tx.query.users.findFirst({ where: eq(users.sub, consumed.userSub) });
    if (!user) {
      throw new ValidationError("User not found");
    }
    const opaqueLoginIdentity = user.opaqueLoginIdentity || user.email || consumed.targetEmail;

    await tx
      .update(users)
      .set({
        email: consumed.targetEmail,
        opaqueLoginIdentity,
        pendingEmail: null,
        pendingEmailSetAt: null,
        emailVerifiedAt: new Date(),
      })
      .where(eq(users.sub, consumed.userSub));
    updatedProfile = { email: consumed.targetEmail, name: user.name };
  });

  if (updatedProfile) {
    await updateUserSessionsProfile(context, consumed.userSub, updatedProfile);
  }

  await logAuditEvent(context, {
    eventType: "USER_EMAIL_CHANGE_VERIFIED",
    cohort: "user",
    userId: consumed.userSub,
    ipAddress: "system",
    success: true,
    resourceType: "user",
    resourceId: consumed.userSub,
  });

  return {
    purpose: consumed.purpose,
    userSub: consumed.userSub,
    targetEmail: consumed.targetEmail,
  };
}

export async function requestEmailChangeVerification(
  context: Context,
  params: { userSub: string; email: string }
): Promise<{ pendingEmail: string; pendingEmailSetAt: string }> {
  const user = await context.db.query.users.findFirst({ where: eq(users.sub, params.userSub) });
  if (!user) {
    throw new ValidationError("User not found");
  }
  if (!params.email || params.email === user.email) {
    throw new ValidationError("Invalid email");
  }
  const conflict = await context.db.query.users.findFirst({
    where: and(eq(users.email, params.email), ne(users.sub, params.userSub)),
  });
  if (conflict) {
    throw new ValidationError("Email is already in use");
  }

  const available = await isEmailSendingAvailable(context);
  if (!available) {
    throw new ValidationError("Email transport is not available");
  }

  const pendingEmailSetAt = new Date();
  await context.db
    .update(users)
    .set({ pendingEmail: params.email, pendingEmailSetAt })
    .where(eq(users.sub, params.userSub));

  await issueVerificationEmail(context, {
    userSub: user.sub,
    name: user.name || "",
    targetEmail: params.email,
    purpose: "email_change_verify",
  });

  await logAuditEvent(context, {
    eventType: "USER_EMAIL_CHANGE_REQUESTED",
    cohort: "user",
    userId: params.userSub,
    ipAddress: "system",
    success: true,
    resourceType: "user",
    resourceId: params.userSub,
  });

  return { pendingEmail: params.email, pendingEmailSetAt: pendingEmailSetAt.toISOString() };
}
