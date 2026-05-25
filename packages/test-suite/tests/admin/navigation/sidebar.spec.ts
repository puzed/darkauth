import { expect, test } from '@playwright/test';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { installDarkAuth } from '../../../setup/install.js';
import { ensureAdminDashboard } from '../../../setup/helpers/admin.js';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';

test.describe('Admin - Sidebar Navigation', () => {
  let servers: TestServers;

  const adminCred = {
    email: FIXED_TEST_ADMIN.email,
    password: FIXED_TEST_ADMIN.password,
  };

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-sidebar-navigation' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
  });

  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });

  test('shows grouped admin navigation with current version', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    await expect(page.locator('span[class*="versionBadge"]')).toHaveText(/^v\d+\.\d+\.\d+/);
    await expect(page.getByText('Admin Portal', { exact: true })).toBeVisible();

    const groups = page.locator('div[class*="navGroup"]').filter({ has: page.locator('a') });
    await expect(groups).toHaveCount(4);
    await expect(groups.nth(0)).toContainText(/Main[\s\S]*Dashboard/);
    await expect(groups.nth(1)).toContainText(/Identity[\s\S]*Users[\s\S]*Organizations[\s\S]*Roles[\s\S]*Permissions/);
    await expect(groups.nth(2)).toContainText(/OAuth[\s\S]*Clients[\s\S]*Signing Keys/);
    await expect(groups.nth(3)).toContainText(/Settings[\s\S]*Admin Users[\s\S]*Audit Logs[\s\S]*Branding[\s\S]*Email Templates[\s\S]*Settings/);

    await expect(page.getByRole('link', { name: 'Signing Keys' })).toHaveAttribute(
      'href',
      '/keys'
    );
    await expect(page.getByRole('link', { name: 'Email Templates' })).toHaveAttribute(
      'href',
      '/settings/email-templates'
    );
    await expect(page.getByRole('link', { name: 'Changelog' })).toHaveCount(0);
  });
});
