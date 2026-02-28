import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { getAdminSession, createAdminUserViaAdmin } from '../../../setup/helpers/auth.js';
import { ensureAdminDashboard, createSecondaryAdmin } from '../../../setup/helpers/admin.js';

test.describe('Admin - Organizations Default', () => {
  let servers: TestServers;

  let adminCred = { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password };

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-groups-default' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    const secondary = await createSecondaryAdmin();
    await createAdminUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      { ...secondary, role: 'write' }
    );
    adminCred = { email: secondary.email, password: secondary.password };
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('Default organization exists and can be opened from UI', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    await page.click('a[href="/organizations"]');
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible();
    const defaultRow = page
      .locator('tbody tr', { has: page.locator('code', { hasText: 'default' }) })
      .first();
    await expect(defaultRow).toBeVisible();
    await defaultRow.locator('button', { hasText: 'Default' }).click();
    await expect(page.getByRole('heading', { name: 'Manage Organization', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  });

  test('Default organization exists via API', async () => {
    const adminSession = await getAdminSession(servers, adminCred);
    const res = await fetch(`${servers.adminUrl}/admin/organizations`, {
      headers: { Cookie: adminSession.cookieHeader, Origin: servers.adminUrl }
    });
    expect(res.ok).toBeTruthy();
    const json = await res.json() as { organizations: Array<{ slug: string }> };
    const def = json.organizations.find(org => org.slug === 'default');
    expect(def).toBeTruthy();
  });
});
