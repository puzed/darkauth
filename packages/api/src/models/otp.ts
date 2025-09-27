import { randomBytes } from "node:crypto";
import { verify as argonVerify, hash } from "argon2";
import { and, eq } from "drizzle-orm";
import { otpBackupCodes, otpConfigs, users } from "../db/schema.js";
import { ValidationError } from "../errors.js";
import { getSetting } from "../services/settings.js";
import type { Context } from "../types.js";
import { generateTotpSecretBase32, provisioningUri, verifyTotp } from "../utils/totp.js";

type OtpSettings = {
  enabled: boolean;
  issuer: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: number;
  period: number;
  window: number;
  backup_codes_count: number;
  max_failures: number;
  lockout_duration_minutes: number;
};

async function getOtpSettings(context: Context): Promise<OtpSettings> {
  const rawSettings = await getSetting(context, "otp");
  const settingsRecord = (
    rawSettings && typeof rawSettings === "object" ? (rawSettings as Record<string, unknown>) : {}
  ) as Record<string, unknown>;
  type RawSettings = Partial<{
    algorithm: string;
    enabled: boolean;
    issuer: string;
    digits: number;
    period: number;
    window: number;
    backup_codes_count: number;
    max_failures: number;
    lockout_duration_minutes: number;
  }>;
  const rawSettingsObject = settingsRecord as RawSettings;
  const algorithmString =
    typeof rawSettingsObject.algorithm === "string" ? rawSettingsObject.algorithm : "SHA1";
  const algorithm: OtpSettings["algorithm"] =
    algorithmString === "SHA256" ? "SHA256" : algorithmString === "SHA512" ? "SHA512" : "SHA1";
  return {
    enabled: typeof rawSettingsObject.enabled === "boolean" ? rawSettingsObject.enabled : true,
    issuer: typeof rawSettingsObject.issuer === "string" ? rawSettingsObject.issuer : "DarkAuth",
    algorithm,
    digits: typeof rawSettingsObject.digits === "number" ? rawSettingsObject.digits : 6,
    period: typeof rawSettingsObject.period === "number" ? rawSettingsObject.period : 30,
    window: typeof rawSettingsObject.window === "number" ? rawSettingsObject.window : 1,
    backup_codes_count:
      typeof rawSettingsObject.backup_codes_count === "number"
        ? rawSettingsObject.backup_codes_count
        : 8,
    max_failures:
      typeof rawSettingsObject.max_failures === "number" ? rawSettingsObject.max_failures : 5,
    lockout_duration_minutes:
      typeof rawSettingsObject.lockout_duration_minutes === "number"
        ? rawSettingsObject.lockout_duration_minutes
        : 15,
  };
}

export async function initOtp(context: Context, cohort: "user" | "admin", subjectId: string) {
  if (!context.services.kek?.isAvailable()) throw new ValidationError("KEK unavailable");
  const settings = await getOtpSettings(context);
  const existing = await context.db.query.otpConfigs.findFirst({
    where: and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)),
  });

  let secretB32: string;
  if (existing && !existing.verified && existing.secretEnc) {
    secretB32 = (await context.services.kek.decrypt(existing.secretEnc as Buffer)).toString(
      "utf-8"
    );
  } else {
    secretB32 = generateTotpSecretBase32(20);
    const encryptedSecret = await context.services.kek.encrypt(Buffer.from(secretB32, "utf-8"));
    if (existing) {
      await context.db
        .update(otpConfigs)
        .set({
          secretEnc: encryptedSecret,
          verified: false,
          updatedAt: new Date(),
          lastUsedAt: null,
          lastUsedStep: null,
          failureCount: 0,
          lockedUntil: null,
        })
        .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
      await context.db
        .delete(otpBackupCodes)
        .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
    } else {
      await context.db
        .insert(otpConfigs)
        .values({ cohort, subjectId, secretEnc: encryptedSecret, verified: false });
    }
  }

  let account = subjectId;
  if (cohort === "user") {
    const user = await context.db.query.users.findFirst({ where: eq(users.sub, subjectId) });
    account = user?.email || subjectId;
  }
  const uri = provisioningUri(settings.issuer, account, secretB32, {
    algorithm: settings.algorithm,
    digits: settings.digits,
    period: settings.period,
  });
  return { secret: secretB32, provisioningUri: uri };
}

export async function verifyOtpSetup(
  context: Context,
  cohort: "user" | "admin",
  subjectId: string,
  code: string
) {
  const otpConfig = await context.db.query.otpConfigs.findFirst({
    where: and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)),
  });
  if (!otpConfig) throw new ValidationError("OTP not initialized");
  if (!context.services.kek?.isAvailable()) throw new ValidationError("KEK unavailable");
  const settings = await getOtpSettings(context);
  if (!otpConfig.secretEnc) throw new ValidationError("OTP not initialized");
  const secretB32 = (await context.services.kek.decrypt(otpConfig.secretEnc as Buffer)).toString(
    "utf-8"
  );
  const algorithm =
    settings.algorithm === "SHA1" ? "sha1" : settings.algorithm === "SHA256" ? "sha256" : "sha512";
  const verificationResult = verifyTotp(code, secretB32, {
    period: settings.period,
    window: settings.window,
    digits: settings.digits,
    algorithm,
    lastUsedStep: null,
  });
  if (!verificationResult.valid) throw new ValidationError("Invalid OTP code");
  await context.db
    .update(otpConfigs)
    .set({
      verified: true,
      failureCount: 0,
      lockedUntil: null,
      lastUsedAt: new Date(),
      lastUsedStep: BigInt(verificationResult.timestep || 0),
      updatedAt: new Date(),
    })
    .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
  const backupCodes: string[] = [];
  for (let i = 0; i < settings.backup_codes_count; i++) {
    const randomValue = randomBytes(8);
    const formattedCode = randomValue
      .toString("hex")
      .toUpperCase()
      .slice(0, 12)
      .replace(/(.{4})/g, "$1-")
      .slice(0, 14);
    backupCodes.push(formattedCode);
  }
  for (const codeValue of backupCodes) {
    const codeHash = await hash(codeValue);
    await context.db.insert(otpBackupCodes).values({ cohort, subjectId, codeHash });
  }
  return { backupCodes };
}

export async function verifyOtpCode(
  context: Context,
  cohort: "user" | "admin",
  subjectId: string,
  code: string
) {
  const otpConfig = await context.db.query.otpConfigs.findFirst({
    where: and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)),
  });
  if (!otpConfig) throw new ValidationError("OTP not configured");
  if (otpConfig.lockedUntil && otpConfig.lockedUntil > new Date()) {
    throw new ValidationError("Locked out");
  }
  const settings = await getOtpSettings(context);
  if (/^[A-Z0-9-]{14}$/.test(code)) {
    const backupCodes = await context.db
      .select({ id: otpBackupCodes.id, codeHash: otpBackupCodes.codeHash })
      .from(otpBackupCodes)
      .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
    for (const backupCode of backupCodes) {
      const isMatch = await argonVerify(backupCode.codeHash, code).catch(() => false);
      if (isMatch) {
        await context.db
          .update(otpConfigs)
          .set({
            failureCount: 0,
            lockedUntil: null,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
        await context.db
          .update(otpBackupCodes)
          .set({ usedAt: new Date() })
          .where(eq(otpBackupCodes.id, backupCode.id));
        return { success: true };
      }
    }
  } else {
    if (!context.services.kek?.isAvailable()) throw new ValidationError("KEK unavailable");
    if (!otpConfig.secretEnc) throw new ValidationError("OTP not configured");
    const secretB32 = (await context.services.kek.decrypt(otpConfig.secretEnc as Buffer)).toString(
      "utf-8"
    );
    const algorithm =
      settings.algorithm === "SHA1"
        ? "sha1"
        : settings.algorithm === "SHA256"
          ? "sha256"
          : "sha512";
    const verificationResult = verifyTotp(code, secretB32, {
      period: settings.period,
      window: settings.window,
      digits: settings.digits,
      algorithm,
      lastUsedStep: otpConfig.lastUsedStep ? Number(otpConfig.lastUsedStep) : null,
    });
    if (verificationResult.valid) {
      await context.db
        .update(otpConfigs)
        .set({
          failureCount: 0,
          lockedUntil: null,
          lastUsedAt: new Date(),
          lastUsedStep: BigInt(verificationResult.timestep || 0),
          updatedAt: new Date(),
        })
        .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
      return { success: true };
    }
  }
  const failures = (otpConfig.failureCount || 0) + 1;
  const lockoutDate =
    failures >= settings.max_failures
      ? new Date(Date.now() + settings.lockout_duration_minutes * 60 * 1000)
      : null;
  await context.db
    .update(otpConfigs)
    .set({ failureCount: failures, lockedUntil: lockoutDate, updatedAt: new Date() })
    .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
  throw new ValidationError("Invalid OTP code");
}

export async function getOtpStatusModel(
  context: Context,
  cohort: "user" | "admin",
  subjectId: string
) {
  const otpConfig = await context.db.query.otpConfigs.findFirst({
    where: and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)),
  });
  if (!otpConfig)
    return { enabled: false, pending: false, verified: false, backupCodesRemaining: 0 };
  const isVerified = !!otpConfig.verified;
  const backupCodes = await context.db
    .select({ id: otpBackupCodes.id, usedAt: otpBackupCodes.usedAt })
    .from(otpBackupCodes)
    .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
  const remaining = backupCodes.filter((codeEntry) => !codeEntry.usedAt).length;
  return {
    enabled: isVerified,
    pending: !isVerified,
    verified: isVerified,
    createdAt: otpConfig.createdAt,
    lastUsedAt: otpConfig.lastUsedAt,
    backupCodesRemaining: remaining,
  };
}

export async function disableOtp(context: Context, cohort: "user" | "admin", subjectId: string) {
  await context.db
    .delete(otpConfigs)
    .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
  await context.db
    .delete(otpBackupCodes)
    .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
}

export async function regenerateBackupCodes(
  context: Context,
  cohort: "user" | "admin",
  subjectId: string
) {
  const settings = await getOtpSettings(context);
  await context.db
    .delete(otpBackupCodes)
    .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
  const backupCodes: string[] = [];
  for (let i = 0; i < settings.backup_codes_count; i++) {
    const randomValue = randomBytes(8);
    const formattedCode = randomValue
      .toString("hex")
      .toUpperCase()
      .slice(0, 12)
      .replace(/(.{4})/g, "$1-")
      .slice(0, 14);
    backupCodes.push(formattedCode);
  }
  for (const codeValue of backupCodes) {
    const codeHash = await hash(codeValue);
    await context.db.insert(otpBackupCodes).values({ cohort, subjectId, codeHash });
  }
  return { backupCodes };
}
