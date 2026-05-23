import { compactDecrypt } from "jose";

export * from "./crypto.js";
export * from "./dek.js";
export { setHooks } from "./hooks.js";

type Config = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  zk?: boolean;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  discovery?: boolean;
  firstParty?: boolean;
  tokenStorage?: "memory" | "localStorage";
  drkStorage?: "memory" | "localStorage";
  refreshMode?: "cookie" | "token";
  credentials?: RequestCredentials;
};

export interface AuthSession {
  idToken: string;
  accessToken?: string;
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
let callbackInFlight: Promise<AuthSession | null> | null = null;
let callbackInFlightCode: string | null = null;
let endpointsInFlight: Promise<ResolvedEndpoints> | null = null;
let endpointsCacheKey: string | null = null;

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
    "demo-public-client",
  redirectUri:
    (typeof window !== "undefined" && (window as AppConfigWindow).__APP_CONFIG__?.redirectUri) ||
    viteEnvGet("VITE_REDIRECT_URI") ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/callback`
      : "http://localhost:5173/callback"),
  zk: true,
};

const OBFUSCATION_KEY = "DarkAuth-Storage-Protection-2025";
const EMPTY_DRK = new Uint8Array(0);
const ID_TOKEN_KEY = "id_token";
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const DRK_STORAGE_KEY = "drk_protected";
const OAUTH_STATE_KEY = "oauth_state";

type ResolvedEndpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
};

let memorySession: AuthSession | null = null;
let memoryRefreshToken: string | null = null;

export function setConfig(next: Partial<Config>) {
  cfg = { ...cfg, ...next } as Config;
  endpointsInFlight = null;
  endpointsCacheKey = null;
}

function setStoredIdToken(token: string): void {
  localStorage.setItem(ID_TOKEN_KEY, token);
}

function getStoredIdToken(): string | null {
  return localStorage.getItem(ID_TOKEN_KEY);
}

function clearStoredIdToken(): void {
  localStorage.removeItem(ID_TOKEN_KEY);
}

function setStoredAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function clearStoredAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function tokenStorageMode(): "memory" | "localStorage" {
  return cfg.tokenStorage || (cfg.firstParty === false ? "localStorage" : "memory");
}

function drkStorageMode(): "memory" | "localStorage" {
  return cfg.drkStorage || (cfg.firstParty === false ? "localStorage" : "memory");
}

function refreshMode(): "cookie" | "token" {
  return cfg.refreshMode || (cfg.firstParty === false ? "token" : "cookie");
}

function fetchCredentials(): RequestCredentials {
  return cfg.credentials || "include";
}

function rootEndpoint(path: string): string {
  return new URL(path, cfg.issuer).toString();
}

async function resolveEndpoints(): Promise<ResolvedEndpoints> {
  const cacheKey = [
    cfg.issuer,
    cfg.scope || "",
    cfg.authorizationEndpoint || "",
    cfg.tokenEndpoint || "",
    cfg.discovery === false ? "0" : "1",
  ].join("|");
  if (endpointsInFlight && endpointsCacheKey === cacheKey) return endpointsInFlight;
  endpointsCacheKey = cacheKey;
  endpointsInFlight = (async () => {
    const fallback = {
      authorizationEndpoint: cfg.authorizationEndpoint || rootEndpoint("/authorize"),
      tokenEndpoint: cfg.tokenEndpoint || rootEndpoint("/token"),
    };
    if (cfg.authorizationEndpoint && cfg.tokenEndpoint) return fallback;
    if (cfg.discovery === false || typeof fetch !== "function") return fallback;
    try {
      const discoveryUrl = new URL("/.well-known/openid-configuration", cfg.issuer);
      const response = await fetch(discoveryUrl.toString());
      if (!response.ok) return fallback;
      const metadata = (await response.json()) as {
        authorization_endpoint?: unknown;
        token_endpoint?: unknown;
      };
      return {
        authorizationEndpoint:
          cfg.authorizationEndpoint ||
          (typeof metadata.authorization_endpoint === "string"
            ? metadata.authorization_endpoint
            : fallback.authorizationEndpoint),
        tokenEndpoint:
          cfg.tokenEndpoint ||
          (typeof metadata.token_endpoint === "string"
            ? metadata.token_endpoint
            : fallback.tokenEndpoint),
      };
    } catch {
      return fallback;
    }
  })();
  return endpointsInFlight;
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

function clearStoredDrk(): void {
  localStorage.removeItem(DRK_STORAGE_KEY);
}

function getStoredDrk(): Uint8Array | null {
  if (drkStorageMode() !== "localStorage") {
    clearStoredDrk();
    return null;
  }
  const obfuscatedDrkBase64 = localStorage.getItem(DRK_STORAGE_KEY);
  if (!obfuscatedDrkBase64) return null;
  try {
    const obfuscatedDrk = base64UrlToBytes(obfuscatedDrkBase64);
    return deobfuscateKey(obfuscatedDrk);
  } catch {
    clearStoredDrk();
    return null;
  }
}

function storeSession(session: AuthSession): AuthSession {
  const tokenMode = tokenStorageMode();
  const drkMode = drkStorageMode();
  const currentRefreshMode = refreshMode();
  const storedSession: AuthSession = {
    idToken: session.idToken,
    accessToken: session.accessToken,
    drk: session.drk,
    refreshToken: currentRefreshMode === "token" ? session.refreshToken : undefined,
  };
  memorySession = storedSession;
  if (tokenMode === "localStorage") {
    setStoredIdToken(session.idToken);
    if (session.accessToken) setStoredAccessToken(session.accessToken);
    else clearStoredAccessToken();
  } else {
    clearStoredIdToken();
    clearStoredAccessToken();
  }
  if (drkMode === "localStorage" && session.drk.length > 0) {
    const obfuscatedDrk = obfuscateKey(session.drk);
    localStorage.setItem(DRK_STORAGE_KEY, bytesToBase64Url(obfuscatedDrk));
  } else {
    clearStoredDrk();
  }
  if (currentRefreshMode === "token") {
    memoryRefreshToken = session.refreshToken || memoryRefreshToken;
    if (tokenMode === "localStorage" && session.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    }
  } else {
    memoryRefreshToken = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  return storedSession;
}

function clearCallbackStorage(): void {
  sessionStorage.removeItem("zk_eph_priv_jwk");
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem("pkce_verifier");
}

function stripDrkJweFragment(): void {
  if (!location.hash.includes("drk_jwe=")) return;
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(hash);
  params.delete("drk_jwe");
  const nextHash = params.toString();
  const nextUrl = `${location.origin}${location.pathname}${location.search || ""}${
    nextHash ? `#${nextHash}` : ""
  }`;
  try {
    history.replaceState(null, "", nextUrl);
  } catch {}
}

function clearCallbackUrl(): void {
  try {
    history.replaceState(null, "", location.origin + location.pathname);
  } catch {}
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
  const zkEnabled = cfg.zk !== false;
  let zkPubParam: string | undefined;
  if (zkEnabled) {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveKey",
      "deriveBits",
    ]);
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    sessionStorage.setItem("zk_eph_priv_jwk", JSON.stringify(privateJwk));
    zkPubParam = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(publicJwk)));
  }
  const state = crypto.randomUUID();
  const verifier = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem("pkce_verifier", verifier);
  const challenge = bytesToBase64Url(await sha256(new TextEncoder().encode(verifier)));
  const endpoints = await resolveEndpoints();
  const authUrl = new URL(endpoints.authorizationEndpoint);
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", cfg.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", cfg.scope || "openid profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  if (zkEnabled && zkPubParam) authUrl.searchParams.set("zk_pub", zkPubParam);
  location.assign(authUrl.toString());
}

export async function handleCallback(): Promise<AuthSession | null> {
  if (!location.search.includes("code=")) return null;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return null;
  const fragmentParams = parseFragmentParams(location.hash || "");
  const drkJwe: string | undefined = fragmentParams.drk_jwe;
  if (drkJwe) stripDrkJweFragment();
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const returnedState = params.get("state");
  if (!expectedState) throw new Error("Missing OAuth state");
  if (!returnedState || returnedState !== expectedState) throw new Error("Invalid OAuth state");
  if (callbackInFlight && callbackInFlightCode === code) {
    return callbackInFlight;
  }
  const exchangePromise = (async () => {
    try {
      const endpoints = await resolveEndpoints();
      const tokenUrl = new URL(endpoints.tokenEndpoint);
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
        credentials: fetchCredentials(),
      });
      if (!response.ok) {
        throw new Error("Token exchange failed");
      }
      const tokenResponse = await response.json();
      const zkDrkHash =
        typeof tokenResponse.zk_drk_hash === "string"
          ? (tokenResponse.zk_drk_hash as string)
          : null;
      const idToken = tokenResponse.id_token as string;
      const accessToken =
        typeof tokenResponse.access_token === "string"
          ? (tokenResponse.access_token as string)
          : undefined;
      const tokenRefreshMode = refreshMode();
      const refreshToken =
        tokenRefreshMode === "token"
          ? (tokenResponse.refresh_token as string | undefined)
          : undefined;
      const hasZkArtifacts = !!drkJwe || !!zkDrkHash;
      if (!hasZkArtifacts) {
        clearCallbackUrl();
        return storeSession({ idToken, accessToken, drk: EMPTY_DRK, refreshToken });
      }
      if (!drkJwe || typeof drkJwe !== "string")
        throw new Error("Missing DRK JWE from URL fragment");
      if (zkDrkHash) {
        const hash = bytesToBase64Url(await sha256(new TextEncoder().encode(drkJwe)));
        if (zkDrkHash !== hash) throw new Error("DRK hash mismatch");
      }
      const privateJwkString = sessionStorage.getItem("zk_eph_priv_jwk");
      if (!privateJwkString) throw new Error("Missing ZK private key for callback");
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
      clearCallbackUrl();
      return storeSession({ idToken, accessToken, drk, refreshToken });
    } finally {
      clearCallbackStorage();
    }
  })();
  callbackInFlight = exchangePromise;
  callbackInFlightCode = code;
  try {
    return await exchangePromise;
  } finally {
    if (callbackInFlight === exchangePromise) {
      callbackInFlight = null;
      callbackInFlightCode = null;
    }
  }
}

export function getStoredSession(): AuthSession | null {
  if (memorySession) {
    if (isTokenValid(memorySession.idToken)) return memorySession;
    memorySession = null;
  }
  if (tokenStorageMode() !== "localStorage") {
    clearStoredIdToken();
    clearStoredAccessToken();
    clearStoredDrk();
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return null;
  }
  const idToken = getStoredIdToken();
  const accessToken = getStoredAccessToken() || undefined;
  if (!idToken) return null;
  if (!isTokenValid(idToken)) return null;
  return {
    idToken,
    accessToken,
    drk: getStoredDrk() || EMPTY_DRK,
    refreshToken:
      refreshMode() === "token" ? localStorage.getItem(REFRESH_TOKEN_KEY) || undefined : undefined,
  };
}

export async function refreshSession(): Promise<AuthSession | null> {
  const currentRefreshMode = refreshMode();
  const refreshToken =
    currentRefreshMode === "token"
      ? memoryRefreshToken || localStorage.getItem(REFRESH_TOKEN_KEY)
      : null;
  if (currentRefreshMode === "token" && !refreshToken) return null;
  const endpoints = await resolveEndpoints();
  const tokenUrl = new URL(endpoints.tokenEndpoint);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
  });
  if (currentRefreshMode === "token" && refreshToken) {
    body.set("refresh_token", refreshToken);
  }
  const response = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    credentials: fetchCredentials(),
  });
  if (!response.ok) {
    if (response.status === 401) {
      if (currentRefreshMode === "token") {
        const latestRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (latestRefreshToken === refreshToken) {
          localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
        if (memoryRefreshToken === refreshToken) {
          memoryRefreshToken = null;
        }
      }
      memorySession = null;
    }
    return null;
  }
  const tokenResponse = await response.json();
  const idToken = tokenResponse.id_token as string;
  const accessToken =
    typeof tokenResponse.access_token === "string"
      ? (tokenResponse.access_token as string)
      : undefined;
  const newRefreshToken =
    currentRefreshMode === "token"
      ? (tokenResponse.refresh_token as string | undefined)
      : undefined;
  const drk =
    memorySession?.drk && memorySession.drk.length > 0
      ? memorySession.drk
      : getStoredDrk() || EMPTY_DRK;
  return storeSession({
    idToken,
    accessToken,
    drk,
    refreshToken:
      currentRefreshMode === "token" ? newRefreshToken || refreshToken || undefined : undefined,
  });
}

export function logout(): void {
  memorySession = null;
  memoryRefreshToken = null;
  clearStoredIdToken();
  clearStoredAccessToken();
  clearStoredDrk();
  sessionStorage.removeItem("zk_eph_priv_jwk");
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getCurrentUser(): JwtClaims | null {
  const idToken =
    memorySession?.idToken || (tokenStorageMode() === "localStorage" ? getStoredIdToken() : null);
  if (!idToken) return null;
  return parseJwt(idToken);
}
