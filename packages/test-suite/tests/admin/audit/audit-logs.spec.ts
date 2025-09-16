import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { establishAdminSession, completeAdminOtpForPage } from '../../../setup/helpers/auth.js';

test.describe('Admin Audit Logs - List', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-audit-logs' });
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

  test('lists Admin Login event after login', async ({ page, context }) => {
    await page.goto(`${servers.adminUrl}/`);
    try {
      await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email, { timeout: 3000 });
      await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
      await page.click('button[type="submit"], button:has-text("Sign In")');
      await page.waitForURL(/\/otp(?:\/.+)?(?:\?.*)?$/, { timeout: 15000 }).catch(() => {});
    } catch {
      await establishAdminSession(context, servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
      await page.goto(`${servers.adminUrl}/`);
    }
    if (page.url().includes('/otp')) {
      await page.waitForFunction(() => window.localStorage.getItem('adminAccessToken'), undefined, { timeout: 10000 });
      await completeAdminOtpForPage(page, servers, {
        email: FIXED_TEST_ADMIN.email,
        password: FIXED_TEST_ADMIN.password
      });
      await page.goto(`${servers.adminUrl}/`);
    }
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /View All/i }).click();
    await expect(page).toHaveURL(/\/audit(\?|$|\/?)/);
    await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
    await expect(page.getByRole('table').getByText(/Admin Login/i)).toBeVisible();
  });
});
