import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { getAdminSession, createAdminUserViaAdmin } from '../../../setup/helpers/auth.js';
import { ensureAdminDashboard, createSecondaryAdmin } from '../../../setup/helpers/admin.js';

// Run tests serially within this file to maintain state
test.describe.configure({ mode: 'serial' });

test.describe('Admin - Permissions Management', () => {
  let servers: TestServers;
  let adminCred = { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password };
  let testRoleId = '';

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-permissions' });
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

  test('Can create a permission via API', async () => {
    const adminSession = await getAdminSession(servers, adminCred);

    const createRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json',
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({
        key: 'api:test:read',
        description: 'Test permission for reading'
      })
    });

    expect(createRes.ok).toBeTruthy();
    const created = await createRes.json() as { key: string; description: string };
    expect(created.key).toBe('api:test:read');
    expect(created.description).toBe('Test permission for reading');
  });

  test('Can list permissions via API', async () => {
    const adminSession = await getAdminSession(servers, adminCred);

    const res = await fetch(`${servers.adminUrl}/admin/permissions`, {
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl
      }
    });

    expect(res.ok).toBeTruthy();
    const json = await res.json() as { permissions: Array<{ key: string; description: string }> };
    expect(Array.isArray(json.permissions)).toBeTruthy();
    const testPerm = json.permissions.find(p => p.key === 'api:test:read');
    expect(testPerm).toBeTruthy();
  });

  test('Cannot create duplicate permission', async () => {
    const adminSession = await getAdminSession(servers, adminCred);

    const createRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json',
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({
        key: 'api:test:read',
        description: 'Duplicate permission'
      })
    });

    expect(createRes.status).toBe(409);
  });

  test('Can assign permissions to a role via API', async () => {
    const adminSession = await getAdminSession(servers, adminCred);

    // Create another permission
    const createRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json',
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({
        key: 'api:test:write',
        description: 'Test permission for writing'
      })
    });
    expect(createRes.ok).toBeTruthy();

    const roleRes = await fetch(`${servers.adminUrl}/admin/roles`, {
      method: 'POST',
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json',
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({
        key: 'api-test-role',
        name: 'API Test Role',
        permissionKeys: ['api:test:read', 'api:test:write']
      })
    });

    if (!roleRes.ok) {
      const errorText = await roleRes.text();
      console.error('Role create failed:', roleRes.status, errorText);
    }
    expect(roleRes.ok).toBeTruthy();
    const created = await roleRes.json() as { role: { id: string; permissionKeys: string[] } };
    testRoleId = created.role.id;
    expect(created.role.permissionKeys.length).toBe(2);
    expect(created.role.permissionKeys.includes('api:test:read')).toBeTruthy();
    expect(created.role.permissionKeys.includes('api:test:write')).toBeTruthy();
  });

  test('Can get role with permissions via API', async () => {
    const adminSession = await getAdminSession(servers, adminCred);

    const res = await fetch(`${servers.adminUrl}/admin/roles/${testRoleId}`, {
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl
      }
    });

    expect(res.ok).toBeTruthy();
    const payload = await res.json() as {
      role: {
        id: string;
        permissionKeys: string[];
      };
    };

    expect(payload.role.id).toBe(testRoleId);
    expect(Array.isArray(payload.role.permissionKeys)).toBeTruthy();
    expect(payload.role.permissionKeys.length).toBe(2);
    expect(payload.role.permissionKeys.includes('api:test:read')).toBeTruthy();
    expect(payload.role.permissionKeys.includes('api:test:write')).toBeTruthy();
  });

  test('Can delete a permission via API', async () => {
    const adminSession = await getAdminSession(servers, adminCred);

    // Create a permission to delete
    await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json',
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({
        key: 'api:test:delete',
        description: 'Permission to be deleted'
      })
    });

    // Delete it
    const deleteRes = await fetch(`${servers.adminUrl}/admin/permissions/api:test:delete`, {
      method: 'DELETE',
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl
      }
    });

    expect(deleteRes.ok).toBeTruthy();

    // Verify it's gone
    const listRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      headers: {
        Cookie: adminSession.cookieHeader,
        'Origin': servers.adminUrl
      }
    });
    const json = await listRes.json() as { permissions: Array<{ key: string }> };
    const deleted = json.permissions.find(p => p.key === 'api:test:delete');
    expect(deleted).toBeFalsy();
  });

  test('Can create permission via UI', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    // Navigate to permissions page
    await page.click('a[href="/permissions"]');
    await expect(page.getByRole('heading', { name: 'Permissions', exact: true })).toBeVisible();

    // Click create button
    await page.getByRole('button', { name: /create permission/i }).click();

    // Fill in the form
    await page.getByLabel(/permission key/i).fill('ui:test:permission');
    await page.getByLabel(/description/i).fill('Permission created via UI test');

    // Submit
    await page.getByRole('button', { name: /create permission/i }).last().click();

    // Verify it appears in the table
    await expect(page.locator('code', { hasText: 'ui:test:permission' })).toBeVisible();
  });

  test('Permissions appear on role edit page', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    await page.click('a[href="/roles"]');
    await expect(page.getByRole('heading', { name: 'Roles', exact: true })).toBeVisible();
    const roleRow = page.locator('tbody tr', {
      has: page.locator('td', { hasText: 'API Test Role' }),
    }).first();
    await expect(roleRow).toBeVisible();
    await roleRow.locator('button', { hasText: 'API Test Role' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Role', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Permissions', exact: true })).toBeVisible();
    await expect(page.locator('label', { hasText: 'api:test:read' })).toBeVisible();
    await expect(page.locator('label', { hasText: 'api:test:write' })).toBeVisible();
  });

  test('Can toggle permissions on role edit page', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    await page.click('a[href="/roles"]');
    const roleRow = page.locator('tbody tr', {
      has: page.locator('td', { hasText: 'API Test Role' }),
    }).first();
    await roleRow.locator('button', { hasText: 'API Test Role' }).click();
    const permCheckbox = page.locator(`#permission-ui\\:test\\:permission`);
    await expect(permCheckbox).toBeVisible();

    const wasChecked = (await permCheckbox.getAttribute('aria-checked')) === 'true';
    await permCheckbox.click();
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL('**/roles');

    const roleRow2 = page.locator('tbody tr', {
      has: page.locator('td', { hasText: 'API Test Role' }),
    }).first();
    await roleRow2.locator('button', { hasText: 'API Test Role' }).click();
    const permCheckbox2 = page.locator(`#permission-ui\\:test\\:permission`);
    const nowChecked = (await permCheckbox2.getAttribute('aria-checked')) === 'true';
    expect(nowChecked).toBe(!wasChecked);
  });
});
