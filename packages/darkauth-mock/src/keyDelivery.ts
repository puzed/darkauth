import { createHash, hkdfSync, randomBytes } from "node:crypto";
import { CompactEncrypt, importJWK } from "jose";

export type ClientKeyContext = {
  ark: Uint8Array;
  sub: string;
  keyId: string;
  clientId: string;
  organizationId?: string;
  state: string;
  redirectUri: string;
};

const KEY_JWE_TTL_SECONDS = 120;

export function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function deriveMockArk(seed: string, sub: string) {
  return new Uint8Array(hkdfSync("sha256", seed, "DarkAuth-Mock|ark", `sub=${sub}`, 32));
}

export function deriveClientAppKey(
  ark: Uint8Array,
  context: { sub: string; keyId: string; clientId: string; organizationId?: string },
) {
  const salt = createHash("sha256").update(`DarkAuth|v2|client-key|sub=${context.sub}|key_id=${context.keyId}`).digest();
  const info = `client_id=${context.clientId}|org_id=${context.organizationId ?? ""}|aud=${context.clientId}`;
  return new Uint8Array(hkdfSync("sha256", ark, salt, info, 32));
}

export async function createClientKeyJwe(zkPub: string, context: ClientKeyContext) {
  const recipient = parseZkPub(zkPub);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    typ: "DarkAuth-Client-Key",
    version: "v2",
    sub: context.sub,
    client_id: context.clientId,
    aud: context.clientId,
    ...(context.organizationId ? { org_id: context.organizationId } : {}),
    request_id: randomBytes(24).toString("base64url"),
    state_hash: sha256Base64Url(context.state),
    redirect_uri_hash: sha256Base64Url(context.redirectUri),
    key_id: context.keyId,
    key_kind: "client_app_key",
    cak: Buffer.from(deriveClientAppKey(context.ark, context)).toString("base64url"),
    iat: now,
    exp: now + KEY_JWE_TTL_SECONDS,
  };
  const jwe = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "ECDH-ES", enc: "A256GCM" })
    .encrypt(await importJWK(recipient, "ECDH-ES"));
  return { jwe, keyHash: sha256Base64Url(jwe) };
}

function parseZkPub(zkPub: string) {
  const jwk = JSON.parse(Buffer.from(zkPub, "base64url").toString("utf8")) as Record<string, unknown>;
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.x !== "string" || typeof jwk.y !== "string" || "d" in jwk) {
    throw new Error("zk_pub must be a public P-256 JWK");
  }
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}
