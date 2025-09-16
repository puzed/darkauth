import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';
import { disableAdminOtp } from '../../setup/helpers/auth.js';

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
    await disableAdminOtp(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
    await page.goto(`${servers.adminUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/otp(?:\/(?:setup|verify))?(?:\?.*)?$/, { timeout: 15000 });
    await page.getByText('Two-Factor Authentication').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => window.localStorage.getItem('adminAccessToken'), undefined, { timeout: 10000 });
    const provisioningText = await page
      .locator('text=/^otpauth:\/\//')
      .first()
      .innerText();
    if (!provisioningText) throw new Error('Provisioning URI missing');
    const match = provisioningText.match(/secret=([^&]+)/);
    if (!match) throw new Error('Secret not found in provisioning URI');
    const secret = base32.decode(match[1]!);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');
    const accessToken = await page.evaluate(() => window.localStorage.getItem('adminAccessToken'));
    if (!accessToken) throw new Error('Admin access token missing');
    const verifyRes = await fetch(`${servers.adminUrl}/admin/otp/setup/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Origin: servers.adminUrl
      },
      body: JSON.stringify({ code })
    });
    if (!verifyRes.ok) throw new Error(`OTP setup verify failed: ${verifyRes.status}`);
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForURL(/\/$/, { timeout: 10000 });
  });
});
