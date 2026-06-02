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
  drkStorage?: "memory";
  refreshMode?: "cookie" | "token";
  credentials?: RequestCredentials;
};

export interface AuthSession {
  idToken: string;
  accessToken?: string;
  drk: Uint8Array;
  clientAppKey?: Uint8Array;
  rootKey?: Uint8Array;
  deliveredKeyKind?: "client_app_key" | "root_key";
  keyDeliveryVersion?: "v1-drk" | "v2";
  refreshToken?: string;
}

export interface JwtClaims {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  org_id?: string;
  org_slug?: string;
  roles?: string[];
  permissions?: string[];
}

export type DarkAuthOrganization = {
  organizationId: string;
  slug: string;
  name: string;
  status: string;
  roles?: Array<{ id: string; key: string; name: string }>;
};

export type InitiateLoginOptions = {
  organizationId?: string;
  returnTo?: string;
};

export type SwitchOrganizationOptions = {
  mode?: "token" | "silent" | "authorize" | "hosted";
  returnTo?: string;
};

export type RefreshSessionOptions = {
  force?: boolean;
};

export type DarkAuthSessionInfo = {
  authenticated: boolean;
  sub?: string;
  email?: string | null;
  name?: string | null;
  organizationId?: string;
  organizationSlug?: string | null;
};

export type DarkAuthErrorCode =
  | "unauthenticated_session"
  | "invalid_organization"
  | "org_context_required"
  | "request_failed";

export class DarkAuthError extends Error {
  code: DarkAuthErrorCode;
  status?: number;

  constructor(message: string, code: DarkAuthErrorCode, status?: number) {
    super(message);
    this.name = "DarkAuthError";
    this.code = code;
    this.status = status;
  }
}

export class UnauthenticatedSessionError extends DarkAuthError {
  constructor(message = "User session required", status = 401) {
    super(message, "unauthenticated_session", status);
    this.name = "UnauthenticatedSessionError";
  }
}

export class InvalidOrganizationError extends DarkAuthError {
  constructor(message = "Invalid organization", status = 403) {
    super(message, "invalid_organization", status);
    this.name = "InvalidOrganizationError";
  }
}

export class OrgContextRequiredError extends DarkAuthError {
  constructor(message = "Organization context required", status = 400) {
    super(message, "org_context_required", status);
    this.name = "OrgContextRequiredError";
  }
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

const EMPTY_DRK = new Uint8Array(0);
const ID_TOKEN_KEY = "id_token";
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const DRK_STORAGE_KEY = "drk_protected";
const OAUTH_STATE_KEY = "oauth_state";
const V2_KEY_JWE_MAX_TTL_SECONDS = 600;

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

function refreshMode(): "cookie" | "token" {
  return cfg.refreshMode || (cfg.firstParty === false ? "token" : "cookie");
}

function fetchCredentials(): RequestCredentials {
  return cfg.credentials || "include";
}

function rootEndpoint(path: string): string {
  return new URL(path, cfg.issuer).toString();
}

function isSafeReturnTo(returnTo: string): boolean {
  if (returnTo.startsWith("/")) {
    return !returnTo.startsWith("//") && !returnTo.includes("\\");
  }
  try {
    const url = new URL(returnTo);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function requestFailed(status: number, message = "DarkAuth request failed"): DarkAuthError {
  return new DarkAuthError(message, "request_failed", status);
}

async function readErrorPayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = (await response.json()) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {}
  return null;
}

async function errorForResponse(response: Response): Promise<DarkAuthError> {
  const payload = await readErrorPayload(response);
  const code =
    typeof payload?.code === "string"
      ? payload.code
      : typeof payload?.error === "string"
        ? payload.error
        : undefined;
  const message =
    typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error_description === "string"
        ? payload.error_description
        : undefined;
  if (response.status === 401) return new UnauthenticatedSessionError(message, response.status);
  if (code === "ORG_CONTEXT_REQUIRED" || code === "org_context_required") {
    return new OrgContextRequiredError(message, response.status);
  }
  if (response.status === 403) return new InvalidOrganizationError(message, response.status);
  return requestFailed(response.status, message);
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

async function sha256Base64Url(value: string): Promise<string> {
  return bytesToBase64Url(await sha256(new TextEncoder().encode(value)));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function audienceMatches(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value === expected;
  if (isStringArray(value)) return value.includes(expected);
  return false;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${name}`);
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function parseJsonPayload(bytes: Uint8Array): Record<string, unknown> {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid key payload");
  return parsed as Record<string, unknown>;
}

function clearStoredDrk(): void {
  localStorage.removeItem(DRK_STORAGE_KEY);
}

function getStoredDrk(): Uint8Array | null {
  clearStoredDrk();
  return null;
}

function storeSession(session: AuthSession): AuthSession {
  const tokenMode = tokenStorageMode();
  const currentRefreshMode = refreshMode();
  const storedSession: AuthSession = {
    idToken: session.idToken,
    accessToken: session.accessToken,
    drk: session.drk,
    clientAppKey: session.clientAppKey,
    rootKey: session.rootKey,
    deliveredKeyKind: session.deliveredKeyKind,
    keyDeliveryVersion: session.keyDeliveryVersion,
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
  clearStoredDrk();
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

function stripKeyJweFragment(): void {
  if (!location.hash.includes("drk_jwe=") && !location.hash.includes("darkauth_key_jwe=")) return;
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(hash);
  params.delete("drk_jwe");
  params.delete("darkauth_key_jwe");
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

export async function initiateLogin(options: InitiateLoginOptions = {}): Promise<void> {
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
  if (options.organizationId) authUrl.searchParams.set("organization_id", options.organizationId);
  location.assign(authUrl.toString());
}

export async function handleCallback(): Promise<AuthSession | null> {
  if (!location.search.includes("code=")) return null;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return null;
  const fragmentParams = parseFragmentParams(location.hash || "");
  const drkJwe: string | undefined = fragmentParams.drk_jwe;
  const darkauthKeyJwe: string | undefined = fragmentParams.darkauth_key_jwe;
  if (drkJwe || darkauthKeyJwe) stripKeyJweFragment();
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
      const zkKeyHash =
        typeof tokenResponse.zk_key_hash === "string"
          ? (tokenResponse.zk_key_hash as string)
          : null;
      const zkKeyKind =
        typeof tokenResponse.zk_key_kind === "string"
          ? (tokenResponse.zk_key_kind as string)
          : null;
      const zkKeyVersion =
        typeof tokenResponse.zk_key_version === "string"
          ? (tokenResponse.zk_key_version as string)
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
      const hasV2Artifacts = !!darkauthKeyJwe || !!zkKeyHash || !!zkKeyKind || !!zkKeyVersion;
      const hasLegacyArtifacts = !!drkJwe || !!zkDrkHash;
      const hasZkArtifacts = hasV2Artifacts || hasLegacyArtifacts;
      if (!hasZkArtifacts) {
        clearCallbackUrl();
        return storeSession({ idToken, accessToken, drk: EMPTY_DRK, refreshToken });
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
      let drk: Uint8Array;
      let clientAppKey: Uint8Array | undefined;
      let rootKey: Uint8Array | undefined;
      let deliveredKeyKind: AuthSession["deliveredKeyKind"];
      let keyDeliveryVersion: AuthSession["keyDeliveryVersion"];
      if (hasV2Artifacts) {
        if (hasLegacyArtifacts) throw new Error("Mixed key delivery metadata");
        if (!darkauthKeyJwe || typeof darkauthKeyJwe !== "string")
          throw new Error("Missing client key JWE from URL fragment");
        if (!zkKeyHash) throw new Error("Missing client key hash");
        if (zkKeyKind !== "client_app_key") throw new Error("Invalid client key kind");
        if (zkKeyVersion !== "v2") throw new Error("Invalid client key version");
        const hash = await sha256Base64Url(darkauthKeyJwe);
        if (zkKeyHash !== hash) throw new Error("Client key hash mismatch");
        const { plaintext, protectedHeader } = await compactDecrypt(darkauthKeyJwe, privateKey);
        if (protectedHeader.alg !== "ECDH-ES" || protectedHeader.enc !== "A256GCM")
          throw new Error("Invalid client key JWE header");
        const payload = parseJsonPayload(new Uint8Array(plaintext));
        if (payload.typ !== "DarkAuth-Client-Key") throw new Error("Invalid client key type");
        if (payload.version !== "v2" && payload.version !== "v2-client-key")
          throw new Error("Invalid client key payload version");
        if (payload.key_kind !== "client_app_key")
          throw new Error("Invalid client key payload kind");
        if (payload.client_id !== cfg.clientId) throw new Error("Invalid client key client");
        if (!audienceMatches(payload.aud, cfg.clientId))
          throw new Error("Invalid client key audience");
        const idTokenSubject = parseJwt(idToken)?.sub;
        if (!idTokenSubject || payload.sub !== idTokenSubject)
          throw new Error("Invalid client key subject");
        if (payload.state_hash !== (await sha256Base64Url(expectedState)))
          throw new Error("Invalid client key state");
        if (payload.redirect_uri_hash !== (await sha256Base64Url(cfg.redirectUri)))
          throw new Error("Invalid client key redirect URI");
        requireString(payload.key_id, "client key id");
        const exp = requireNumber(payload.exp, "client key expiry");
        const now = Date.now() / 1000;
        if (exp <= now) throw new Error("Client key JWE expired");
        if (typeof payload.iat === "number") {
          if (!Number.isFinite(payload.iat)) throw new Error("Invalid client key issued-at");
          if (payload.iat > now + 60) throw new Error("Invalid client key issued-at");
          if (exp - payload.iat > V2_KEY_JWE_MAX_TTL_SECONDS)
            throw new Error("Client key JWE lifetime too long");
        } else if (exp > now + V2_KEY_JWE_MAX_TTL_SECONDS) {
          throw new Error("Client key JWE lifetime too long");
        }
        drk = base64UrlToBytes(requireString(payload.cak, "client app key"));
        if (drk.length === 0) throw new Error("Invalid client app key");
        clientAppKey = drk;
        deliveredKeyKind = "client_app_key";
        keyDeliveryVersion = "v2";
      } else {
        if (!drkJwe || typeof drkJwe !== "string")
          throw new Error("Missing DRK JWE from URL fragment");
        if (zkDrkHash) {
          const hash = await sha256Base64Url(drkJwe);
          if (zkDrkHash !== hash) throw new Error("DRK hash mismatch");
        }
        const { plaintext, protectedHeader } = await compactDecrypt(drkJwe, privateKey);
        if (protectedHeader.alg !== "ECDH-ES" || protectedHeader.enc !== "A256GCM")
          throw new Error("Invalid DRK JWE header");
        drk = new Uint8Array(plaintext);
        rootKey = drk;
        deliveredKeyKind = "root_key";
        keyDeliveryVersion = "v1-drk";
      }
      clearCallbackUrl();
      return storeSession({
        idToken,
        accessToken,
        drk,
        clientAppKey,
        rootKey,
        deliveredKeyKind,
        keyDeliveryVersion,
        refreshToken,
      });
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

export async function refreshSession(
  options: RefreshSessionOptions = {}
): Promise<AuthSession | null> {
  if (!options.force) {
    const current = getStoredSession();
    if (current) return current;
  }
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
    const error = await errorForResponse(response);
    if (error instanceof OrgContextRequiredError) throw error;
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
    clientAppKey: memorySession?.clientAppKey,
    rootKey: memorySession?.rootKey,
    deliveredKeyKind: memorySession?.deliveredKeyKind,
    keyDeliveryVersion: memorySession?.keyDeliveryVersion,
    refreshToken:
      currentRefreshMode === "token" ? newRefreshToken || refreshToken || undefined : undefined,
  });
}

export async function listOrganizations(): Promise<DarkAuthOrganization[]> {
  const response = await fetch(rootEndpoint("/api/user/organizations"), {
    credentials: fetchCredentials(),
  });
  if (!response.ok) throw await errorForResponse(response);
  const data = (await response.json()) as { organizations?: unknown };
  if (!Array.isArray(data.organizations)) return [];
  return data.organizations.filter((org): org is DarkAuthOrganization => {
    if (!org || typeof org !== "object") return false;
    const candidate = org as Partial<DarkAuthOrganization>;
    return (
      typeof candidate.organizationId === "string" &&
      typeof candidate.slug === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.status === "string"
    );
  });
}

export async function getSessionInfo(): Promise<DarkAuthSessionInfo> {
  const response = await fetch(rootEndpoint("/api/user/session"), {
    credentials: fetchCredentials(),
  });
  if (response.status === 401) return { authenticated: false };
  if (!response.ok) throw await errorForResponse(response);
  const data = (await response.json()) as Partial<DarkAuthSessionInfo>;
  return {
    authenticated: data.authenticated === true,
    sub: typeof data.sub === "string" ? data.sub : undefined,
    email: typeof data.email === "string" || data.email === null ? data.email : undefined,
    name: typeof data.name === "string" || data.name === null ? data.name : undefined,
    organizationId: typeof data.organizationId === "string" ? data.organizationId : undefined,
    organizationSlug:
      typeof data.organizationSlug === "string" || data.organizationSlug === null
        ? data.organizationSlug
        : undefined,
  };
}

export async function switchOrganization(
  organizationId: string,
  options: SwitchOrganizationOptions = {}
): Promise<AuthSession | null> {
  const mode = options.mode || "token";
  if (mode === "token") {
    const current = getStoredSession();
    const bearerToken = current?.accessToken || current?.idToken;
    if (!current || !bearerToken) {
      await initiateLogin({ organizationId, returnTo: options.returnTo });
      return null;
    }
    const response = await fetch(rootEndpoint("/api/token/organization"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        organization_id: organizationId,
        client_id: cfg.clientId,
      }),
      credentials: fetchCredentials(),
    });
    if (!response.ok) throw await errorForResponse(response);
    const tokenResponse = await response.json();
    const idToken = tokenResponse.id_token as string;
    const accessToken =
      typeof tokenResponse.access_token === "string"
        ? (tokenResponse.access_token as string)
        : undefined;
    const refreshToken =
      refreshMode() === "token" ? (tokenResponse.refresh_token as string | undefined) : undefined;
    return storeSession({
      idToken,
      accessToken,
      drk: current.drk || EMPTY_DRK,
      clientAppKey: current.clientAppKey,
      rootKey: current.rootKey,
      deliveredKeyKind: current.deliveredKeyKind,
      keyDeliveryVersion: current.keyDeliveryVersion,
      refreshToken,
    });
  }
  if (mode === "silent") {
    const response = await fetch(rootEndpoint("/api/user/session/organization"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organization_id: organizationId,
        return_to: options.returnTo,
        client_id: cfg.clientId,
      }),
      credentials: fetchCredentials(),
    });
    if (!response.ok) throw await errorForResponse(response);
    await response.json().catch(() => null);
    return await refreshSession({ force: true });
  }
  if (mode === "authorize") {
    await initiateLogin({ organizationId, returnTo: options.returnTo });
    return null;
  }
  const switchUrl = new URL(rootEndpoint("/switch-org"));
  switchUrl.searchParams.set("organization_id", organizationId);
  switchUrl.searchParams.set("client_id", cfg.clientId);
  if (options.returnTo && isSafeReturnTo(options.returnTo)) {
    switchUrl.searchParams.set("return_to", options.returnTo);
  }
  location.assign(switchUrl.toString());
  return null;
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
