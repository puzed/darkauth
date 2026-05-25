import { expect, test } from '@playwright/test';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { userPasswordHistory } from '@DarkAuth/api/src/db/schema.ts';
import { createPasswordResetToken } from '@DarkAuth/api/src/models/passwordResetTokens.ts';
import { fromBase64Url, sha256Base64Url, toBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js';
import { installDarkAuth } from '../../setup/install.js';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';

const genericMessage = 'If an account exists, we sent reset instructions.';

function getCookieHeader(response: import('@playwright/test').APIResponse) {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value.split(';')[0])
    .join('; ');
}

async function opaqueLogin(
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
  if (!startResponse.ok()) {
    return {
      status: startResponse.status(),
      json: await startResponse.json().catch(() => null),
      cookieHeader: '',
    };
  }
  const startJson = await startResponse.json();
  let finish;
  try {
    finish = await client.finishLogin(
      fromBase64Url(startJson.message),
      start.state,
      new Uint8Array(),
      'DarkAuth',
      email
    );
  } catch (error) {
    return {
      status: 401,
      json: { error: error instanceof Error ? error.message : String(error) },
      cookieHeader: '',
    };
  }
  const finishResponse = await request.post(`${servers.userUrl}/api/user/opaque/login/finish`, {
    headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
    data: {
      finish: toBase64Url(Buffer.from(finish.finish)),
      sessionId: startJson.sessionId,
    },
  });
  const json = await finishResponse.json().catch(() => null);
  return {
    status: finishResponse.status(),
    json,
    cookieHeader: getCookieHeader(finishResponse),
  };
}

async function resetPasswordWithToken(
  servers: TestServers,
  token: string,
  email: string,
  password: string,
  request: import('@playwright/test').APIRequestContext,
  beforeFinish?: (exportKeyHash: string) => Promise<void>
) {
  const client = new OpaqueClient();
  await client.initialize();
  const registration = await client.startRegistration(password, email);
  const startResponse = await request.post(`${servers.userUrl}/api/user/password/reset/start`, {
    headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
    data: {
      token,
      request: toBase64Url(Buffer.from(registration.request)),
    },
  });
  const startJson = await startResponse.json().catch(() => null);
  if (!startResponse.ok()) {
    return { startStatus: startResponse.status(), finishStatus: 0, startJson, finishJson: null };
  }
  expect(startJson.identityU).toBe(email);
  const finish = await client.finishRegistration(
    fromBase64Url(startJson.message),
    registration.state,
    fromBase64Url(startJson.serverPublicKey),
    'DarkAuth',
    startJson.identityU
  );
  const exportKeyHash = sha256Base64Url(Buffer.from(finish.export_key));
  await beforeFinish?.(exportKeyHash);
  const finishResponse = await request.post(`${servers.userUrl}/api/user/password/reset/finish`, {
    headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
    data: {
      token,
      record: toBase64Url(Buffer.from(finish.upload)),
      export_key_hash: exportKeyHash,
    },
  });
  const finishJson = await finishResponse.json().catch(() => null);
  return {
    startStatus: startResponse.status(),
    finishStatus: finishResponse.status(),
    startJson,
    finishJson,
  };
}

async function updateAdminSetting(
  servers: TestServers,
  key: string,
  value: unknown,
  request: import('@playwright/test').APIRequestContext
) {
  const adminSession = await getAdminSession(servers, {
    email: FIXED_TEST_ADMIN.email,
    password: FIXED_TEST_ADMIN.password,
  });
  return request.put(`${servers.adminUrl}/admin/settings`, {
    headers: {
      Origin: servers.adminUrl,
      Cookie: adminSession.cookieHeader,
      'x-csrf-token': adminSession.csrfToken,
    },
    data: { key, value },
  });
}

test.describe('API - Password reset', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-password-reset' });
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

  test('request endpoint returns the same generic response for existing and unknown emails', async ({
    request,
  }) => {
    const user = {
      email: `reset-request-${Date.now()}@example.com`,
      name: 'Reset Request',
      password: 'Passw0rd!ResetRequest',
    };
    await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );

    const known = await request.post(`${servers.userUrl}/api/user/password/reset/request`, {
      headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
      data: { email: ` ${user.email.toUpperCase()} ` },
    });
    const unknown = await request.post(`${servers.userUrl}/api/user/password/reset/request`, {
      headers: { Origin: servers.userUrl, 'Content-Type': 'application/json' },
      data: { email: `missing-${Date.now()}@example.com` },
    });

    expect(known.status()).toBe(200);
    expect(unknown.status()).toBe(200);
    await expect(known.json()).resolves.toEqual({ success: true, message: genericMessage });
    await expect(unknown.json()).resolves.toEqual({ success: true, message: genericMessage });
  });

  test('admin settings reject unsafe password reset configuration', async ({ request }) => {
    const invalidTtl = await updateAdminSetting(
      servers,
      'users.password_reset_token_ttl_minutes',
      4,
      request
    );
    expect(invalidTtl.status()).toBe(400);
    expect(await invalidTtl.json()).toMatchObject({
      error: 'Password reset token TTL must be between 5 and 1440 minutes',
    });

    const blockedEnable = await updateAdminSetting(
      servers,
      'users.password_reset_email_enabled',
      true,
      request
    );
    expect(blockedEnable.status()).toBe(400);
    expect(await blockedEnable.json()).toMatchObject({
      error: 'Password reset cannot be enabled until SMTP is configured and enabled',
    });
  });

  test('admin reset email action requires configured email reset', async ({ request }) => {
    const user = {
      email: `reset-admin-send-${Date.now()}@example.com`,
      name: 'Reset Admin Send',
      password: 'Passw0rd!ResetAdminSend',
    };
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });

    const response = await request.post(
      `${servers.adminUrl}/admin/users/${encodeURIComponent(sub)}/password/reset-email`,
      {
        headers: {
          Origin: servers.adminUrl,
          Cookie: adminSession.cookieHeader,
          'x-csrf-token': adminSession.csrfToken,
        },
      }
    );
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Password reset email cannot be sent until SMTP and password reset are enabled',
    });
  });

  test('token validation exposes only validity and masked email', async ({ request }) => {
    const user = {
      email: `reset-token-${Date.now()}@example.com`,
      name: 'Reset Token',
      password: 'Passw0rd!ResetToken',
    };
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const created = await createPasswordResetToken(servers.getContext(), {
      userSub: sub,
      email: user.email,
      ttlMinutes: 30,
    });

    const valid = await request.get(
      `${servers.userUrl}/api/user/password/reset/token?token=${encodeURIComponent(created.token)}`,
      { headers: { Origin: servers.userUrl } }
    );
    const validJson = await valid.json();
    expect(valid.status()).toBe(200);
    expect(validJson.valid).toBe(true);
    expect(validJson.email).not.toBe(user.email);
    expect(validJson.email).toContain('@example.com');
    expect(validJson.sub).toBeUndefined();
    expect(validJson.userSub).toBeUndefined();

    const invalid = await request.get(
      `${servers.userUrl}/api/user/password/reset/token?token=missing-${Date.now()}`,
      { headers: { Origin: servers.userUrl } }
    );
    await expect(invalid.json()).resolves.toEqual({ valid: false });
  });

  test('finish rejects password reuse without consuming the token', async ({ request }) => {
    const user = {
      email: `reset-reuse-${Date.now()}@example.com`,
      name: 'Reset Reuse',
      password: 'Passw0rd!ResetReuse',
    };
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const created = await createPasswordResetToken(servers.getContext(), {
      userSub: sub,
      email: user.email,
      ttlMinutes: 30,
    });

    const reuse = await resetPasswordWithToken(
      servers,
      created.token,
      user.email,
      user.password,
      request,
      async (exportKeyHash) => {
        await servers.getContext().db.insert(userPasswordHistory).values({
          userSub: sub,
          exportKeyHash,
        });
      }
    );

    expect(reuse.startStatus).toBe(200);
    expect(reuse.finishStatus).toBe(409);
    expect(reuse.finishJson?.error).toBe('Choose a password you have not used before.');

    const token = await request.get(
      `${servers.userUrl}/api/user/password/reset/token?token=${encodeURIComponent(created.token)}`,
      { headers: { Origin: servers.userUrl } }
    );
    expect(await token.json()).toMatchObject({ valid: true });
  });

  test('successful reset makes old password fail, new password succeed, and old session invalid', async ({
    request,
  }) => {
    const user = {
      email: `reset-flow-${Date.now()}@example.com`,
      name: 'Reset Flow',
      password: 'Passw0rd!ResetFlow',
    };
    const newPassword = 'Passw0rd!ResetFlowNew';
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const oldLogin = await opaqueLogin(servers, user.email, user.password, request);
    expect(oldLogin.status).toBe(200);
    expect(oldLogin.cookieHeader).toContain('__Host-DarkAuth-User=');

    const sessionBefore = await request.get(`${servers.userUrl}/api/user/session`, {
      headers: { Origin: servers.userUrl, Cookie: oldLogin.cookieHeader },
    });
    expect(sessionBefore.status()).toBe(200);

    const created = await createPasswordResetToken(servers.getContext(), {
      userSub: sub,
      email: user.email,
      ttlMinutes: 30,
    });
    const reset = await resetPasswordWithToken(
      servers,
      created.token,
      user.email,
      newPassword,
      request
    );
    expect(reset.startStatus).toBe(200);
    expect(reset.finishStatus).toBe(200);
    expect(reset.finishJson).toEqual({ success: true });

    const consumed = await request.get(
      `${servers.userUrl}/api/user/password/reset/token?token=${encodeURIComponent(created.token)}`,
      { headers: { Origin: servers.userUrl } }
    );
    expect(await consumed.json()).toEqual({ valid: false });

    const oldPasswordLogin = await opaqueLogin(servers, user.email, user.password, request);
    expect(oldPasswordLogin.status).not.toBe(200);

    const newPasswordLogin = await opaqueLogin(servers, user.email, newPassword, request);
    expect(newPasswordLogin.status).toBe(200);
    expect(newPasswordLogin.json?.success).toBe(true);

    const oldSession = await request.get(`${servers.userUrl}/api/user/session`, {
      headers: { Origin: servers.userUrl, Cookie: oldLogin.cookieHeader },
    });
    expect(oldSession.status()).toBe(401);
  });
});
