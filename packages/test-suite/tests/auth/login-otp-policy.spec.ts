import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminBearerToken } from '../../setup/helpers/auth.js';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';

async function opaqueLoginFinish(userUrl: string, email: string, password: string) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const resStart = await fetch(`${userUrl}/api/user/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request)) })
  });
  if (!resStart.ok) throw new Error(`login start ${resStart.status}`);
  const startJson = await resStart.json();
  const finish = await client.finishLogin(fromBase64Url(startJson.message), start.state, new Uint8Array(), 'DarkAuth', email);
  const resFinish = await fetch(`${userUrl}/api/user/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(finish.finish)), sessionId: startJson.sessionId })
  });
  if (!resFinish.ok) throw new Error(`login finish ${resFinish.status}`);
  return await resFinish.json() as { accessToken: string; otpRequired?: boolean };
}

test.describe('Auth - Login OTP Policy', () => {
  let servers: TestServers;
  let adminToken: string;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'auth-login-otp-policy' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    adminToken = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('User in default group with requireOtp=true gets otpRequired', async () => {
    await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ requireOtp: true })
    });

    const user = { email: `u-${Date.now()}@example.com`, name: 'User A', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    const finish = await opaqueLoginFinish(servers.userUrl, user.email, user.password);
    expect(finish.otpRequired).toBe(true);
  });

  test('User in non-OTP group only gets otpRequired=false', async () => {
    const key = `nog-${Date.now().toString(36)}`;
    await fetch(`${servers.adminUrl}/admin/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ key, name: 'No OTP', enableLogin: true, requireOtp: false })
    });

    const user = { email: `b-${Date.now()}@example.com`, name: 'User B', password: 'Passw0rd!123' };
    const { sub } = await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ groups: [key] })
    });
    const finish = await opaqueLoginFinish(servers.userUrl, user.email, user.password);
    expect(finish.otpRequired).toBe(false);
  });

  test('User in OTP group with enableLogin=false and a separate login-enabled non-OTP group gets otpRequired=false', async () => {
    const otpOffKey = `otp-${Date.now().toString(36)}`;
    const loginOnKey = `login-${Date.now().toString(36)}`;
    await fetch(`${servers.adminUrl}/admin/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ key: otpOffKey, name: 'OTP Off Login', enableLogin: false, requireOtp: true })
    });
    await fetch(`${servers.adminUrl}/admin/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ key: loginOnKey, name: 'Login Enabled No OTP', enableLogin: true, requireOtp: false })
    });
    const user = { email: `c-${Date.now()}@example.com`, name: 'User C', password: 'Passw0rd!123' };
    const { sub } = await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ groups: [otpOffKey, loginOnKey] })
    });
    const finish = await opaqueLoginFinish(servers.userUrl, user.email, user.password);
    expect(finish.otpRequired).toBe(false);
  });
});
