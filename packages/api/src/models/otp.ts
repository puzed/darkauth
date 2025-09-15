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
  const raw = await getSetting(context, "otp");
  const s = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
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
  const sr = s as RawSettings;
  const algoStr = typeof sr.algorithm === "string" ? sr.algorithm : "SHA1";
  const algorithm: OtpSettings["algorithm"] =
    algoStr === "SHA256" ? "SHA256" : algoStr === "SHA512" ? "SHA512" : "SHA1";
  return {
    enabled: typeof sr.enabled === "boolean" ? sr.enabled : true,
    issuer: typeof sr.issuer === "string" ? sr.issuer : "DarkAuth",
    algorithm,
    digits: typeof sr.digits === "number" ? sr.digits : 6,
    period: typeof sr.period === "number" ? sr.period : 30,
    window: typeof sr.window === "number" ? sr.window : 1,
    backup_codes_count: typeof sr.backup_codes_count === "number" ? sr.backup_codes_count : 8,
    max_failures: typeof sr.max_failures === "number" ? sr.max_failures : 5,
    lockout_duration_minutes:
      typeof sr.lockout_duration_minutes === "number" ? sr.lockout_duration_minutes : 15,
  };
}

export async function initOtp(context: Context, cohort: "user" | "admin", subjectId: string) {
  if (!context.services.kek?.isAvailable()) throw new ValidationError("KEK unavailable");
  const s = await getOtpSettings(context);
  const secretB32 = generateTotpSecretBase32(20);
  const enc = await context.services.kek.encrypt(Buffer.from(secretB32, "utf-8"));
  await context.db
    .insert(otpConfigs)
    .values({ cohort, subjectId, secretEnc: enc, verified: false })
    .onConflictDoUpdate({
      target: [otpConfigs.cohort, otpConfigs.subjectId],
      set: { secretEnc: enc, updatedAt: new Date(), verified: false },
    });
  let account = subjectId;
  if (cohort === "user") {
    const user = await context.db.query.users.findFirst({ where: eq(users.sub, subjectId) });
    account = user?.email || subjectId;
  }
  const uri = provisioningUri(s.issuer, account, secretB32, {
    algorithm: s.algorithm,
    digits: s.digits,
    period: s.period,
  });
  return { secret: secretB32, provisioningUri: uri };
}

export async function verifyOtpSetup(
  context: Context,
  cohort: "user" | "admin",
  subjectId: string,
  code: string
) {
  const cfg = await context.db.query.otpConfigs.findFirst({
    where: and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)),
  });
  if (!cfg) throw new ValidationError("OTP not initialized");
  if (!context.services.kek?.isAvailable()) throw new ValidationError("KEK unavailable");
  const s = await getOtpSettings(context);
  if (!cfg.secretEnc) throw new ValidationError("OTP not initialized");
  const secretB32 = (await context.services.kek.decrypt(cfg.secretEnc as Buffer)).toString("utf-8");
  const algorithm =
    s.algorithm === "SHA1" ? "sha1" : s.algorithm === "SHA256" ? "sha256" : "sha512";
  const res = verifyTotp(code, secretB32, {
    period: s.period,
    window: s.window,
    digits: s.digits,
    algorithm,
    lastUsedStep: null,
  });
  if (!res.valid) throw new ValidationError("Invalid OTP code");
  await context.db
    .update(otpConfigs)
    .set({
      verified: true,
      failureCount: 0,
      lockedUntil: null,
      lastUsedAt: new Date(),
      lastUsedStep: BigInt(res.timestep || 0),
      updatedAt: new Date(),
    })
    .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
  const codes: string[] = [];
  for (let i = 0; i < s.backup_codes_count; i++) {
    const raw = randomBytes(8);
    const str = raw
      .toString("hex")
      .toUpperCase()
      .slice(0, 12)
      .replace(/(.{4})/g, "$1-")
      .slice(0, 14);
    codes.push(str);
  }
  for (const c of codes) {
    const h = await hash(c);
    await context.db.insert(otpBackupCodes).values({ cohort, subjectId, codeHash: h });
  }
  return { backupCodes: codes };
}

export async function verifyOtpCode(
  context: Context,
  cohort: "user" | "admin",
  subjectId: string,
  code: string
) {
  const cfg = await context.db.query.otpConfigs.findFirst({
    where: and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)),
  });
  if (!cfg) throw new ValidationError("OTP not configured");
  if (cfg.lockedUntil && cfg.lockedUntil > new Date()) throw new ValidationError("Locked out");
  const s = await getOtpSettings(context);
  if (/^[A-Z0-9-]{14}$/.test(code)) {
    const codes = await context.db
      .select({ id: otpBackupCodes.id, codeHash: otpBackupCodes.codeHash })
      .from(otpBackupCodes)
      .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
    for (const bc of codes) {
      const ok = await argonVerify(bc.codeHash, code).catch(() => false);
      if (ok) {
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
          .where(eq(otpBackupCodes.id, bc.id));
        return { success: true };
      }
    }
  } else {
    if (!context.services.kek?.isAvailable()) throw new ValidationError("KEK unavailable");
    if (!cfg.secretEnc) throw new ValidationError("OTP not configured");
    const secretB32 = (await context.services.kek.decrypt(cfg.secretEnc as Buffer)).toString(
      "utf-8"
    );
    const algorithm =
      s.algorithm === "SHA1" ? "sha1" : s.algorithm === "SHA256" ? "sha256" : "sha512";
    const res = verifyTotp(code, secretB32, {
      period: s.period,
      window: s.window,
      digits: s.digits,
      algorithm,
      lastUsedStep: cfg.lastUsedStep ? Number(cfg.lastUsedStep) : null,
    });
    if (res.valid) {
      await context.db
        .update(otpConfigs)
        .set({
          failureCount: 0,
          lockedUntil: null,
          lastUsedAt: new Date(),
          lastUsedStep: BigInt(res.timestep || 0),
          updatedAt: new Date(),
        })
        .where(and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)));
      return { success: true };
    }
  }
  const failures = (cfg.failureCount || 0) + 1;
  const lockoutDate =
    failures >= s.max_failures
      ? new Date(Date.now() + s.lockout_duration_minutes * 60 * 1000)
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
  const cfg = await context.db.query.otpConfigs.findFirst({
    where: and(eq(otpConfigs.cohort, cohort), eq(otpConfigs.subjectId, subjectId)),
  });
  if (!cfg) return { enabled: false, verified: false, backupCodesRemaining: 0 };
  const codes = await context.db
    .select({ id: otpBackupCodes.id, usedAt: otpBackupCodes.usedAt })
    .from(otpBackupCodes)
    .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
  const remaining = codes.filter((c) => !c.usedAt).length;
  return {
    enabled: true,
    verified: !!cfg.verified,
    createdAt: cfg.createdAt,
    lastUsedAt: cfg.lastUsedAt,
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
  const s = await getOtpSettings(context);
  await context.db
    .delete(otpBackupCodes)
    .where(and(eq(otpBackupCodes.cohort, cohort), eq(otpBackupCodes.subjectId, subjectId)));
  const codes: string[] = [];
  for (let i = 0; i < s.backup_codes_count; i++) {
    const raw = randomBytes(8);
    const str = raw
      .toString("hex")
      .toUpperCase()
      .slice(0, 12)
      .replace(/(.{4})/g, "$1-")
      .slice(0, 14);
    codes.push(str);
  }
  for (const c of codes) {
    const h = await hash(c);
    await context.db.insert(otpBackupCodes).values({ cohort, subjectId, codeHash: h });
  }
  return { backupCodes: codes };
}
