import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';
import { establishAdminSession, getAdminSession } from '../../setup/helpers/auth.js';

test.describe('Admin - OTP setup and verify (UI)', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-otp-setup-verify-ui' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('Admin can setup OTP and verify via UI', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/otp(?:\/(?:setup|verify))?(?:\?.*)?$/, { timeout: 15000 });
    await page.getByText('Two-Factor Authentication').waitFor({ state: 'visible', timeout: 10000 });
    const adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    });
    const initRes = await fetch(`${servers.adminUrl}/admin/otp/setup/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken,
      }
    });
    if (!initRes.ok) throw new Error(`OTP setup init failed: ${initRes.status}`);
    const initJson = await initRes.json() as { secret: string };
    const secret = base32.decode(initJson.secret);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');
    const verifyRes = await fetch(`${servers.adminUrl}/admin/otp/setup/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({ code })
    });
    if (!verifyRes.ok) throw new Error(`OTP setup verify failed: ${verifyRes.status}`);
    await establishAdminSession(page.context(), servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForURL(/\/$/, { timeout: 10000 });
  });
});
