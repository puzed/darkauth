import { unlockArkWithExportKey } from "../components/KeyUnlockPanel";
import apiService from "./api";
import cryptoService, { toBase64Url } from "./crypto";
import { logger } from "./logger";
import { saveUnlockedArk } from "./unlockedArk";

let pending: { sub: string; exportKey: Uint8Array } | null = null;

export function holdPendingUnlock(sub: string, exportKey: Uint8Array): void {
  pending = { sub, exportKey: new Uint8Array(exportKey) };
}

export async function completePendingUnlock(): Promise<void> {
  const current = pending;
  pending = null;
  if (!current) return;
  let ark: Uint8Array | null = null;
  try {
    ark = await unlockOrCreatePasswordArk(current.sub, current.exportKey);
    await saveUnlockedArk(current.sub, ark);
  } catch (error) {
    logger.warn(error, "Pending unlock after OTP failed");
  } finally {
    cryptoService.clearSensitiveData(current.exportKey, ...(ark ? [ark] : []));
  }
}

async function accountHasNoKeyYet(): Promise<boolean> {
  try {
    await apiService.getWrappedDrk();
    return false;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return true;
    throw error;
  }
}

export async function unlockOrCreatePasswordArk(sub: string, exportKey: Uint8Array) {
  if (!(await accountHasNoKeyYet())) return unlockArkWithExportKey(sub, exportKey);
  const keys = await cryptoService.deriveKeysFromExportKey(exportKey, sub);
  const drk = await cryptoService.generateDRK();
  try {
    const wrappedDrk = await cryptoService.wrapDRK(drk, keys.wrapKey, sub);
    await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
    const accountKey = await apiService.createAccountKey({ version: "v2" });
    const wrappingAlg = "OPAQUE-HKDF-SHA256+A256GCM/v2";
    const envelopeId = `env_${crypto.randomUUID()}`;
    const aad = cryptoService.envelopeAad({
      sub,
      keyId: accountKey.key_id,
      envelopeId,
      type: "password",
      wrappingAlg,
    });
    const wrappedEnvelopeDrk = await cryptoService.wrapKeyMaterial(drk, keys.wrapKey, aad);
    await apiService.createKeyEnvelope({
      envelopeId,
      keyId: accountKey.key_id,
      type: "password",
      label: "Password",
      wrappingAlg,
      wrappedKey: toBase64Url(wrappedEnvelopeDrk),
      aad: toBase64Url(aad),
      metadata: { version: "v2" },
    });
    return drk;
  } catch (error) {
    cryptoService.clearSensitiveData(drk);
    throw error;
  } finally {
    cryptoService.clearSensitiveData(keys.masterKey, keys.wrapKey, keys.deriveKey);
  }
}
