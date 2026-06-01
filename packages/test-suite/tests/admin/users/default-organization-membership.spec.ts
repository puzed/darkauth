import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from '../../../setup/helpers/auth.js';
import { getOnlyOrganizationMembershipForUser } from '../../../setup/helpers/rbac.js';

test.describe('Admin - User organization assignment', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-default-organization-membership' });
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

  test('new users can be created with a personal organization membership', async () => {
    const user = {
      email: `personal-org-${Date.now()}@example.com`,
      password: 'Passw0rd!auto',
      name: 'Personal Organization User',
    };
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user,
      { createPersonalOrganization: true }
    );

    const adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });
    const membership = await getOnlyOrganizationMembershipForUser(servers, adminSession, sub);
    expect(membership.status).toBe('active');
  });
});
