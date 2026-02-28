import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from '../../../setup/helpers/auth.js';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';

function readSetCookieValues(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headersWithSetCookie.getSetCookie === 'function') return headersWithSetCookie.getSetCookie()
  const raw = response.headers.get('set-cookie')
  if (!raw) return []
  return raw.split(/,(?=\s*__Host-)/g)
}

async function opaqueLogin(userUrl: string, email: string, password: string) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const resStart = await fetch(`${userUrl}/api/user/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request)) })
  });
  const startJson = await resStart.json();
  const finish = await client.finishLogin(fromBase64Url(startJson.message), start.state, new Uint8Array(), 'DarkAuth', email);
  const resFinish = await fetch(`${userUrl}/api/user/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(finish.finish)), sessionId: startJson.sessionId })
  });
  const cookies = readSetCookieValues(resFinish)
    .map((line) => line.split(';')[0]?.trim())
    .filter((line): line is string => !!line);
  const authCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User='));
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User-Csrf='));
  if (!authCookie || !csrfCookie) throw new Error('missing session cookies');
  return {
    cookieHeader: [authCookie, csrfCookie].join('; '),
    csrfToken: decodeURIComponent(csrfCookie.slice('__Host-DarkAuth-User-Csrf='.length)),
  };
}

test.describe('User - OTP - Forced verify UI', () => {
  let servers: TestServers;
  let adminSession: { cookieHeader: string; csrfToken: string };

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-otp-ui-forced-verify' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });
    await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({ requireOtp: true })
    });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('When required and setup is pending, login redirects to /otp/setup?forced=1', async ({ page }) => {
    const user = { email: `otp-ui-${Date.now()}@example.com`, name: 'OTP UI', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);

    const session = await opaqueLogin(servers.userUrl, user.email, user.password);
    const initRes = await fetch(`${servers.userUrl}/otp/setup/init`, {
      method: 'POST',
      headers: {
        Cookie: session.cookieHeader,
        Origin: servers.userUrl,
        'x-csrf-token': session.csrfToken,
      }
    });
    expect(initRes.ok).toBeTruthy();

    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');

    await page.waitForURL(/\/otp\/setup/i, { timeout: 10000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe('/otp/setup');
    expect(url.searchParams.get('forced')).toBe('1');
  });
});
