import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { ensureAdminDashboard } from '../../../setup/helpers/admin.js';

test.describe('Admin Dashboard - Audit Logs Widget', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-dashboard-audit-logs' });
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

  test('shows Admin Login in Recent Activity', async ({ page, context }) => {
    const admin = { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password };
    await ensureAdminDashboard(page, context, servers, admin);
    await expect(page.getByText('Recent Activity')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/Admin Login/i)).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: /View All/i })).toBeVisible();
  });
});
