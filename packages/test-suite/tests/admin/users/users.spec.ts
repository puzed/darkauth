import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';

test.describe('Admin - Users', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-users' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
  });

  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
    await page.click('a[href="/users"], button:has-text("Users")');
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
    await expect(page.getByText('Manage user accounts and permissions')).toBeVisible();
  });

  test('can add a user from Users tab', async ({ page }) => {
    const email = `playwright-user-${Date.now()}@example.com`;
    const name = 'Playwright User';
    await page.getByRole('button', { name: 'Add User' }).click();
    await page.waitForURL('**/users/new', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Create User', exact: true })).toBeVisible();
    await page.fill('input#email, input[name="email"]', email);
    await page.fill('input#name, input[name="name"]', name);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Temporary Password')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await page.goto(`${servers.adminUrl}/users`);
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text=${email}`)).toBeVisible({ timeout: 15000 });
  });

  test('can delete a user from Users tab', async ({ page }) => {
    const email = `playwright-user-del-${Date.now()}@example.com`;
    const name = 'Delete Me';
    await page.getByRole('button', { name: 'Add User' }).click();
    await page.fill('input#email, input[name="email"]', email);
    await page.fill('input#name, input[name="name"]', name);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Temporary Password')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await page.goto(`${servers.adminUrl}/users`);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text=${email}`)).toBeVisible({ timeout: 15000 });
    const row = page.locator('table tr', { hasText: email }).first();
    await row.locator('button[aria-label="Actions"]').click();
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('div[role="menuitem"]:has-text("Delete User"), button:has-text("Delete User"), .text-destructive:has-text("Delete User")');
    await expect(page.locator(`text=${email}`)).toHaveCount(0, { timeout: 10000 });
  });
});
