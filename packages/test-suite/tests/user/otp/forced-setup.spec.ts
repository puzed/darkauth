import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { createUserViaAdmin, getAdminBearerToken } from '../../../setup/helpers/auth.js';

test.describe('User - OTP - Forced setup UI', () => {
  let servers: TestServers;
  let adminToken: string;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-otp-ui-forced-setup' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    adminToken = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
    await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ requireOtp: true })
    });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('When required and not configured, login redirects to /otp/setup?forced=1', async ({ page }) => {
    const user = { email: `otp-ui-${Date.now()}@example.com`, name: 'OTP UI', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);

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

