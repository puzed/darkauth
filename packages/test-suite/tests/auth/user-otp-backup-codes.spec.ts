import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin } from '../../setup/helpers/auth.js';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';

async function login(userUrl: string, email: string, password: string) {
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

test.describe('Auth - User OTP backup codes', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'auth-user-otp-backup' });
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

  test('Regenerate and use backup code reduces remaining count', async () => {
    const user = { email: `bc-${Date.now()}@example.com`, name: 'Backup Codes', password: 'Passw0rd!123' };
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    const sessionId = await login(servers.userUrl, user.email, user.password);

    const initRes = await fetch(`${servers.userUrl}/otp/setup/init`, { method: 'POST', headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl } });
    const initJson = await initRes.json() as { secret: string };
    const secret = base32.decode(initJson.secret);
    const { code } = totp(secret, Math.floor(Date.now() / 1000), 30, 6, 'sha1');
    const setupVerify = await fetch(`${servers.userUrl}/otp/setup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl },
      body: JSON.stringify({ code })
    });
    const setupJson = await setupVerify.json() as { backup_codes: string[] };
    expect(Array.isArray(setupJson.backup_codes)).toBe(true);

    const beforeStatusRes = await fetch(`${servers.userUrl}/otp/status`, { headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl } });
    const beforeStatus = await beforeStatusRes.json() as { backup_codes_remaining: number };

    const verifyRes = await fetch(`${servers.userUrl}/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl },
      body: JSON.stringify({ code: setupJson.backup_codes[0] })
    });
    expect(verifyRes.ok).toBeTruthy();

    const afterStatusRes = await fetch(`${servers.userUrl}/otp/status`, { headers: { Authorization: `Bearer ${sessionId}`, Origin: servers.userUrl } });
    const afterStatus = await afterStatusRes.json() as { backup_codes_remaining: number };
    expect(afterStatus.backup_codes_remaining).toBeLessThan(beforeStatus.backup_codes_remaining);
  });
});
