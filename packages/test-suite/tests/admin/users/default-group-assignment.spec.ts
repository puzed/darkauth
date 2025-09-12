import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { createUserViaAdmin, getAdminBearerToken } from '../../../setup/helpers/auth.js';

test.describe('Admin - Default group assignment', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-default-group-assignment' });
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

  test('new users get Default group automatically', async () => {
    const user = { email: `auto-default-${Date.now()}@example.com`, password: 'Passw0rd!auto', name: 'Auto Default' };
    const { sub } = await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);

    const token = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
    const res = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/groups`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Origin': servers.adminUrl }
    });
    expect(res.ok).toBeTruthy();
    const json = await res.json() as { userGroups: Array<{ key: string }> };
    const keys = json.userGroups.map(g => g.key);
    expect(keys).toContain('default');
  });
});

