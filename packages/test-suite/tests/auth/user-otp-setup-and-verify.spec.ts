import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin } from '../../setup/helpers/auth.js';
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

test.describe('Auth - User OTP setup and verify', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'auth-user-otp-setup-verify' });
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

  test('Setup returns secret and provisioning URI; verify sets status and returns backup codes', async () => {
    const user = { email: `otp-${Date.now()}@example.com`, name: 'OTP User', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    const sessionId = await opaqueLogin(servers.userUrl, user.email, user.password);

    const initRes = await fetch(`${servers.userUrl}/otp/setup/init`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl }
    });
    expect(initRes.ok).toBeTruthy();
    const initJson = await initRes.json() as { secret: string; provisioning_uri: string };
    expect(typeof initJson.secret).toBe('string');
    expect(typeof initJson.provisioning_uri).toBe('string');

    const secret = base32.decode(initJson.secret);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');

    const verRes = await fetch(`${servers.userUrl}/otp/setup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl },
      body: JSON.stringify({ code })
    });
    expect(verRes.ok).toBeTruthy();
    const verJson = await verRes.json() as { success: boolean; backup_codes: string[] };
    expect(verJson.success).toBe(true);
    expect(Array.isArray(verJson.backup_codes)).toBe(true);
    expect(verJson.backup_codes.length).toBeGreaterThan(0);

    const statusRes = await fetch(`${servers.userUrl}/otp/status`, {
      headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl }
    });
    expect(statusRes.ok).toBeTruthy();
    const status = await statusRes.json() as { enabled: boolean; verified: boolean; backup_codes_remaining: number; required: boolean };
    expect(status.enabled).toBe(true);
    expect(status.verified).toBe(true);
    expect(status.backup_codes_remaining).toBeGreaterThan(0);
  });
});

