import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { CompactEncrypt, importJWK } from "jose";
import {
  decryptNote,
  encryptNote,
  getStoredSession,
  handleCallback,
  initiateLogin,
  logout,
  setConfig,
} from "../dist/index.js";

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    key(index) {
      return Array.from(entries.keys())[index] || null;
    },
    get length() {
      return entries.size;
    },
  };
}

function setupBrowser() {
  if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
  }
  if (!globalThis.crypto.randomUUID) {
    globalThis.crypto.randomUUID = webcrypto.randomUUID.bind(webcrypto);
  }
  if (!globalThis.btoa) {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }
  if (!globalThis.atob) {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  const location = {
    href: "https://app.example/callback",
    search: "",
    hash: "",
    origin: "https://app.example",
    pathname: "/callback",
    assign(url) {
      this.assignedUrl = url;
    },
    assignedUrl: "",
  };
  function applyUrl(url) {
    const parsed = new URL(url, location.origin);
    location.href = parsed.toString();
    location.search = parsed.search;
    location.hash = parsed.hash;
    location.origin = parsed.origin;
    location.pathname = parsed.pathname;
  }
  globalThis.location = location;
  globalThis.history = {
    replaceState(_state, _title, url) {
      applyUrl(url);
    },
  };
  logout();
  setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: true,
    discovery: false,
  });
  return { location, applyUrl };
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function sha256Base64Url(value) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url");
}

function createIdToken() {
  const header = toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: "user-1",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  );
  return `${header}.${payload}.sig`;
}

async function createDrkJwe(publicJwk, drk) {
  const key = await importJWK({ ...publicJwk, alg: undefined }, "ECDH-ES");
  return new CompactEncrypt(drk).setProtectedHeader({ alg: "ECDH-ES", enc: "A256GCM" }).encrypt(key);
}

test("zk callback keeps DRK and tokens memory-only by default", async () => {
  const { location, applyUrl } = setupBrowser();

  await initiateLogin();

  const authUrl = new URL(location.assignedUrl);
  const publicJwk = JSON.parse(new TextDecoder().decode(fromBase64Url(authUrl.searchParams.get("zk_pub"))));
  const state = authUrl.searchParams.get("state");
  const verifier = sessionStorage.getItem("pkce_verifier");
  const drk = Uint8Array.from(Array.from({ length: 32 }, (_value, index) => index + 1));
  const jwe = await createDrkJwe(publicJwk, drk);
  const idToken = createIdToken();
  applyUrl(`https://app.example/callback?code=code-1&state=${state}#drk_jwe=${encodeURIComponent(jwe)}`);
  let tokenBody;
  globalThis.fetch = async (_url, init) => {
    tokenBody = init.body;
    assert.equal(init.credentials, "include");
    return {
      ok: true,
      json: async () => ({
        id_token: idToken,
        access_token: "at-zk",
        refresh_token: "rt-zk",
        zk_drk_hash: await sha256Base64Url(jwe),
      }),
    };
  };

  const session = await handleCallback();
  const noteId = "note-1";
  const ciphertext = await encryptNote(session.drk, noteId, "secret note");
  const plaintext = await decryptNote(session.drk, noteId, ciphertext, { note_id: noteId });

  assert.ok(session);
  assert.deepEqual(Array.from(session.drk), Array.from(drk));
  assert.equal(plaintext, "secret note");
  assert.equal(session.refreshToken, undefined);
  assert.equal(tokenBody.get("code_verifier"), verifier);
  assert.equal(globalThis.localStorage.getItem("drk_protected"), null);
  assert.equal(globalThis.localStorage.getItem("id_token"), null);
  assert.equal(globalThis.localStorage.getItem("access_token"), null);
  assert.equal(globalThis.localStorage.getItem("refresh_token"), null);
  assert.equal(globalThis.sessionStorage.getItem("zk_eph_priv_jwk"), null);
  assert.equal(globalThis.sessionStorage.getItem("pkce_verifier"), null);
  assert.equal(globalThis.sessionStorage.getItem("oauth_state"), null);
  assert.equal(location.hash.includes("drk_jwe"), false);
  assert.equal(getStoredSession(), session);

  const freshModule = await import(`../dist/index.js?fresh=${Date.now()}`);
  freshModule.setConfig({
    issuer: "https://issuer.example",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    zk: true,
    discovery: false,
  });
  assert.equal(freshModule.getStoredSession(), null);
});

test("callback strips drk_jwe fragment and clears continuity data on token failure", async () => {
  const { location, applyUrl } = setupBrowser();
  sessionStorage.setItem("oauth_state", "state-1");
  sessionStorage.setItem("pkce_verifier", "pkce-1");
  sessionStorage.setItem("zk_eph_priv_jwk", JSON.stringify({ kty: "EC" }));
  applyUrl("https://app.example/callback?code=bad-code&state=state-1#drk_jwe=secret-jwe&keep=1");
  globalThis.fetch = async () => ({ ok: false, status: 500 });

  await assert.rejects(() => handleCallback(), /Token exchange failed/);

  assert.equal(location.hash, "#keep=1");
  assert.equal(sessionStorage.getItem("oauth_state"), null);
  assert.equal(sessionStorage.getItem("pkce_verifier"), null);
  assert.equal(sessionStorage.getItem("zk_eph_priv_jwk"), null);
});
