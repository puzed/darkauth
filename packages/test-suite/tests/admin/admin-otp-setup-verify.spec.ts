import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';

async function adminOpaqueLogin(adminUrl: string, email: string, password: string) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const resStart = await fetch(`${adminUrl}/admin/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: adminUrl },
    body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request)) })
  });
  const startJson = await resStart.json();
  const finish = await client.finishLogin(fromBase64Url(startJson.message), start.state, new Uint8Array(), 'DarkAuth', email);
  const resFinish = await fetch(`${adminUrl}/admin/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: adminUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(finish.finish)), sessionId: startJson.sessionId })
  });
  const json = await resFinish.json() as { accessToken: string };
  return json.accessToken;
}

test.describe('Admin - OTP setup and verify', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-otp-setup-verify' });
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

  test('Admin can setup OTP and verify', async () => {
    const sessionId = await adminOpaqueLogin(servers.adminUrl, FIXED_TEST_ADMIN.email, FIXED_TEST_ADMIN.password);
    const statusRes0 = await fetch(`${servers.adminUrl}/admin/otp/status`, {
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.adminUrl }
    });
    expect(statusRes0.ok).toBeTruthy();

    const initRes = await fetch(`${servers.adminUrl}/admin/otp/setup/init`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.adminUrl }
    });
    expect(initRes.ok).toBeTruthy();
    const initJson = await initRes.json() as { secret: string };

    const secret = base32.decode(initJson.secret);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');

    const verifyRes = await fetch(`${servers.adminUrl}/admin/otp/setup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionId}`, Origin: servers.adminUrl },
      body: JSON.stringify({ code })
    });
    expect(verifyRes.ok).toBeTruthy();
    const vj = await verifyRes.json() as { success: boolean; backup_codes: string[] };
    expect(vj.success).toBe(true);
    expect(Array.isArray(vj.backup_codes)).toBe(true);

    const statusRes = await fetch(`${servers.adminUrl}/admin/otp/status`, {
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.adminUrl }
    });
    expect(statusRes.ok).toBeTruthy();
    const st = await statusRes.json() as { enabled: boolean; verified: boolean };
    expect(st.enabled).toBe(true);
    expect(st.verified).toBe(true);
  });
});

