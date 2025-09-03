import { randomBytes } from "node:crypto";
import { hash } from "argon2";
import type { KdfParams } from "../types.js";
import { decryptAesGcm, encryptAesGcm } from "../utils/crypto.js";

export async function createKekService(passphrase: string, params: KdfParams) {
  const kek = await deriveKek(passphrase, params);

  return {
    async encrypt(data: Buffer): Promise<Buffer> {
      const { ciphertext, iv, tag } = encryptAesGcm(data, kek);
      return Buffer.concat([iv, tag, ciphertext]);
    },

    async decrypt(encryptedData: Buffer): Promise<Buffer> {
      if (encryptedData.length < 28) {
        throw new Error("Invalid encrypted data format");
      }

      const iv = encryptedData.subarray(0, 12);
      const tag = encryptedData.subarray(12, 28);
      const ciphertext = encryptedData.subarray(28);

      return decryptAesGcm(ciphertext, kek, iv, tag);
    },

    isAvailable(): boolean {
      return true;
    },
  };
}

async function deriveKek(passphrase: string, params: KdfParams): Promise<Buffer> {
  const derivedKey = await hash(passphrase, {
    type: 2,
    salt: Buffer.from(params.salt, "base64"),
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
    hashLength: params.hashLength,
    raw: true,
  });

  return Buffer.from(derivedKey);
}

export function generateKdfParams(): KdfParams {
  return {
    salt: randomBytes(32).toString("base64"),
    memoryCost: 131072,
    timeCost: 4,
    parallelism: 4,
    hashLength: 32,
  };
}
