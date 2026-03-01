import { and, eq, ne } from "drizzle-orm";
import { users } from "../db/schema.ts";
import { AppError, ValidationError } from "../errors.ts";
import {
  consumeEmailVerificationToken,
  createEmailVerificationToken,
  type EmailVerificationPurpose,
} from "../models/emailVerificationTokens.ts";
import type { Context } from "../types.ts";
import { logAuditEvent } from "./audit.ts";
import { isEmailSendingAvailable, sendTemplatedEmail } from "./email.ts";
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
): Promise<void> {
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

    return;
  }

  await context.db.transaction(async (tx) => {
    const conflict = await tx.query.users.findFirst({
      where: and(eq(users.email, consumed.targetEmail), ne(users.sub, consumed.userSub)),
    });
    if (conflict) {
      throw new ValidationError("Email is already in use");
    }

    await tx
      .update(users)
      .set({
        email: consumed.targetEmail,
        pendingEmail: null,
        pendingEmailSetAt: null,
        emailVerifiedAt: new Date(),
      })
      .where(eq(users.sub, consumed.userSub));
  });

  await logAuditEvent(context, {
    eventType: "USER_EMAIL_CHANGE_VERIFIED",
    cohort: "user",
    userId: consumed.userSub,
    ipAddress: "system",
    success: true,
    resourceType: "user",
    resourceId: consumed.userSub,
  });
}

export async function requestEmailChangeVerification(
  context: Context,
  params: { userSub: string; email: string }
): Promise<void> {
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

  await context.db
    .update(users)
    .set({ pendingEmail: params.email, pendingEmailSetAt: new Date() })
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
}
