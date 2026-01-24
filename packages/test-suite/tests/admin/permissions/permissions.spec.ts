import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { getAdminBearerToken, createAdminUserViaAdmin } from '../../../setup/helpers/auth.js';
import { ensureAdminDashboard, createSecondaryAdmin } from '../../../setup/helpers/admin.js';

// Run tests serially within this file to maintain state
test.describe.configure({ mode: 'serial' });

test.describe('Admin - Permissions Management', () => {
  let servers: TestServers;
  let adminCred = { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password };

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
    const token = await getAdminBearerToken(servers, adminCred);

    const createRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json'
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
    const token = await getAdminBearerToken(servers, adminCred);

    const res = await fetch(`${servers.adminUrl}/admin/permissions`, {
      headers: {
        'Authorization': `Bearer ${token}`,
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
    const token = await getAdminBearerToken(servers, adminCred);

    const createRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: 'api:test:read',
        description: 'Duplicate permission'
      })
    });

    expect(createRes.status).toBe(409);
  });

  test('Can assign permissions to a group via API', async () => {
    const token = await getAdminBearerToken(servers, adminCred);

    // Create another permission
    const createRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: 'api:test:write',
        description: 'Test permission for writing'
      })
    });
    expect(createRes.ok).toBeTruthy();

    // Update the default group with permissions
    const updateRes = await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        permissionKeys: ['api:test:read', 'api:test:write']
      })
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error('Group update failed:', updateRes.status, errorText);
    }
    expect(updateRes.ok).toBeTruthy();
    const updated = await updateRes.json() as { success: boolean; permissions?: Array<{ key: string }> };
    expect(updated.success).toBeTruthy();
    expect(updated.permissions).toBeDefined();
    expect(updated.permissions?.length).toBe(2);
  });

  test('Can get group with permissions via API', async () => {
    const token = await getAdminBearerToken(servers, adminCred);

    const res = await fetch(`${servers.adminUrl}/admin/groups/default`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl
      }
    });

    expect(res.ok).toBeTruthy();
    const group = await res.json() as {
      key: string;
      name: string;
      permissions: Array<{ key: string; description: string }>;
      permissionCount: number;
    };

    expect(group.key).toBe('default');
    expect(group.permissions).toBeDefined();
    expect(Array.isArray(group.permissions)).toBeTruthy();
    expect(group.permissions.length).toBe(2);
    expect(group.permissionCount).toBe(2);
  });

  test('Can delete a permission via API', async () => {
    const token = await getAdminBearerToken(servers, adminCred);

    // Create a permission to delete
    await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl,
        'Content-Type': 'application/json'
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
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl
      }
    });

    expect(deleteRes.ok).toBeTruthy();

    // Verify it's gone
    const listRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      headers: {
        'Authorization': `Bearer ${token}`,
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

  test('Permissions appear on group edit page', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    // Navigate to groups
    await page.click('a[href="/groups"]');
    await expect(page.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();

    // Edit the default group
    const defaultRow = page.locator('tbody tr', { has: page.locator('td >> span', { hasText: 'Default' }) }).first();
    await expect(defaultRow).toBeVisible();
    await defaultRow.locator('button[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Edit Group")').click();

    // Check that permissions section shows permissions
    await expect(page.getByRole('heading', { name: 'Permissions', exact: true })).toBeVisible();

    // Should see the permissions we created
    await expect(page.locator('label', { hasText: 'api:test:read' })).toBeVisible();
    await expect(page.locator('label', { hasText: 'api:test:write' })).toBeVisible();
  });

  test('Can toggle permissions on group edit page', async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);

    // Navigate to groups and edit default
    await page.click('a[href="/groups"]');
    const defaultRow = page.locator('tbody tr', { has: page.locator('td >> span', { hasText: 'Default' }) }).first();
    await defaultRow.locator('button[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Edit Group")').click();

    // Find a permission checkbox and toggle it
    const permCheckbox = page.locator(`#permission-ui\\:test\\:permission`);
    await expect(permCheckbox).toBeVisible();

    const wasChecked = (await permCheckbox.getAttribute('aria-checked')) === 'true';
    await permCheckbox.click();

    // Save changes
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL('**/groups');

    // Go back and verify the change persisted
    const row2 = page.locator('tbody tr', { has: page.locator('td >> span', { hasText: 'Default' }) }).first();
    await row2.locator('button[aria-label="Actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Edit Group")').click();

    const permCheckbox2 = page.locator(`#permission-ui\\:test\\:permission`);
    const nowChecked = (await permCheckbox2.getAttribute('aria-checked')) === 'true';
    expect(nowChecked).toBe(!wasChecked);
  });
});
