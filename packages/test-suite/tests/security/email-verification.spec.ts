import { test, expect } from '@playwright/test';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js';

async function setAdminSetting(
  servers: TestServers,
  key: string,
  value: unknown,
  request: import('@playwright/test').APIRequestContext
) {
  const adminSession = await getAdminSession(servers, {
    email: FIXED_TEST_ADMIN.email,
    password: FIXED_TEST_ADMIN.password,
  });
  const response = await request.put(`${servers.adminUrl}/admin/settings`, {
    headers: {
      Origin: servers.adminUrl,
      Cookie: adminSession.cookieHeader,
      'x-csrf-token': adminSession.csrfToken,
    },
    data: { key, value },
  });
  expect(response.ok()).toBeTruthy();
}

async function opaqueLoginFinish(
  servers: TestServers,
  email: string,
  password: string,
  request: import('@playwright/test').APIRequestContext
) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const startResponse = await request.post(`${servers.userUrl}/api/user/opaque/login/start`, {
    headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
    data: {
      email,
      request: toBase64Url(Buffer.from(start.request)),
    },
  });
  expect(startResponse.ok()).toBeTruthy();
  const startJson = await startResponse.json();
  const finishData = await client.finishLogin(
    fromBase64Url(startJson.message),
    start.state,
    new Uint8Array(),
    'DarkAuth',
    email
  );
  const finishResponse = await request.post(`${servers.userUrl}/api/user/opaque/login/finish`, {
    headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
    data: {
      finish: toBase64Url(Buffer.from(finishData.finish)),
      sessionId: startJson.sessionId,
    },
  });
  const finishJson = await finishResponse.json().catch(() => null);
  return { status: finishResponse.status(), json: finishJson };
}

async function opaqueRegisterStart(
  servers: TestServers,
  email: string,
  password: string,
  request: import('@playwright/test').APIRequestContext
) {
  const client = new OpaqueClient();
  await client.initialize();
  const registration = await client.startRegistration(password, email);
  const response = await request.post(`${servers.userUrl}/api/user/opaque/register/start`, {
    headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
    data: {
      email,
      request: toBase64Url(Buffer.from(registration.request)),
    },
  });
  const json = await response.json().catch(() => null);
  return { status: response.status(), json };
}

test.describe('Security - Email verification', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'security-email-verification' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('email verification setting gates login when enabled and allows login when disabled', async ({
    request,
  }) => {
    const user = {
      email: `email-gate-${Date.now()}@example.com`,
      name: 'Email Gate',
      password: 'Passw0rd!EmailGate',
    };
    await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );

    await setAdminSetting(servers, 'users.require_email_verification', true, request);
    const blocked = await opaqueLoginFinish(servers, user.email, user.password, request);
    expect(blocked.status).toBe(403);
    expect(blocked.json?.code).toBe('EMAIL_UNVERIFIED');
    expect(blocked.json?.unverified).toBe(true);

    await setAdminSetting(servers, 'users.require_email_verification', false, request);
    const allowed = await opaqueLoginFinish(servers, user.email, user.password, request);
    expect(allowed.status).toBe(200);
    expect(allowed.json?.success).toBe(true);
    expect(allowed.json?.user?.email).toBe(user.email);
  });

  test('verification consume endpoint rejects invalid token and keeps login blocked', async ({
    request,
  }) => {
    const user = {
      email: `email-verify-${Date.now()}@example.com`,
      name: 'Email Verify',
      password: 'Passw0rd!EmailVerify',
    };
    await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );

    await setAdminSetting(servers, 'users.require_email_verification', true, request);
    const blocked = await opaqueLoginFinish(servers, user.email, user.password, request);
    expect(blocked.status).toBe(403);
    expect(blocked.json?.code).toBe('EMAIL_UNVERIFIED');

    const verify = await request.post(`${servers.userUrl}/api/user/email/verification/verify`, {
      headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
      data: { token: `invalid-${Date.now()}` },
    });
    expect([400, 422]).toContain(verify.status());

    const stillBlocked = await opaqueLoginFinish(servers, user.email, user.password, request);
    expect(stillBlocked.status).toBe(403);
    expect(stillBlocked.json?.code).toBe('EMAIL_UNVERIFIED');
  });

  test('resend endpoint returns generic success response', async ({ request }) => {
    const unknownEmail = `missing-${Date.now()}@example.com`;
    const response = await request.post(`${servers.userUrl}/api/user/email/verification/resend`, {
      headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
      data: { email: unknownEmail },
    });
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json?.success).toBe(true);
    expect(json?.message).toContain('pending verification');
  });

  test('registration gate blocks when verification is required without email transport', async ({
    request,
  }) => {
    await setAdminSetting(servers, 'users.self_registration_enabled', true, request);
    await setAdminSetting(servers, 'users.require_email_verification', true, request);
    await setAdminSetting(servers, 'email.smtp.enabled', false, request);

    const email = `self-reg-block-${Date.now()}@example.com`;
    const blocked = await opaqueRegisterStart(servers, email, 'Passw0rd!SelfRegBlock', request);
    expect(blocked.status).toBe(403);
    expect(blocked.json?.code).toBe('REGISTRATION_DISABLED');

    await setAdminSetting(servers, 'users.require_email_verification', false, request);
    const allowed = await opaqueRegisterStart(
      servers,
      `self-reg-ok-${Date.now()}@example.com`,
      'Passw0rd!SelfRegOk',
      request
    );
    expect(allowed.status).toBe(200);
  });
});
