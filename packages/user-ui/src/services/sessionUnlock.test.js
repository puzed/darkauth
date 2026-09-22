import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { fromBase64Url, toBase64Url } from "./crypto.ts";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "sessionUnlock.ts"), "utf8");
const sub = "user-sub";

function createStorage() {
  const values = new Map();
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createServer() {
  return {
    allowSessionUnlock: true,
    keyId: "ark_1",
    key: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    keyRequests: 0,
  };
}

function loadModule({ server, storage = createStorage() }) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const apiService = {
    getUnlockPolicy: async () => ({ allowSessionUnlock: server.allowSessionUnlock }),
    getSessionUnlockKey: async () => {
      server.keyRequests += 1;
      if (!server.key) throw new Error("Session unlock key missing");
      return server.key;
    },
    getKeybag: async () => ({ account_keys: [{ key_id: server.keyId, status: "active" }] }),
  };
  const sandbox = {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier === "./api") return { __esModule: true, default: apiService };
      if (specifier === "./crypto") return { fromBase64Url, toBase64Url };
      if (specifier === "./logger") return { logger: { warn: () => {} } };
      throw new Error(`Unexpected import ${specifier}`);
    },
    crypto,
    localStorage: storage,
    TextEncoder,
    Uint8Array,
    JSON,
    Promise,
  };
  vm.runInNewContext(compiled, sandbox);
  return { ...module.exports, storage };
}

function ark() {
  return Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
}

test("session ARK round-trips through an encrypted local envelope", async () => {
  const server = createServer();
  const { storeSessionArk, restoreSessionArk, storage } = loadModule({ server });
  const plaintext = ark();

  await storeSessionArk(sub, plaintext);
  const stored = storage.getItem(`DarkAuth_session_ark:${sub}`);
  const envelope = JSON.parse(stored);

  assert.deepEqual([...storage.values.keys()], [`DarkAuth_session_ark:${sub}`]);
  assert.deepEqual(Object.keys(envelope).sort(), ["ct", "iv", "key_id", "sub", "v"]);
  assert.equal(envelope.key_id, "ark_1");
  assert.equal(stored.includes(toBase64Url(plaintext)), false);
  assert.equal(stored.includes(Buffer.from(plaintext).toString("base64")), false);
  assert.deepEqual([...(await restoreSessionArk(sub))], [...plaintext]);
});

test("store fetches the server key fresh each time", async () => {
  const server = createServer();
  const { storeSessionArk, restoreSessionArk } = loadModule({ server });

  await storeSessionArk(sub, ark());
  await storeSessionArk(sub, ark());
  await restoreSessionArk(sub);

  assert.equal(server.keyRequests, 3);
});

test("a new sign-in key cannot open an old envelope and deletes it", async () => {
  const server = createServer();
  const { storeSessionArk, restoreSessionArk, storage } = loadModule({ server });

  await storeSessionArk(sub, ark());
  server.key = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

  assert.equal(await restoreSessionArk(sub), null);
  assert.equal(storage.getItem(`DarkAuth_session_ark:${sub}`), null);
});

test("account key rotation, subject mismatch, and tampering delete the envelope", async () => {
  const server = createServer();
  const { storeSessionArk, restoreSessionArk, storage } = loadModule({ server });
  const storageKey = `DarkAuth_session_ark:${sub}`;

  await storeSessionArk(sub, ark());
  server.keyId = "ark_2";
  assert.equal(await restoreSessionArk(sub), null);
  assert.equal(storage.getItem(storageKey), null);

  server.keyId = "ark_1";
  await storeSessionArk(sub, ark());
  const envelope = JSON.parse(storage.getItem(storageKey));
  storage.setItem(storageKey, JSON.stringify({ ...envelope, sub: "other-sub" }));
  assert.equal(await restoreSessionArk(sub), null);
  assert.equal(storage.getItem(storageKey), null);

  await storeSessionArk(sub, ark());
  const stored = JSON.parse(storage.getItem(storageKey));
  const ciphertext = fromBase64Url(stored.ct);
  ciphertext[0] ^= 1;
  storage.setItem(storageKey, JSON.stringify({ ...stored, ct: toBase64Url(ciphertext) }));
  assert.equal(await restoreSessionArk(sub), null);
  assert.equal(storage.getItem(storageKey), null);
});

test("disabled policy or missing server key stores nothing and clears existing envelopes", async () => {
  const server = createServer();
  const { storeSessionArk, restoreSessionArk, storage } = loadModule({ server });
  const storageKey = `DarkAuth_session_ark:${sub}`;

  await storeSessionArk(sub, ark());
  server.allowSessionUnlock = false;
  assert.equal(await restoreSessionArk(sub), null);
  assert.equal(storage.getItem(storageKey), null);
  await storeSessionArk(sub, ark());
  assert.equal(storage.getItem(storageKey), null);

  server.allowSessionUnlock = true;
  server.key = null;
  await storeSessionArk(sub, ark());
  assert.equal(storage.getItem(storageKey), null);
});

test("storing for one account clears other accounts and clearAll respects the kept subject", async () => {
  const server = createServer();
  const { storeSessionArk, clearAllSessionArks, storage } = loadModule({ server });

  await storeSessionArk("first", ark());
  await storeSessionArk("second", ark());
  assert.deepEqual([...storage.values.keys()], ["DarkAuth_session_ark:second"]);

  storage.setItem("daTheme", "dark");
  clearAllSessionArks("second");
  assert.notEqual(storage.getItem("DarkAuth_session_ark:second"), null);
  clearAllSessionArks();
  assert.deepEqual([...storage.values.keys()], ["daTheme"]);
});

test("blocked storage never throws out of the session unlock service", async () => {
  const server = createServer();
  const blocked = () => {
    throw new Error("SecurityError");
  };
  const storage = {
    get length() {
      return blocked();
    },
    key: blocked,
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
  };
  const { storeSessionArk, restoreSessionArk, clearSessionArk, clearAllSessionArks } = loadModule({
    server,
    storage,
  });

  await storeSessionArk(sub, ark());
  assert.equal(await restoreSessionArk(sub), null);
  clearSessionArk(sub);
  clearAllSessionArks();
});

test("session key import is non-extractable AES-GCM with bound AAD", () => {
  assert.match(source, /importKey\("raw", raw as BufferSource, "AES-GCM", false,/);
  assert.match(source, /DarkAuth\|session-ark\|v\$\{VERSION\}\|sub=\$\{sub\}\|key_id=\$\{keyId\}/);
});
