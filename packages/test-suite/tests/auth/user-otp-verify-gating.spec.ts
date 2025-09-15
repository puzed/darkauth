import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminBearerToken } from '../../setup/helpers/auth.js';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';

async function opaqueLogin(userUrl: string, email: string, password: string) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const resStart = await fetch(`${userUrl}/api/user/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request)) })
  });
  const startJson = await resStart.json();
  const finish = await client.finishLogin(fromBase64Url(startJson.message), start.state, new Uint8Array(), 'DarkAuth', email);
  const resFinish = await fetch(`${userUrl}/api/user/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(finish.finish)), sessionId: startJson.sessionId })
  });
  const json = await resFinish.json() as { accessToken: string };
  return json.accessToken;
}

test.describe('Auth - OTP verification gating', () => {
  let servers: TestServers;
  let adminToken: string;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'auth-user-otp-gating' });
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

test('Session flags show otpRequired before verify and otpVerified after', async () => {
    await fetch(`${servers.adminUrl}/admin/groups/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl },
      body: JSON.stringify({ requireOtp: true })
    });

    const user = { email: `og-${Date.now()}@example.com`, name: 'OTP Gate', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    const sessionId = await opaqueLogin(servers.userUrl, user.email, user.password);

  const statusBefore = await fetch(`${servers.userUrl}/otp/status`, {
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl }
    });
    expect(statusBefore.ok).toBeTruthy();
    const sb = await statusBefore.json() as { required: boolean };
    expect(sb.required).toBe(true);

    const sessBefore = await fetch(`${servers.userUrl}/api/user/session`, {
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl }
    });
    expect(sessBefore.ok).toBeTruthy();
    const sj = await sessBefore.json() as { otpRequired?: boolean; otpVerified?: boolean };
    expect(sj.otpRequired).toBe(true);
    expect(sj.otpVerified).toBe(false);

    const initRes = await fetch(`${servers.userUrl}/otp/setup/init`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl }
    });
    const initJson = await initRes.json() as { secret: string };
    const secret = base32.decode(initJson.secret);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');

    const verifyRes = await fetch(`${servers.userUrl}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl },
      body: JSON.stringify({ code })
    });
    expect(verifyRes.ok).toBeTruthy();

    const sessAfter = await fetch(`${servers.userUrl}/api/user/session`, {
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl }
    });
    expect(sessAfter.ok).toBeTruthy();
    const sa = await sessAfter.json() as { otpRequired?: boolean; otpVerified?: boolean };
    expect(sa.otpVerified).toBe(true);
  });
});
