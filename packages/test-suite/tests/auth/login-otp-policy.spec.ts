import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js';
import {
  getDefaultOrganizationId,
  setOrganizationForceOtp,
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
  return (await resFinish.json()) as { accessToken: string; otpRequired?: boolean };
}

test.describe('Auth - Login OTP Policy', () => {
  let servers: TestServers;
  let adminSession: { cookieHeader: string; csrfToken: string };
  let defaultOrganizationId: string;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'auth-login-otp-policy' });
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
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('User in force OTP organization gets otpRequired=true', async () => {
    await setOrganizationForceOtp(servers, adminSession, defaultOrganizationId, true);
    const user = { email: `u-${Date.now()}@example.com`, name: 'User A', password: 'Passw0rd!123' };
    await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const finish = await opaqueLoginFinish(servers.userUrl, user.email, user.password);
    expect(finish.otpRequired).toBe(true);
  });

  test('User in organization without force OTP gets otpRequired=false', async () => {
    await setOrganizationForceOtp(servers, adminSession, defaultOrganizationId, false);
    const user = { email: `b-${Date.now()}@example.com`, name: 'User B', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    const finish = await opaqueLoginFinish(servers.userUrl, user.email, user.password);
    expect(finish.otpRequired).toBe(false);
  });

  test('Force OTP applies to subsequent logins when enabled', async () => {
    await setOrganizationForceOtp(servers, adminSession, defaultOrganizationId, true);
    const user = { email: `c-${Date.now()}@example.com`, name: 'User C', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    const finish = await opaqueLoginFinish(servers.userUrl, user.email, user.password);
    expect(finish.otpRequired).toBe(true);
  });
});
