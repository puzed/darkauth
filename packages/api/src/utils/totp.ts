import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str: string): Buffer {
  const clean = str.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charAt(i);
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function toUint64Buffer(num: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(num);
  return b;
}

export function generateTotpSecretBytes(size = 20): Buffer {
  return randomBytes(size);
}

export function generateTotpSecretBase32(size = 20): string {
  return base32Encode(generateTotpSecretBytes(size));
}

export function totp(
  secret: Buffer,
  timeSec: number,
  period = 30,
  digits = 6,
  algorithm: "sha1" | "sha256" | "sha512" = "sha1"
): { code: string; step: number } {
  const step = Math.floor(timeSec / period);
  const msg = toUint64Buffer(BigInt(step));
  const h = createHmac(algorithm, secret).update(msg).digest();
  const last = h.at(-1) ?? 0;
  const offset = last & 15;
  const b0 = h[offset] ?? 0;
  const b1 = h[offset + 1] ?? 0;
  const b2 = h[offset + 2] ?? 0;
  const b3 = h[offset + 3] ?? 0;
  const bin = ((b0 & 0x7f) << 24) | ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff);
  const mod = 10 ** digits;
  const val = (bin % mod).toString().padStart(digits, "0");
  return { code: val, step };
}

export function verifyTotp(
  input: string,
  secretBase32: string,
  options: {
    period?: number;
    window?: number;
    digits?: number;
    algorithm?: "sha1" | "sha256" | "sha512";
    lastUsedStep?: number | null;
  } = {}
): { valid: boolean; timestep?: number } {
  const period = options.period ?? 30;
  const window = options.window ?? 1;
  const digits = options.digits ?? 6;
  const algorithm = options.algorithm ?? "sha1";
  const secret = base32Decode(secretBase32);
  const now = Math.floor(Date.now() / 1000);
  const cur = Math.floor(now / period);
  for (let i = -window; i <= window; i++) {
    const t = cur + i;
    if (options.lastUsedStep != null && t <= options.lastUsedStep) continue;
    const { code } = totp(secret, t * period, period, digits, algorithm);
    if (code === input) return { valid: true, timestep: t };
  }
  return { valid: false };
}

export function provisioningUri(
  issuer: string,
  accountName: string,
  secretBase32: string,
  params?: { algorithm?: string; digits?: number; period?: number }
): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const alg = params?.algorithm || "SHA1";
  const digits = params?.digits || 6;
  const period = params?.period || 30;
  const qp = `secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=${encodeURIComponent(alg)}&digits=${digits}&period=${period}`;
  return `otpauth://totp/${label}?${qp}`;
}

export const base32 = { encode: base32Encode, decode: base32Decode };
