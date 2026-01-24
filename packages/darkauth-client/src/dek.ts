import type { JWK } from "jose";
import { compactDecrypt, importJWK } from "jose";
import { deriveDek, unwrapPrivateKey } from "./crypto.js";
import { getHooks } from "./hooks.js";

let cachedPrivKey: CryptoKey | null = null;
let cachedPrivKeyPromise: Promise<CryptoKey> | null = null;

async function getUserEncPrivateKey(drk: Uint8Array): Promise<CryptoKey> {
  if (cachedPrivKey) return cachedPrivKey;
  if (cachedPrivKeyPromise) return cachedPrivKeyPromise;
  const hooks = getHooks();
  if (!hooks.fetchWrappedEncPrivateJwk) throw new Error("fetchWrappedEncPrivateJwk hook not set");
  cachedPrivKeyPromise = (async () => {
    const fetchWrapped = hooks.fetchWrappedEncPrivateJwk;
    if (!fetchWrapped) throw new Error("fetchWrappedEncPrivateJwk hook not set");
    const wrapped = await fetchWrapped();
    const jwk = await unwrapPrivateKey(wrapped, drk);
    const key = await importJWK(jwk as JWK, "ECDH-ES");
    cachedPrivKey = key as CryptoKey;
    return cachedPrivKey;
  })();
  return cachedPrivKeyPromise;
}

export async function resolveDek(
  noteId: string,
  isOwner: boolean,
  drk: Uint8Array
): Promise<Uint8Array> {
  if (isOwner) return deriveDek(drk, noteId);
  const hooks = getHooks();
  if (!hooks.fetchNoteDek) throw new Error("fetchNoteDek hook not set");
  const jwe = await hooks.fetchNoteDek(noteId);
  const priv = await getUserEncPrivateKey(drk);
  const { plaintext } = await compactDecrypt(jwe, priv);
  return new Uint8Array(plaintext);
}

export function clearKeyCache() {
  cachedPrivKey = null;
  cachedPrivKeyPromise = null;
}
