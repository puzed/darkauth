import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

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

  test('lists Admin Login event after login', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /View All/i }).click();
    await expect(page).toHaveURL(/\/audit(\?|$|\/?)/);
    await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
    await expect(page.getByRole('table').getByText(/Admin Login/i)).toBeVisible();
  });
});

