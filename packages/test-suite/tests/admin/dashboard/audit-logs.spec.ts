import { test, expect } from '@playwright/test';
import { createTestDatabase, destroyTestDatabase } from '../../../setup/database.js';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth, injectInstallToken } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Admin Dashboard - Audit Logs Widget', () => {
  let dbName: string;
  let servers: TestServers;

  test.beforeAll(async () => {
    dbName = await createTestDatabase();
    servers = await createTestServers({ dbName });
    const installToken = generateRandomString(32);
    injectInstallToken(servers.context, installToken);
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      secureMode: false,
      installToken
    });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
    if (dbName) await destroyTestDatabase(dbName);
  });

  test('shows Admin Login in Recent Activity', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Recent Activity')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/Admin Login/i)).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: /View All/i })).toBeVisible();
  });
});
