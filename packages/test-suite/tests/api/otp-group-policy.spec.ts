import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js';
import {
  getDefaultOrganizationId,
  getOrganizationMemberIdForUser,
  getRoleIdByKey,
  setOrganizationMemberRoles,
} from '../../setup/helpers/rbac.js';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';

async function opaqueLoginFinish(userUrl: string, email: string, password: string) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const resStart = await fetch(`${userUrl}/api/user/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request)) }),
  });
  if (!resStart.ok) throw new Error(`login start ${resStart.status}`);
  const startJson = await resStart.json();
  const finish = await client.finishLogin(
    fromBase64Url(startJson.message),
    start.state,
    new Uint8Array(),
    'DarkAuth',
    email
  );
  const resFinish = await fetch(`${userUrl}/api/user/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(finish.finish)), sessionId: startJson.sessionId }),
  });
  if (!resFinish.ok) throw new Error(`login finish ${resFinish.status}`);
  return (await resFinish.json()) as { otpRequired?: boolean };
}

test.describe('API - OTP Role Policy', () => {
  let servers: TestServers;
  let adminSession: { cookieHeader: string; csrfToken: string };
  let defaultOrganizationId: string;
  let otpRequiredRoleId: string;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-otp-role-policy' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
    adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });
    defaultOrganizationId = await getDefaultOrganizationId(servers, adminSession);
    otpRequiredRoleId = await getRoleIdByKey(servers, adminSession, 'otp_required');
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('roles endpoint contains otp_required role', async () => {
    const res = await fetch(`${servers.adminUrl}/admin/roles`, {
      headers: { Cookie: adminSession.cookieHeader, Origin: servers.adminUrl },
    });
    expect(res.ok).toBeTruthy();
    const json = (await res.json()) as { roles: Array<{ key: string; id: string }> };
    const role = json.roles.find((item) => item.key === 'otp_required');
    expect(role?.id).toBeTruthy();
  });

  test('can assign otp_required role to a default organization member', async () => {
    const user = { email: `otp-role-${Date.now()}@example.com`, name: 'OTP Role User', password: 'Passw0rd!123' };
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const memberId = await getOrganizationMemberIdForUser(
      servers,
      adminSession,
      defaultOrganizationId,
      sub
    );
    await setOrganizationMemberRoles(
      servers,
      adminSession,
      defaultOrganizationId,
      memberId,
      [otpRequiredRoleId]
    );

    const membersRes = await fetch(`${servers.adminUrl}/admin/organizations/${defaultOrganizationId}/members`, {
      headers: { Cookie: adminSession.cookieHeader, Origin: servers.adminUrl },
    });
    expect(membersRes.ok).toBeTruthy();
    const membersJson = (await membersRes.json()) as {
      members: Array<{ userSub: string; roles: Array<{ id: string; key: string }> }>;
    };
    const member = membersJson.members.find((item) => item.userSub === sub);
    expect(member?.roles.some((role) => role.key === 'otp_required')).toBe(true);
  });

  test('otp.require_for_users=true enforces otpRequired on login', async () => {
    const putRes = await fetch(`${servers.adminUrl}/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({ key: 'otp', value: { require_for_users: true } }),
    });
    expect(putRes.ok).toBeTruthy();

    const user = { email: `otp-setting-${Date.now()}@example.com`, name: 'OTP Setting User', password: 'Passw0rd!123' };
    await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const login = await opaqueLoginFinish(servers.userUrl, user.email, user.password);
    expect(login.otpRequired).toBe(true);
  });
});
