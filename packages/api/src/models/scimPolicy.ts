import { eq } from "drizzle-orm";
import { scimUsers } from "../db/schema.ts";
import { ForbiddenError, UnauthorizedError } from "../errors.ts";
import { getSetting } from "../services/settings.ts";
import type { Context } from "../types.ts";
import type { KeyEnvelopeType } from "./keybag.ts";

export async function getScimUserPolicyState(context: Context, sub: string) {
  const row = await context.db.query.scimUsers.findFirst({
    where: eq(scimUsers.userSub, sub),
  });
  return {
    provisioned: !!row,
    active: row?.active === true,
  };
}

export async function assertScimSignInPolicy(context: Context, sub: string) {
  const state = await getScimUserPolicyState(context, sub);
  if (state.provisioned && !state.active) throw new UnauthorizedError("User is deprovisioned");
  if (
    (await getBooleanSetting(context, "users.scim.only_provisioned_sign_in", false)) &&
    !state.provisioned
  ) {
    throw new UnauthorizedError("User is not SCIM provisioned");
  }
}

export async function assertScimEnvelopePolicy(
  context: Context,
  sub: string,
  type: KeyEnvelopeType
) {
  const state = await getScimUserPolicyState(context, sub);
  if (!state.provisioned) return;
  if (
    type === "password" &&
    !(await getBooleanSetting(context, "users.scim.allow_password_envelopes", true))
  ) {
    throw new ForbiddenError("Password key envelopes are disabled by SCIM policy");
  }
  if (
    type === "passkey_prf" &&
    !(await getBooleanSetting(context, "users.scim.allow_passkey_prf_envelopes", true))
  ) {
    throw new ForbiddenError("Passkey PRF key envelopes are disabled by SCIM policy");
  }
  if (
    type === "trusted_device" &&
    !(await getBooleanSetting(context, "users.scim.allow_trusted_device_approval", true))
  ) {
    throw new ForbiddenError("Trusted-device key envelopes are disabled by SCIM policy");
  }
}

export async function assertScimTrustedDeviceApprovalPolicy(context: Context, sub: string) {
  const state = await getScimUserPolicyState(context, sub);
  if (!state.provisioned) return;
  if (!(await getBooleanSetting(context, "users.scim.allow_trusted_device_approval", true))) {
    throw new ForbiddenError("Trusted-device approval is disabled by SCIM policy");
  }
}

export async function isScimPasswordUnlockAllowed(context: Context, sub: string) {
  const state = await getScimUserPolicyState(context, sub);
  if (!state.provisioned) return true;
  return await getBooleanSetting(context, "users.scim.allow_password_envelopes", true);
}

export async function isZkKeyUnlockRequired(context: Context, sub: string) {
  const state = await getScimUserPolicyState(context, sub);
  if (!state.provisioned) return true;
  return await getBooleanSetting(context, "users.scim.require_key_unlock_for_zk", true);
}

export async function getBooleanSetting(context: Context, key: string, fallback: boolean) {
  const value = await getSetting(withServices(context), key);
  return typeof value === "boolean" ? value : fallback;
}

export async function getStringSetting(context: Context, key: string, fallback: string) {
  const value = await getSetting(withServices(context), key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function withServices(context: Context) {
  if (context.services) return context;
  return { ...context, services: {} } as Context;
}
