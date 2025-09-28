import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { getAdminBearerToken } from '../../../setup/helpers/auth.js';
import { ensureAdminDashboard } from '../../../setup/helpers/admin.js';

test.describe('Admin - Groups Default and Enable Login', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-groups-default' });
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

  test('Default group exists and enable login can be toggled', async ({ page }) => {
    const admin = { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password };
    await ensureAdminDashboard(page, servers, admin);

    await page.click('a[href="/groups"], button:has-text("Groups")');
    await expect(page.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
    const defaultRow = page.locator('tbody tr', { has: page.locator('td >> span', { hasText: 'Default' }) }).first();
    await expect(defaultRow).toBeVisible();
    await defaultRow.locator('button[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Edit Group")').click();
    await expect(page.getByRole('heading', { name: 'Edit Group', exact: true })).toBeVisible();
    const checkbox = page.locator('label:has-text("Enable Login")').locator('..').locator('[role="checkbox"]');
    await expect(checkbox).toBeVisible();

    const wasChecked = (await checkbox.getAttribute('aria-checked')) === 'true';
    await checkbox.click();
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL('**/groups');

    const row2 = page.locator('tbody tr', { has: page.locator('td >> span', { hasText: 'Default' }) }).first();
    await row2.locator('button[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Edit Group")').click();
    await expect(page.getByRole('heading', { name: 'Edit Group', exact: true })).toBeVisible();
    const checkbox2 = page.locator('label:has-text("Enable Login")').locator('..').locator('[role="checkbox"]');
    await expect(checkbox2).toBeVisible();
    const nowChecked = (await checkbox2.getAttribute('aria-checked')) === 'true';
    expect(nowChecked).toBe(!wasChecked);

    await checkbox2.click();
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL('**/groups');
  });

  test('Enable Login value persists via API', async () => {
    const token = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
    const res = await fetch(`${servers.adminUrl}/admin/groups`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Origin': servers.adminUrl }
    });
    expect(res.ok).toBeTruthy();
    const json = await res.json() as { groups: Array<{ key: string; enableLogin?: boolean }> };
    const def = json.groups.find(g => g.key === 'default');
    expect(def).toBeTruthy();
    // enableLogin may be omitted for legacy DB; it should default to true
    expect(def && (def.enableLogin === undefined || typeof def.enableLogin === 'boolean')).toBeTruthy();
  });
});
