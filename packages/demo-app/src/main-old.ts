 

const issuer = import.meta.env.VITE_DARKAUTH_ISSUER || "http://localhost:9080";
const clientId = import.meta.env.VITE_CLIENT_ID || "app-web";
const redirectUri = import.meta.env.VITE_REDIRECT_URI || window.location.origin + "/";
const demoApi = import.meta.env.VITE_DEMO_API || "http://localhost:9093";

function b64urlToBytes(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
  return Uint8Array.from(atob(s + pad), c => c.charCodeAt(0));
}

function b64ToBytes(s: string) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

function bytesToB64url(b: Uint8Array) {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToB64(b: Uint8Array) {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

async function sha256(b: Uint8Array) {
  const d = await crypto.subtle.digest("SHA-256", b);
  return new Uint8Array(d);
}

async function hkdf(key: Uint8Array, salt: Uint8Array, info: Uint8Array, len = 32) {
  const ikm = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, ikm, len * 8);
  return new Uint8Array(bits);
}

async function aeadEncrypt(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plaintext);
  return { iv, ciphertext: new Uint8Array(ct) };
}

async function aeadDecrypt(key: CryptoKey, payload: Uint8Array, aad: Uint8Array) {
  const iv = payload.slice(0, 12);
  const ct = payload.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, ct);
  return new Uint8Array(pt);
}

async function aeadKey(bytes: Uint8Array) {
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function deriveDek(drk: Uint8Array, noteId: string) {
  const salt = new TextEncoder().encode("DarkAuth|demo-notes");
  const info = new TextEncoder().encode("note:" + noteId);
  return hkdf(drk, salt, info, 32);
}

async function encryptChange(drk: Uint8Array, noteId: string, change: Uint8Array, aadObj: any) {
  const dek = await deriveDek(drk, noteId);
  const key = await aeadKey(dek);
  const aad = new TextEncoder().encode(JSON.stringify(aadObj));
  const { iv, ciphertext } = await aeadEncrypt(key, change, aad);
  const payload = new Uint8Array(iv.length + ciphertext.length);
  payload.set(iv, 0);
  payload.set(ciphertext, iv.length);
  return bytesToB64(payload);
}

async function decryptChange(drk: Uint8Array, noteId: string, ciphertextB64: string, aadObj: any) {
  const dek = await deriveDek(drk, noteId);
  const key = await aeadKey(dek);
  const aad = new TextEncoder().encode(JSON.stringify(aadObj));
  const payload = b64ToBytes(ciphertextB64);
  return aeadDecrypt(key, payload, aad);
}

function parseJwt(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload as any;
  } catch {
    return null;
  }
}

async function getTokenAndDrk() {
  if (!location.search.includes("code=") && !location.hash.includes("drk_jwe=")) return null;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return null;
  const tokenUrl = new URL("/token", issuer);
  const res = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirectUri, code_verifier: sessionStorage.getItem("pkce_verifier") || "" }),
  });
  if (!res.ok) throw new Error("token_exchange_failed");
  const tok = await res.json();
  const drkJwe: string | undefined = tok.zk_drk_jwe;
  if (!drkJwe || typeof drkJwe !== "string") throw new Error("missing_drk_jwe");
  if (tok.zk_drk_hash) {
    const hash = bytesToB64url(await sha256(new TextEncoder().encode(drkJwe)));
    if (tok.zk_drk_hash !== hash) throw new Error("drk_hash_mismatch");
  }
  const privJwkStr = sessionStorage.getItem("zk_eph_priv_jwk");
  if (!privJwkStr) return null;
  const privKey = await crypto.subtle.importKey("jwk", JSON.parse(privJwkStr), { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits", "deriveKey"]);
  const { compactDecrypt } = await import("jose");
  const { plaintext } = await compactDecrypt(drkJwe, privKey as any);
  const idToken = tok.id_token as string;
  try {
    history.replaceState(null, "", location.origin + location.pathname);
  } catch {}
  sessionStorage.setItem("id_token", idToken);
  if ((tok as any).refresh_token) localStorage.setItem("refresh_token", (tok as any).refresh_token as string);
  sessionStorage.setItem("drk_b64", bytesToB64(new Uint8Array(plaintext)));
  return { idToken, drk: new Uint8Array(plaintext) };
}

async function main() {
  const root = document.getElementById("app")!;
  let session = await getTokenAndDrk();
  if (!session) {
    const stored = sessionStorage.getItem("id_token");
    if (stored) {
      const claims = parseJwt(stored);
      if (claims?.exp && claims.exp * 1000 > Date.now() + 5000) {
        const drkB64 = sessionStorage.getItem("drk_b64");
        const drk = drkB64 ? b64ToBytes(drkB64) : new Uint8Array();
        session = { idToken: stored, drk } as any;
      }
    }
  }
  if (!session) {
    const rt = localStorage.getItem("refresh_token");
    if (rt) {
      const tokenUrl = new URL("/token", issuer);
      const resp = await fetch(tokenUrl.toString(), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: clientId }) });
      if (resp.ok) {
        const tok = await resp.json();
        const idToken = tok.id_token as string;
        sessionStorage.setItem("id_token", idToken);
        if ((tok as any).refresh_token) localStorage.setItem("refresh_token", (tok as any).refresh_token);
        const drkB64 = sessionStorage.getItem("drk_b64");
        const drk = drkB64 ? b64ToBytes(drkB64) : new Uint8Array();
        session = { idToken, drk } as any;
      }
    }
  }
  if (!session) {
    const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
    const jwkPub = await crypto.subtle.exportKey("jwk", eph.publicKey);
    const jwkPriv = await crypto.subtle.exportKey("jwk", eph.privateKey);
    sessionStorage.setItem("zk_eph_priv_jwk", JSON.stringify(jwkPriv));
    const param = bytesToB64url(new TextEncoder().encode(JSON.stringify(jwkPub)));
    const state = crypto.randomUUID();
    const verifier = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem("pkce_verifier", verifier);
    const challenge = bytesToB64url(await sha256(new TextEncoder().encode(verifier)));
    const authUrl = new URL("/authorize", issuer);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("zk_pub", param);
    root.textContent = "Redirecting...";
    location.assign(authUrl.toString());
    return;
  }
  const idToken = session.idToken;
  const drk = session.drk;
  const controls = document.createElement("div");
  const createBtn = document.createElement("button");
  createBtn.textContent = "Create note";
  createBtn.onclick = async () => {
    const r = await fetch(demoApi + "/demo/notes", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
    if (r.status === 401) {
      sessionStorage.removeItem("id_token");
      location.reload();
      return;
    }
    const j = await r.json();
    renderNote(j.note_id, idToken, drk);
  };
  controls.appendChild(createBtn);
  root.appendChild(controls);
  const list = document.createElement("div");
  root.appendChild(list);
  const lr = await fetch(demoApi + "/demo/notes", { headers: { Authorization: `Bearer ${idToken}` } });
  if (lr.status === 401) {
    sessionStorage.removeItem("id_token");
    location.reload();
    return;
  }
  if (lr.ok) {
    const j = await lr.json();
    for (const n of j.notes || []) renderNote(n.note_id, idToken, drk);
  }
}

async function renderNote(noteId: string, idToken: string, drk: Uint8Array) {
  const root = document.getElementById("app")!;
  const div = document.createElement("div");
  const ta = document.createElement("textarea");
  const save = document.createElement("button");
  const del = document.createElement("button");
  const msg = document.createElement("div");
  save.textContent = "Save";
  del.textContent = "Delete";
  div.appendChild(ta);
  div.appendChild(save);
  div.appendChild(del);
  div.appendChild(msg);
  root.appendChild(div);
  const init = await fetch(`${demoApi}/demo/notes/${noteId}/changes?since=0`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (init.status === 401) {
    sessionStorage.removeItem("id_token");
    location.reload();
    return;
  }
  if (init.ok) {
    const j = await init.json();
    let latest: string | undefined;
    let decryptFailed = false;
    if (!drk || drk.length === 0) decryptFailed = (j.changes || []).length > 0;
    for (const ch of j.changes || []) {
      try {
        const pt = await decryptChange(drk, noteId, ch.ciphertext_b64, ch.aad);
        latest = new TextDecoder().decode(pt);
      } catch (_e) {
        decryptFailed = true;
        break;
      }
    }
    if (decryptFailed) {
      ta.value = "";
      ta.disabled = true;
      save.disabled = true;
      msg.textContent = "Cannot decrypt this note with your current key. You can delete it.";
      msg.style.color = "#b00";
    } else {
      ta.value = latest || "";
    }
  }
  save.onclick = async () => {
    const payload = new TextEncoder().encode(ta.value);
    const ct = await encryptChange(drk, noteId, payload, { note_id: noteId });
    let resp = await fetch(`${demoApi}/demo/notes/${noteId}/changes`, { method: "POST", headers: { Authorization: `Bearer ${idToken}`, "content-type": "application/json" }, body: JSON.stringify({ ciphertext_b64: ct, aad: { note_id: noteId } }) });
    if (resp.status === 401) {
      const rt = localStorage.getItem("refresh_token");
      if (rt) {
        const tokenUrl = new URL("/token", issuer);
        const r2 = await fetch(tokenUrl.toString(), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: clientId }) });
        if (r2.ok) {
          const tok = await r2.json();
          sessionStorage.setItem("id_token", tok.id_token);
          if (tok.refresh_token) localStorage.setItem("refresh_token", tok.refresh_token);
          resp = await fetch(`${demoApi}/demo/notes/${noteId}/changes`, { method: "POST", headers: { Authorization: `Bearer ${tok.id_token}`, "content-type": "application/json" }, body: JSON.stringify({ ciphertext_b64: ct, aad: { note_id: noteId } }) });
        }
      }
      if (resp.status === 401) {
        sessionStorage.removeItem("id_token");
        localStorage.removeItem("refresh_token");
        location.reload();
        return;
      }
    }
  };
  del.onclick = async () => {
    const r = await fetch(`${demoApi}/demo/notes/${noteId}`, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` } });
    if (r.status === 401) {
      sessionStorage.removeItem("id_token");
      location.reload();
      return;
    }
    if (r.ok) div.remove();
  };
}

main();
