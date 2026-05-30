export type UnlockMethod = "password" | "passkey" | "trusted_device" | "recovery" | "new_key";

export interface UnlockPolicy {
  managed: boolean;
  allowPasswordEnvelope: boolean;
  allowPasskeyPrfEnvelope: boolean;
  allowTrustedDeviceApproval: boolean;
  allowRecoveryKey: boolean;
  allowNewKeySetup: boolean;
  requireKeyUnlockForZk: boolean;
  reason?: string | null;
}

export const defaultUnlockPolicy: UnlockPolicy = {
  managed: false,
  allowPasswordEnvelope: true,
  allowPasskeyPrfEnvelope: true,
  allowTrustedDeviceApproval: true,
  allowRecoveryKey: true,
  allowNewKeySetup: true,
  requireKeyUnlockForZk: true,
  reason: null,
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function hasPolicyValue(data: Record<string, unknown>, key: string): boolean {
  return key in data;
}

function readPolicyValue(data: Record<string, unknown>, camel: string, snake: string): unknown {
  if (hasPolicyValue(data, camel)) return data[camel];
  if (hasPolicyValue(data, snake)) return data[snake];
  return undefined;
}

export function normalizeUnlockPolicy(input: unknown): UnlockPolicy {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const data =
    source.policy && typeof source.policy === "object"
      ? (source.policy as Record<string, unknown>)
      : source.unlock_policy && typeof source.unlock_policy === "object"
        ? (source.unlock_policy as Record<string, unknown>)
        : source;
  const allowPasswordEnvelope = readBoolean(
    readPolicyValue(data, "allowPasswordEnvelope", "allow_password_envelopes"),
    defaultUnlockPolicy.allowPasswordEnvelope
  );
  const allowPasskeyPrfEnvelope = readBoolean(
    readPolicyValue(data, "allowPasskeyPrfEnvelope", "allow_passkey_prf_envelopes"),
    defaultUnlockPolicy.allowPasskeyPrfEnvelope
  );
  const allowTrustedDeviceApproval = readBoolean(
    readPolicyValue(data, "allowTrustedDeviceApproval", "allow_trusted_device_approval"),
    defaultUnlockPolicy.allowTrustedDeviceApproval
  );
  return {
    managed: readBoolean(readPolicyValue(data, "managed", "managed"), defaultUnlockPolicy.managed),
    allowPasswordEnvelope,
    allowPasskeyPrfEnvelope,
    allowTrustedDeviceApproval,
    allowRecoveryKey: readBoolean(
      readPolicyValue(data, "allowRecoveryKey", "allow_recovery_key"),
      defaultUnlockPolicy.allowRecoveryKey
    ),
    allowNewKeySetup: readBoolean(
      readPolicyValue(data, "allowNewKeySetup", "allow_new_key_setup"),
      defaultUnlockPolicy.allowNewKeySetup && allowPasswordEnvelope
    ),
    requireKeyUnlockForZk: readBoolean(
      readPolicyValue(data, "requireKeyUnlockForZk", "require_key_unlock_for_zk"),
      defaultUnlockPolicy.requireKeyUnlockForZk
    ),
    reason:
      typeof data.reason === "string"
        ? data.reason
        : typeof data.source === "string"
          ? data.source
          : null,
  };
}

export function isUnlockMethodAllowed(policy: UnlockPolicy, method: UnlockMethod): boolean {
  if (method === "password") return policy.allowPasswordEnvelope;
  if (method === "passkey") return policy.allowPasskeyPrfEnvelope;
  if (method === "trusted_device") return policy.allowTrustedDeviceApproval;
  if (method === "recovery") return policy.allowRecoveryKey;
  if (method === "new_key") return policy.allowNewKeySetup && policy.allowPasswordEnvelope;
  return false;
}
