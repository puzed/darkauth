import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from '../../../setup/helpers/auth.js';
import { getDefaultOrganizationId } from '../../../setup/helpers/rbac.js';

test.describe('Admin - Default organization membership', () => {
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

  test('new users get default organization membership automatically', async () => {
    const user = { email: `auto-default-${Date.now()}@example.com`, password: 'Passw0rd!auto', name: 'Auto Default' };
    const { sub } = await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);

    const adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });
    const defaultOrganizationId = await getDefaultOrganizationId(servers, adminSession);
    const res = await fetch(`${servers.adminUrl}/admin/organizations/${defaultOrganizationId}/members`, {
      headers: { Cookie: adminSession.cookieHeader, Origin: servers.adminUrl }
    });
    expect(res.ok).toBeTruthy();
    const json = await res.json() as { members: Array<{ userSub: string; status: string }> };
    const member = json.members.find((entry) => entry.userSub === sub);
    expect(member?.status).toBe('active');
  });
});
