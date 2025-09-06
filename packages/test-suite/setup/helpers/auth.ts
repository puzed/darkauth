import type { BrowserContext } from '@playwright/test';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: startJson.sub, finish: toBase64Url(Buffer.from(loginFinish.finish)), sessionId: startJson.sessionId })
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
