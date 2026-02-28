import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin } from '../../setup/helpers/auth.js';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { fromBase64Url, toBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';

async function loginFinishExpect(servers: TestServers, email: string, password: string, expectOk: boolean) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const startRes = await fetch(`${servers.userUrl}/api/user/opaque/login/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request)) })
  });
  expect(startRes.ok).toBeTruthy();
  const startJson = await startRes.json();
  const fin = await client.finishLogin(fromBase64Url(startJson.message), start.state, new Uint8Array(), 'DarkAuth', email);
  const finRes = await fetch(`${servers.userUrl}/api/user/opaque/login/finish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(fin.finish)), sessionId: startJson.sessionId })
  });
  if (expectOk) {
    expect(finRes.ok).toBeTruthy();
  } else {
    expect(finRes.status).toBe(403);
    const j = await finRes.json();
    expect(j && j.code === 'USER_LOGIN_NOT_ALLOWED').toBeTruthy();
  }
}

test.describe('Security - Login gating by group enableLogin', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'security-login-gating' });
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

  test('user can/cannot login depending on group enableLogin', async () => {
    const user = { email: `gating-${Date.now()}@example.com`, password: 'Passw0rd!gating', name: 'Gate User' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);

    await loginFinishExpect(servers, user.email, user.password, true);

    const tokenRes = await fetch(`${servers.adminUrl}/admin/opaque/login/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': servers.adminUrl }, body: JSON.stringify({ email: FIXED_TEST_ADMIN.email, request: toBase64Url(Buffer.from((await (new OpaqueClient().initialize(), new OpaqueClient().startLogin(FIXED_TEST_ADMIN.password, FIXED_TEST_ADMIN.email))).request)) }) });
    expect(tokenRes.ok).toBeTruthy();
    // For API calls, use helper instead of duplicating OPAQUE again
    const { getAdminSession } = await import('../../setup/helpers/auth.js');
    const adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });

    // Disable default group
    const putOff = await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({ enableLogin: false })
    });
    expect(putOff.ok).toBeTruthy();

    await loginFinishExpect(servers, user.email, user.password, false);

    // Re-enable
    const putOn = await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({ enableLogin: true })
    });
    expect(putOn.ok).toBeTruthy();

    await loginFinishExpect(servers, user.email, user.password, true);
  });
});
