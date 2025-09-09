import type { BrowserContext } from '@playwright/test';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url, sha256Base64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import type { TestServers } from '../server.js';

export interface BasicUser {
  email: string;
  password: string;
  name: string;
}

export async function registerUser(servers: TestServers, user: BasicUser): Promise<void> {
  const client = new OpaqueClient();
  await client.initialize();
  const regStart = await client.startRegistration(user.password, user.email);
  const startRes = await fetch(`${servers.userUrl}/api/user/opaque/register/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)), email: user.email })
  });
  if (!startRes.ok) throw new Error(`register start failed: ${startRes.status}`);
  const startJson = await startRes.json();
  const regFinish = await client.finishRegistration(
    fromBase64Url(startJson.message),
    regStart.state,
    fromBase64Url(startJson.serverPublicKey),
    'DarkAuth',
    user.email
  );
  const finishRes = await fetch(`${servers.userUrl}/api/user/opaque/register/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ email: user.email, name: user.name, record: toBase64Url(Buffer.from(regFinish.upload)) })
  });
  if (!finishRes.ok) throw new Error(`register finish failed: ${finishRes.status}`);
}

export async function establishUserSession(
  context: BrowserContext,
  servers: TestServers,
  user: Pick<BasicUser, 'email' | 'password'>
): Promise<void> {
  const client = new OpaqueClient();
  await client.initialize();
  const loginStart = await client.startLogin(user.password, user.email);
  const startRes = await fetch(`${servers.userUrl}/api/user/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ email: user.email, request: toBase64Url(Buffer.from(loginStart.request)) })
  });
  if (!startRes.ok) throw new Error(`login start failed: ${startRes.status}`);
  const startJson = await startRes.json();
  const loginFinish = await client.finishLogin(
    fromBase64Url(startJson.message),
    loginStart.state,
    new Uint8Array(),
    'DarkAuth',
    user.email
  );
  const finishRes = await fetch(`${servers.userUrl}/api/user/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(loginFinish.finish)), sessionId: startJson.sessionId })
  });
  if (!finishRes.ok) throw new Error(`login finish failed: ${finishRes.status}`);
  const finishJson = await finishRes.json();

  const page = await context.newPage();
  await page.goto(servers.userUrl);
  await page.evaluate(([accessToken, refreshToken]) => {
    try {
      localStorage.setItem('userAccessToken', accessToken);
      if (refreshToken) localStorage.setItem('userRefreshToken', refreshToken);
    } catch {}
  }, [finishJson.accessToken, finishJson.refreshToken]);
  await page.close();
}

export async function createUserViaAdmin(
  servers: TestServers,
  admin: { email: string; password: string },
  user: BasicUser
): Promise<{ sub: string }> {
  const client = new OpaqueClient();
  await client.initialize();
  const loginStart = await client.startLogin(admin.password, admin.email);
  const startRes = await fetch(`${servers.adminUrl}/admin/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.adminUrl },
    body: JSON.stringify({ email: admin.email, request: toBase64Url(Buffer.from(loginStart.request)) })
  });
  if (!startRes.ok) throw new Error(`admin login start failed: ${startRes.status}`);
  const startJson = await startRes.json();
  const loginFinish = await client.finishLogin(
    fromBase64Url(startJson.message),
    loginStart.state,
    new Uint8Array(),
    'DarkAuth',
    admin.email
  );
  const finishRes = await fetch(`${servers.adminUrl}/admin/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.adminUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(loginFinish.finish)), sessionId: startJson.sessionId })
  });
  if (!finishRes.ok) throw new Error(`admin login finish failed: ${finishRes.status}`);
  const finishJson = await finishRes.json();
  const token = finishJson.accessToken as string;

  const createRes = await fetch(`${servers.adminUrl}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': servers.adminUrl
    },
    body: JSON.stringify({ email: user.email, name: user.name })
  });
  if (!createRes.ok) throw new Error(`create user failed: ${createRes.status}`);
  const created = await createRes.json();
  const sub = created.sub as string;

  const regStart = await client.startRegistration(user.password, user.email);
  const setStartRes = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/password/set/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': servers.adminUrl
    },
    body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)) })
  });
  if (!setStartRes.ok) throw new Error(`password set start failed: ${setStartRes.status}`);
  const setStartJson = await setStartRes.json();
  const regFinish = await client.finishRegistration(
    fromBase64Url(setStartJson.message),
    regStart.state,
    fromBase64Url(setStartJson.serverPublicKey),
    'DarkAuth',
    user.email
  );
  const exportKeyHash = sha256Base64Url(Buffer.from(regFinish.export_key));
  const setFinishRes = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/password/set/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': servers.adminUrl
    },
    body: JSON.stringify({
      record: toBase64Url(Buffer.from(regFinish.upload)),
      export_key_hash: exportKeyHash
    })
  });
  if (!setFinishRes.ok) throw new Error(`password set finish failed: ${setFinishRes.status}`);
  return { sub };
}
