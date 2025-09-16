import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminBearerToken } from '../../setup/helpers/auth.js';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';

test.describe('Auth - OTP verification gating (UI)', () => {
  let servers: TestServers;
  let adminToken: string;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-otp-verify-gating-ui' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    adminToken = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

test('Redirects to OTP setup, then verify completes flow', async ({ page }) => {
    await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ requireOtp: true })
    });

    const user = { email: `og-${Date.now()}@example.com`, name: 'OTP Gate', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/\/otp\/setup/i, { timeout: 10000 });
    const url1 = new URL(page.url());
    expect(url1.pathname).toBe('/otp/setup');
    expect(url1.searchParams.get('forced')).toBe('1');

    await page.getByRole('button', { name: /show secret/i }).click();
    const secretText = await page.locator('text=/^[A-Z2-7]{16,}$/').first().textContent();
    const secret = base32.decode(secretText!);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');
    await page.fill('input[placeholder="123456"]', code);
    await page.getByRole('button', { name: /^Verify$/i }).click();
    await page.getByText('Backup Codes').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await page.waitForURL(/dashboard/i, { timeout: 10000 });
  });
});
