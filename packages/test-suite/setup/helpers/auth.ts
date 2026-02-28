import type { BrowserContext, Page } from '@playwright/test';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url, sha256Base64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';
import type { TestServers } from '../server.js';

export interface BasicUser {
  email: string;
  password: string;
  name: string;
}

interface AdminSessionCacheEntry {
  sessionId: string;
  csrfToken?: string;
  cookies?: Array<{ name: string; value: string }>;
}

const adminSessionCache = new Map<string, AdminSessionCacheEntry>();
const adminOtpSecrets = new Map<string, string>();

function getSetCookieHeaders(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headersWithSetCookie.getSetCookie === 'function') {
    return headersWithSetCookie.getSetCookie();
  }
  const combined = response.headers.get('set-cookie');
  if (!combined) return [];
  return combined.split(/,(?=\s*__Host-)/g);
}

function parseCookieArtifacts(response: Response): {
  sessionId: string | null;
  csrfToken?: string;
  cookies: Array<{ name: string; value: string }>;
} {
  const setCookies = getSetCookieHeaders(response);
  const cookies: Array<{ name: string; value: string }> = [];
  let sessionId: string | null = null;
  let csrfToken: string | undefined;
  for (const setCookie of setCookies) {
    const first = setCookie.split(';')[0]?.trim();
    if (!first) continue;
    const idx = first.indexOf('=');
    if (idx < 1) continue;
    const name = first.slice(0, idx).trim();
    const value = first.slice(idx + 1).trim();
    cookies.push({ name, value });
    if (name === '__Host-DarkAuth-Admin') sessionId = decodeURIComponent(value);
    if (name === '__Host-DarkAuth-Admin-Csrf') csrfToken = decodeURIComponent(value);
  }
  return { sessionId, csrfToken, cookies };
}

function toCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function mergeCookies(
  current: Array<{ name: string; value: string }> = [],
  next: Array<{ name: string; value: string }> = []
): Array<{ name: string; value: string }> {
  const map = new Map<string, string>();
  for (const cookie of current) map.set(cookie.name, cookie.value);
  for (const cookie of next) map.set(cookie.name, cookie.value);
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function updateSessionFromResponse(entry: AdminSessionCacheEntry, response: Response): void {
  const artifacts = parseCookieArtifacts(response);
  if (artifacts.sessionId) entry.sessionId = artifacts.sessionId;
  if (artifacts.csrfToken) entry.csrfToken = artifacts.csrfToken;
  if (artifacts.cookies.length > 0) {
    entry.cookies = mergeCookies(entry.cookies, artifacts.cookies);
  }
}

function requireAdminSessionHeaders(
  entry: AdminSessionCacheEntry,
  options?: { includeCsrf?: boolean; contentType?: string; origin?: string }
): Record<string, string> {
  const cookies = entry.cookies || [];
  const cookieHeader = toCookieHeader(cookies);
  if (!cookieHeader) throw new Error('admin session cookies missing');
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    Origin: options?.origin || '',
  };
  if (options?.contentType) headers['Content-Type'] = options.contentType;
  if (options?.includeCsrf) {
    if (!entry.csrfToken) throw new Error('admin csrf token missing');
    headers['x-csrf-token'] = entry.csrfToken;
  }
  return headers;
}

async function initAdminOtpSecret(
  servers: TestServers,
  admin: { email: string; password: string },
  entry: AdminSessionCacheEntry
): Promise<string> {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  let initRes: Response | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${servers.adminUrl}/admin/otp/setup/init`, {
      method: 'POST',
      headers: requireAdminSessionHeaders(entry, {
        origin: servers.adminUrl,
        includeCsrf: true,
        contentType: 'application/json',
      }),
    });
    if (res.status !== 429) {
      initRes = res;
      break;
    }
    const resetHeader = res.headers.get('X-RateLimit-Reset') ?? res.headers.get('Retry-After');
    const nowSeconds = Math.ceil(Date.now() / 1000);
    const parsed = resetHeader ? parseInt(resetHeader, 10) : NaN;
    let waitMs = 500;
    if (!Number.isNaN(parsed)) {
      waitMs = parsed > nowSeconds ? (parsed - nowSeconds) * 1000 : parsed * 1000;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 1000)));
  }
  if (!initRes || !initRes.ok) {
    throw new Error(`admin otp setup init failed: ${initRes ? initRes.status : 'no-response'}`);
  }
  updateSessionFromResponse(entry, initRes);
  const initJson = await initRes.json() as { secret: string };
  adminOtpSecrets.set(cacheKey, initJson.secret);
  return initJson.secret;
}

export async function getAdminSession(
  servers: TestServers,
  admin: { email: string; password: string }
): Promise<{ sessionId: string; csrfToken: string; cookieHeader: string }> {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  const cached = adminSessionCache.get(cacheKey);
  if (cached?.csrfToken && cached.cookies?.length) {
    return {
      sessionId: cached.sessionId,
      csrfToken: cached.csrfToken,
      cookieHeader: toCookieHeader(cached.cookies),
    };
  }

  const client = new OpaqueClient();
  await client.initialize();
  const loginStart = await client.startLogin(admin.password, admin.email);
  let startRes: Response | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${servers.adminUrl}/admin/opaque/login/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': servers.adminUrl },
      body: JSON.stringify({ email: admin.email, request: toBase64Url(Buffer.from(loginStart.request)) })
    });
    if (res.status !== 429) { startRes = res; break; }
    const resetHeader = res.headers.get('X-RateLimit-Reset');
    const nowSec = Math.ceil(Date.now() / 1000);
    const waitMs = resetHeader ? Math.max(0, (parseInt(resetHeader, 10) - nowSec) * 1000) : 500;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 1000)));
  }
  if (!startRes || !startRes.ok) throw new Error(`admin login start failed: ${startRes ? startRes.status : 'no-response'}`);
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
  const artifacts = parseCookieArtifacts(finishRes);
  if (!artifacts.sessionId) throw new Error('admin login finish missing __Host-DarkAuth-Admin cookie');
  const entry: AdminSessionCacheEntry = {
    sessionId: artifacts.sessionId,
    csrfToken: artifacts.csrfToken,
    cookies: artifacts.cookies,
  };
  await ensureAdminOtpVerified(servers, admin, entry, cacheKey);
  adminSessionCache.set(cacheKey, entry);
  if (!entry.csrfToken || !entry.cookies?.length) throw new Error('admin session artifacts missing');
  return {
    sessionId: entry.sessionId,
    csrfToken: entry.csrfToken,
    cookieHeader: toCookieHeader(entry.cookies),
  };
}

export function getCachedAdminOtpSecret(
  servers: TestServers,
  admin: { email: string }
): string | undefined {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  return adminOtpSecrets.get(cacheKey);
}

export async function completeAdminOtpForPage(
  page: Page,
  servers: TestServers,
  admin: { email: string; password: string }
): Promise<void> {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  const cached = adminSessionCache.get(cacheKey);
  if (!cached) await getAdminSession(servers, admin);
  const entry = adminSessionCache.get(cacheKey);
  if (!entry) throw new Error('admin session cache entry missing');
  let secret = getCachedAdminOtpSecret(servers, { email: admin.email });
  if (!secret) {
    try {
      secret = await initAdminOtpSecret(servers, admin, entry);
    } catch {
      secret = undefined;
    }
    if (!secret) {
      await getAdminSession(servers, admin);
      const refreshed = adminSessionCache.get(cacheKey);
      if (!refreshed) throw new Error('admin session cache entry missing');
      secret = await initAdminOtpSecret(servers, admin, refreshed);
    }
  }
  const secretBuf = base32.decode(secret);
  const now = Math.floor(Date.now() / 1000);
  const { code } = totp(secretBuf, now, 30, 6, 'sha1');
  const verifyRes = await fetch(`${servers.adminUrl}/admin/otp/verify`, {
    method: 'POST',
    headers: requireAdminSessionHeaders(entry, {
      origin: servers.adminUrl,
      includeCsrf: true,
      contentType: 'application/json',
    }),
    body: JSON.stringify({ code }),
  });
  updateSessionFromResponse(entry, verifyRes);
  if (!verifyRes.ok) {
    adminOtpSecrets.delete(`${servers.adminUrl}|${admin.email}`);
    await getAdminSession(servers, admin);
    await completeAdminOtpForPage(page, servers, admin);
    return;
  }
}

async function ensureAdminOtpVerified(
  servers: TestServers,
  admin: { email: string; password: string },
  entry: AdminSessionCacheEntry,
  cacheKey: string
): Promise<void> {
  const sessionRes = await fetch(`${servers.adminUrl}/admin/session`, {
    headers: requireAdminSessionHeaders(entry, {
      origin: servers.adminUrl,
    }),
  });
  if (!sessionRes.ok) {
    throw new Error(`admin session read failed: ${sessionRes.status}`);
  }
  const session = await sessionRes.json() as {
    otpRequired?: boolean;
    otpVerified?: boolean;
  };
  if (!session.otpRequired || session.otpVerified) return;

  let secret = adminOtpSecrets.get(cacheKey);
  if (!secret) {
    secret = await initAdminOtpSecret(servers, admin, entry);
    const secretBuf = base32.decode(secret);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secretBuf, now, 30, 6, 'sha1');
    const verifyRes = await fetch(`${servers.adminUrl}/admin/otp/setup/verify`, {
      method: 'POST',
      headers: requireAdminSessionHeaders(entry, {
        origin: servers.adminUrl,
        includeCsrf: true,
        contentType: 'application/json',
      }),
      body: JSON.stringify({ code }),
    });
    if (!verifyRes.ok) {
      throw new Error(`admin otp setup verify failed: ${verifyRes.status}`);
    }
    updateSessionFromResponse(entry, verifyRes);
  } else {
    const secretBuf = base32.decode(secret);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secretBuf, now, 30, 6, 'sha1');
    const verifyRes = await fetch(`${servers.adminUrl}/admin/otp/verify`, {
      method: 'POST',
      headers: requireAdminSessionHeaders(entry, {
        origin: servers.adminUrl,
        includeCsrf: true,
        contentType: 'application/json',
      }),
      body: JSON.stringify({ code }),
    });
    if (!verifyRes.ok) {
      adminOtpSecrets.delete(cacheKey);
      await ensureAdminOtpVerified(servers, admin, entry, cacheKey);
      return;
    }
    updateSessionFromResponse(entry, verifyRes);
  }
  const confirmRes = await fetch(`${servers.adminUrl}/admin/session`, {
    headers: requireAdminSessionHeaders(entry, {
      origin: servers.adminUrl,
    }),
  });
  if (!confirmRes.ok) {
    throw new Error(`admin session confirm failed: ${confirmRes.status}`);
  }
  const confirmJson = await confirmRes.json() as { otpVerified?: boolean };
  if (!confirmJson.otpVerified) {
    throw new Error('admin otp verification did not complete');
  }
}

export async function registerUser(servers: TestServers, user: BasicUser): Promise<void> {
  const regClient = new OpaqueClient();
  await regClient.initialize();
  const regStart = await regClient.startRegistration(user.password, user.email);
  const startRes = await fetch(`${servers.userUrl}/api/user/opaque/register/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)), email: user.email })
  });
  if (!startRes.ok) throw new Error(`register start failed: ${startRes.status}`);
  const startJson = await startRes.json();
  const regFinish = await regClient.finishRegistration(
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
  const startRes = await context.request.post(`${servers.userUrl}/api/user/opaque/login/start`, {
    headers: { 'Content-Type': 'application/json', Origin: servers.userUrl },
    data: JSON.stringify({ email: user.email, request: toBase64Url(Buffer.from(loginStart.request)) })
  });
  if (!startRes.ok()) throw new Error(`login start failed: ${startRes.status()}`);
  const startJson = await startRes.json();
  const loginFinish = await client.finishLogin(
    fromBase64Url(startJson.message),
    loginStart.state,
    new Uint8Array(),
    'DarkAuth',
    user.email
  );
  const finishRes = await context.request.post(`${servers.userUrl}/api/user/opaque/login/finish`, {
    headers: { 'Content-Type': 'application/json', Origin: servers.userUrl },
    data: JSON.stringify({ finish: toBase64Url(Buffer.from(loginFinish.finish)), sessionId: startJson.sessionId })
  });
  if (!finishRes.ok()) throw new Error(`login finish failed: ${finishRes.status()}`);
}

export async function createUserViaAdmin(
  servers: TestServers,
  admin: { email: string; password: string },
  user: BasicUser
): Promise<{ sub: string }> {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  let session = await getAdminSession(servers, admin);

  let createRes = await fetch(`${servers.adminUrl}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookieHeader,
      Origin: servers.adminUrl,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({ email: user.email, name: user.name })
  });
  if (createRes.status === 401) {
    adminSessionCache.delete(cacheKey);
    session = await getAdminSession(servers, admin);
    createRes = await fetch(`${servers.adminUrl}/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({ email: user.email, name: user.name })
    });
  }
  if (!createRes.ok) throw new Error(`create user failed: ${createRes.status}`);
  const created = await createRes.json();
  const sub = created.sub as string;

  const regClient = new OpaqueClient();
  await regClient.initialize();
  const regStart = await regClient.startRegistration(user.password, user.email);
  const setStartRes = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/password/set/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookieHeader,
      Origin: servers.adminUrl,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)) })
  });
  if (!setStartRes.ok) throw new Error(`password set start failed: ${setStartRes.status}`);
  const setStartJson = await setStartRes.json();
  const regFinish = await regClient.finishRegistration(
    fromBase64Url(setStartJson.message),
    regStart.state,
    fromBase64Url(setStartJson.serverPublicKey),
    'DarkAuth',
    setStartJson.identityU
  );
  const exportKeyHash = sha256Base64Url(Buffer.from(regFinish.export_key));
  const setFinishRes = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/password/set/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookieHeader,
      Origin: servers.adminUrl,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({
      record: toBase64Url(Buffer.from(regFinish.upload)),
      export_key_hash: exportKeyHash
    })
  });
  if (!setFinishRes.ok) throw new Error(`password set finish failed: ${setFinishRes.status}`);
  return { sub };
}

export async function setUserPasswordViaAdmin(
  servers: TestServers,
  admin: { email: string; password: string },
  user: { sub: string; email: string; password: string }
): Promise<void> {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  let session = await getAdminSession(servers, admin);

  const regClient = new OpaqueClient();
  await regClient.initialize();
  const regStart = await regClient.startRegistration(user.password, user.email);
  let setStartRes = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(user.sub)}/password/set/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookieHeader,
      Origin: servers.adminUrl,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)) })
  });
  if (setStartRes.status === 401) {
    adminSessionCache.delete(cacheKey);
    session = await getAdminSession(servers, admin);
    setStartRes = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(user.sub)}/password/set/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)) })
    });
  }
  if (!setStartRes.ok) throw new Error(`password set start failed: ${setStartRes.status}`);
  const setStartJson = await setStartRes.json();
  const regFinish = await regClient.finishRegistration(
    fromBase64Url(setStartJson.message),
    regStart.state,
    fromBase64Url(setStartJson.serverPublicKey),
    'DarkAuth',
    setStartJson.identityU
  );
  const exportKeyHash = sha256Base64Url(Buffer.from(regFinish.export_key));
  const setFinishRes = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(user.sub)}/password/set/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookieHeader,
      Origin: servers.adminUrl,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({
      record: toBase64Url(Buffer.from(regFinish.upload)),
      export_key_hash: exportKeyHash
    })
  });
  if (!setFinishRes.ok) throw new Error(`password set finish failed: ${setFinishRes.status}`);
}

export async function createAdminUserViaAdmin(
  servers: TestServers,
  admin: { email: string; password: string },
  newAdmin: { email: string; password: string; name: string; role: 'read' | 'write' }
): Promise<{ id: string }> {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  let session = await getAdminSession(servers, admin);

  let createRes = await fetch(`${servers.adminUrl}/admin/admin-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: session.cookieHeader,
      Origin: servers.adminUrl,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({ email: newAdmin.email, name: newAdmin.name, role: newAdmin.role }),
  });
  if (createRes.status === 401) {
    adminSessionCache.delete(cacheKey);
    session = await getAdminSession(servers, admin);
    createRes = await fetch(`${servers.adminUrl}/admin/admin-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({ email: newAdmin.email, name: newAdmin.name, role: newAdmin.role }),
    });
  }
  if (!createRes.ok) throw new Error(`create admin failed: ${createRes.status}`);
  const created = await createRes.json();
  const adminId = typeof created === 'object' && created && 'id' in created ? (created as { id: string }).id : null;
  if (!adminId) {
    throw new Error(`unexpected admin create response`);
  }

  const regClient = new OpaqueClient();
  await regClient.initialize();
  const regStart = await regClient.startRegistration(newAdmin.password, newAdmin.email);
  let setStartRes = await fetch(
    `${servers.adminUrl}/admin/admin-users/${encodeURIComponent(adminId)}/password/set/start`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)) }),
    }
  );
  if (setStartRes.status === 401) {
    adminSessionCache.delete(cacheKey);
    session = await getAdminSession(servers, admin);
    setStartRes = await fetch(
      `${servers.adminUrl}/admin/admin-users/${encodeURIComponent(adminId)}/password/set/start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: session.cookieHeader,
          Origin: servers.adminUrl,
          'x-csrf-token': session.csrfToken,
        },
        body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)) }),
      }
    );
  }
  if (!setStartRes.ok) {
    const errorText = await setStartRes.text().catch(() => '');
    throw new Error(`admin password set start failed: ${setStartRes.status} ${errorText}`);
  }
  const setStartJson = await setStartRes.json();
  const regFinish = await regClient.finishRegistration(
    fromBase64Url(setStartJson.message),
    regStart.state,
    fromBase64Url(setStartJson.serverPublicKey),
    'DarkAuth',
    setStartJson.identityU
  );
  const exportKeyHash = sha256Base64Url(Buffer.from(regFinish.export_key));
  let setFinishRes = await fetch(
    `${servers.adminUrl}/admin/admin-users/${encodeURIComponent(adminId)}/password/set/finish`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({
        record: toBase64Url(Buffer.from(regFinish.upload)),
        export_key_hash: exportKeyHash,
      }),
    }
  );
  if (setFinishRes.status === 401) {
    adminSessionCache.delete(cacheKey);
    session = await getAdminSession(servers, admin);
    setFinishRes = await fetch(
      `${servers.adminUrl}/admin/admin-users/${encodeURIComponent(adminId)}/password/set/finish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: session.cookieHeader,
          Origin: servers.adminUrl,
          'x-csrf-token': session.csrfToken,
        },
        body: JSON.stringify({
          record: toBase64Url(Buffer.from(regFinish.upload)),
          export_key_hash: exportKeyHash,
        }),
      }
    );
  }
  if (!setFinishRes.ok) {
    const errorText = await setFinishRes.text().catch(() => '');
    throw new Error(`admin password set finish failed: ${setFinishRes.status} ${errorText}`);
  }
  return { id: adminId };
}

export async function establishAdminSession(
  context: BrowserContext,
  servers: TestServers,
  admin: { email: string; password: string }
): Promise<void> {
  const cacheKey = `${servers.adminUrl}|${admin.email}`;
  await getAdminSession(servers, admin);
  const cached = adminSessionCache.get(cacheKey);
  if (cached?.cookies?.length) {
    const url = new URL(servers.adminUrl);
    await context.addCookies(
      cached.cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: url.hostname,
        path: '/',
        secure: true,
        httpOnly: cookie.name === '__Host-DarkAuth-Admin',
        sameSite: 'Lax',
      }))
    );
  }

  const page = await context.newPage();
  await page.goto(`${servers.adminUrl}/`);
  const emailField = page.locator('input[name="email"], input[type="email"]').first();
  const dashboardHeading = page.getByRole('heading', { name: 'Admin Dashboard', exact: true });
  const dashboardVisible = await dashboardHeading.isVisible({ timeout: 3000 }).catch(() => false);
  if (dashboardVisible || /\/dashboard/.test(page.url())) {
    await page.close();
    return;
  }

  let isLoginPage = await emailField.isVisible({ timeout: 10000 }).catch(() => false);
  let isOtpPage = /\/otp(?:\/setup|\/verify)?/.test(page.url());

  if (!isLoginPage && !isOtpPage) {
    await page.goto(`${servers.adminUrl}/login`);
    isLoginPage = await emailField.isVisible({ timeout: 10000 }).catch(() => false);
    isOtpPage = /\/otp(?:\/setup|\/verify)?/.test(page.url());
  }

  if (isLoginPage) {
    await emailField.fill(admin.email);
    await page.fill('input[name="password"], input[type="password"]', admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(otp(?:\/setup|\/verify)?|dashboard|login)/, { timeout: 8000 }).catch(() => {});
  }

  const getCsrf = async () => {
    const cookies = await context.cookies(servers.adminUrl);
    return cookies.find((cookie) => cookie.name === '__Host-DarkAuth-Admin-Csrf')?.value;
  };

  if (/\/otp(?:\/setup|\/verify)?/.test(page.url())) {
    let secret = adminOtpSecrets.get(cacheKey);
    const csrfToken = await getCsrf();
    if (!csrfToken) throw new Error('admin csrf cookie missing');
    let verified = false;
    if (secret) {
      const code = totp(base32.decode(secret), Math.floor(Date.now() / 1000), 30, 6, 'sha1').code;
      const verifyRes = await page.request.post(`${servers.adminUrl}/admin/otp/verify`, {
        headers: {
          Origin: servers.adminUrl,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        data: JSON.stringify({ code }),
      });
      if (verifyRes.ok()) {
        verified = true;
      } else {
        adminOtpSecrets.delete(cacheKey);
        secret = undefined;
      }
    }
    if (!verified && !secret) {
      const initRes = await page.request.post(`${servers.adminUrl}/admin/otp/setup/init`, {
        headers: {
          Origin: servers.adminUrl,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
      });
      if (!initRes.ok()) throw new Error(`admin otp setup init failed: ${initRes.status()}`);
      const initJson = await initRes.json() as { secret: string };
      secret = initJson.secret;
      adminOtpSecrets.set(cacheKey, secret);
      const code = totp(base32.decode(secret), Math.floor(Date.now() / 1000), 30, 6, 'sha1').code;
      const csrfAfterInit = await getCsrf();
      const verifyRes = await page.request.post(`${servers.adminUrl}/admin/otp/setup/verify`, {
        headers: {
          Origin: servers.adminUrl,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfAfterInit || csrfToken,
        },
        data: JSON.stringify({ code }),
      });
      if (!verifyRes.ok()) throw new Error(`admin otp setup verify failed: ${verifyRes.status()}`);
    }
  }

  await page.goto(`${servers.adminUrl}/`);
  await page.waitForURL(/\/dashboard/, { timeout: 8000 }).catch(() => {});
  const finalDashboardVisible = await dashboardHeading.isVisible({ timeout: 5000 }).catch(() => false);
  if (!finalDashboardVisible && !/\/dashboard/.test(page.url())) {
    throw new Error(`admin dashboard not reachable after session establish: ${page.url()}`);
  }
  await page.close();
}
