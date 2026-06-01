import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { getAdminSession, createAdminUserViaAdmin } from '../../../setup/helpers/auth.js';
import { ensureAdminDashboard, createSecondaryAdmin } from '../../../setup/helpers/admin.js';

test.describe('Admin - Organizations', () => {
  let servers: TestServers;
  let adminCred = { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password };
  let organization: { id: string; name: string; slug: string };

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-organizations-default' });
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
    const adminSession = await getAdminSession(servers, adminCred);
    const slug = `playwright-org-${Date.now()}`;
    const res = await fetch(`${servers.adminUrl}/admin/organizations`, {
      method: 'POST',
      headers: {
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'Content-Type': 'application/json',
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({
        name: 'Playwright Organization',
        slug,
      }),
    });
    expect(res.ok).toBeTruthy();
    const created = await res.json() as {
      organization: { organizationId?: string; id?: string; name: string; slug: string };
    };
    const createdOrganization = created.organization;
    organization = {
      id: createdOrganization.organizationId || createdOrganization.id || '',
      name: createdOrganization.name,
      slug: createdOrganization.slug,
    };
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('created organization can be opened from UI', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    await page.click('a[href="/organizations"]');
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible();
    const organizationRow = page
      .locator('tbody tr', { has: page.locator('code', { hasText: organization.slug }) })
      .first();
    await expect(organizationRow).toBeVisible();
    await organizationRow.locator('button', { hasText: organization.name }).click();
    await expect(page.getByRole('heading', { name: 'Manage Organization', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  });

  test('created organization exists via API', async () => {
    const adminSession = await getAdminSession(servers, adminCred);
    const res = await fetch(`${servers.adminUrl}/admin/organizations`, {
      headers: { Cookie: adminSession.cookieHeader, Origin: servers.adminUrl }
    });
    expect(res.ok).toBeTruthy();
    const json = await res.json() as { organizations: Array<{ id?: string; organizationId?: string; slug: string }> };
    const found = json.organizations.find(org => org.slug === organization.slug);
    expect(found).toBeTruthy();
    expect(found?.organizationId || found?.id).toBe(organization.id);
  });
});
