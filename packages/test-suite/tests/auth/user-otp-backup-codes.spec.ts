import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminBearerToken, establishUserSession } from '../../setup/helpers/auth.js';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';

test.describe('Auth - User OTP backup codes (UI)', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-otp-backup-codes-ui' });
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

  test('Setup via UI shows backup codes; a code works on /otp/verify', async ({ page }) => {
    const user = { email: `bc-${Date.now()}@example.com`, name: 'Backup Codes', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/dashboard|^\/$/, { timeout: 10000 });

    await page.goto(`${servers.userUrl}/otp/setup`);
    await page.getByRole('button', { name: /show secret/i }).click();
    const secretText = await page.locator('text=/^[A-Z2-7]{16,}$/').first().textContent();
    expect(secretText && secretText.length >= 16).toBeTruthy();
    const secret = base32.decode(secretText!);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');
    await page.fill('input[placeholder="123456"]', code);
    await page.getByRole('button', { name: /^Verify$/i }).click();
    await page.getByText('Backup Codes').waitFor({ state: 'visible', timeout: 10000 });
    const backupCode = await page.locator('ul li').first().textContent();
    expect(backupCode && backupCode.includes('-')).toBeTruthy();

    const adminToken = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
    await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ requireOtp: true })
    });

    await page.context().clearCookies();
    await establishUserSession(page.context(), servers, { email: user.email, password: user.password });
    await page.goto(`${servers.userUrl}/otp/verify`);
    await page.waitForURL(/\/otp\/verify/i, { timeout: 15000 });

    await page.getByRole('button', { name: /use a backup code/i }).click();
    await page.fill('input[placeholder="1234-5678-9ABC"]', backupCode!.trim());
    await page.getByRole('button', { name: /^Verify$/i }).click();
    await page.waitForURL(/dashboard/i, { timeout: 10000 });
  });
});
