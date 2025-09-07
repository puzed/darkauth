import { compactDecrypt } from "jose";

export * from "./crypto";
export * from "./dek";
export { setHooks } from "./hooks";

type Config = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  zk?: boolean;
};

export interface AuthSession {
  idToken: string;
  drk: Uint8Array;
  refreshToken?: string;
}

export interface JwtClaims {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
  iat?: number;
  iss?: string;
}

type ViteLikeEnv = Record<string, string | undefined>;
type ImportMetaEnvLike = { env?: ViteLikeEnv };

function viteEnvGet(key: string): string | undefined {
  try {
    const im = (import.meta as unknown as ImportMetaEnvLike) || undefined;
    return im?.env?.[key];
  } catch {
    return undefined;
  }
}

type AppConfig = { issuer?: string; clientId?: string; redirectUri?: string };
type AppConfigWindow = Window & { __APP_CONFIG__?: AppConfig };

let cfg: Config = {
  issuer:
    (typeof window !== "undefined" && (window as AppConfigWindow).__APP_CONFIG__?.issuer) ||
    viteEnvGet("VITE_DARKAUTH_ISSUER") ||
    (typeof process !== "undefined" ? process.env.DARKAUTH_ISSUER : undefined) ||
    "http://localhost:9080",
  clientId:
    (typeof window !== "undefined" && (window as AppConfigWindow).__APP_CONFIG__?.clientId) ||
    viteEnvGet("VITE_CLIENT_ID") ||
    (typeof process !== "undefined" ? process.env.DARKAUTH_CLIENT_ID : undefined) ||
    "app-web",
  redirectUri:
    (typeof window !== "undefined" && (window as AppConfigWindow).__APP_CONFIG__?.redirectUri) ||
    viteEnvGet("VITE_REDIRECT_URI") ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/callback`
      : "http://localhost:5173/callback"),
  zk: true,
};

const OBFUSCATION_KEY = "DarkAuth-Storage-Protection-2025";

export function setConfig(next: Partial<Config>) {
  cfg = { ...cfg, ...next } as Config;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 2 ? "==" : base64.length % 4 === 3 ? "=" : "";
  return Uint8Array.from(atob(base64 + padding), (c) => c.charCodeAt(0));
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(d);
}

function parseFragmentParams(hash: string): Record<string, string> {
  const res: Record<string, string> = {};
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of h.split("&")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = decodeURIComponent(part.slice(0, i));
    const v = decodeURIComponent(part.slice(i + 1));
    res[k] = v;
  }
  return res;
}

function obfuscateKey(drk: Uint8Array): Uint8Array {
  const obfKey = new TextEncoder().encode(OBFUSCATION_KEY);
  const out = new Uint8Array(drk.length);
  for (let i = 0; i < drk.length; i++) {
    const a = drk[i] ?? 0;
    const b = obfKey[i % obfKey.length] ?? 0;
    out[i] = a ^ b;
  }
  return out;
}

function deobfuscateKey(obfuscated: Uint8Array): Uint8Array {
  return obfuscateKey(obfuscated);
}

export function parseJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const mid = parts[1] as string;
    const payload = JSON.parse(atob(mid.replace(/-/g, "+").replace(/_/g, "/")));
    return payload as JwtClaims;
  } catch {
    return null;
  }
}

export function isTokenValid(token: string): boolean {
  const claims = parseJwt(token);
  if (!claims?.exp) return false;
  return claims.exp * 1000 > Date.now() + 5000;
}

export async function initiateLogin(): Promise<void> {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  sessionStorage.setItem("zk_eph_priv_jwk", JSON.stringify(privateJwk));
  const zkPubParam = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(publicJwk)));
  const state = crypto.randomUUID();
  const verifier = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem("pkce_verifier", verifier);
  const challenge = bytesToBase64Url(await sha256(new TextEncoder().encode(verifier)));
  const authUrl = new URL("/authorize", cfg.issuer);
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", cfg.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (cfg.zk !== false) authUrl.searchParams.set("zk_pub", zkPubParam);
  location.assign(authUrl.toString());
}

export async function handleCallback(): Promise<AuthSession | null> {
  if (!location.search.includes("code=")) return null;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return null;
  const tokenUrl = new URL("/token", cfg.issuer);
  const verifier = sessionStorage.getItem("pkce_verifier") || "";
  const response = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    throw new Error("Token exchange failed");
  }
  const tokenResponse = await response.json();
  const fragmentParams = parseFragmentParams(location.hash || "");
  const drkJwe: string | undefined = fragmentParams.drk_jwe;
  if (!drkJwe || typeof drkJwe !== "string") throw new Error("Missing DRK JWE from URL fragment");
  if (tokenResponse.zk_drk_hash) {
    const hash = bytesToBase64Url(await sha256(new TextEncoder().encode(drkJwe)));
    if (tokenResponse.zk_drk_hash !== hash) throw new Error("DRK hash mismatch");
  }
  const privateJwkString = sessionStorage.getItem("zk_eph_priv_jwk");
  if (!privateJwkString) return null;
  sessionStorage.removeItem("zk_eph_priv_jwk");
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(privateJwkString),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits", "deriveKey"]
  );
  const { plaintext } = await compactDecrypt(drkJwe, privateKey);
  const drk = new Uint8Array(plaintext);
  const idToken = tokenResponse.id_token as string;
  const refreshToken = tokenResponse.refresh_token as string | undefined;
  try {
    history.replaceState(null, "", location.origin + location.pathname);
  } catch {}
  sessionStorage.setItem("id_token", idToken);
  const obfuscatedDrk = obfuscateKey(drk);
  localStorage.setItem("drk_protected", bytesToBase64Url(obfuscatedDrk));
  if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
  return { idToken, drk, refreshToken };
}

export function getStoredSession(): AuthSession | null {
  const idToken = sessionStorage.getItem("id_token");
  const obfuscatedDrkBase64 = localStorage.getItem("drk_protected");
  if (!idToken || !obfuscatedDrkBase64) return null;
  if (!isTokenValid(idToken)) return null;
  try {
    const obfuscatedDrk = base64UrlToBytes(obfuscatedDrkBase64);
    const drk = deobfuscateKey(obfuscatedDrk);
    return { idToken, drk };
  } catch {
    localStorage.removeItem("drk_protected");
    return null;
  }
}

export async function refreshSession(): Promise<AuthSession | null> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;
  const tokenUrl = new URL("/token", cfg.issuer);
  const response = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.clientId,
    }),
  });
  if (!response.ok) {
    localStorage.removeItem("refresh_token");
    return null;
  }
  const tokenResponse = await response.json();
  const idToken = tokenResponse.id_token as string;
  const newRefreshToken = tokenResponse.refresh_token as string | undefined;
  sessionStorage.setItem("id_token", idToken);
  if (newRefreshToken) localStorage.setItem("refresh_token", newRefreshToken);
  const obfuscatedDrkBase64 = localStorage.getItem("drk_protected");
  if (!obfuscatedDrkBase64) return null;
  const obfuscatedDrk = base64UrlToBytes(obfuscatedDrkBase64);
  const drk = deobfuscateKey(obfuscatedDrk);
  return { idToken, drk, refreshToken: newRefreshToken || refreshToken };
}

export function logout(): void {
  sessionStorage.removeItem("id_token");
  localStorage.removeItem("drk_protected");
  sessionStorage.removeItem("zk_eph_priv_jwk");
  sessionStorage.removeItem("pkce_verifier");
  localStorage.removeItem("refresh_token");
}

export function getCurrentUser(): JwtClaims | null {
  const idToken = sessionStorage.getItem("id_token");
  if (!idToken) return null;
  return parseJwt(idToken);
}
