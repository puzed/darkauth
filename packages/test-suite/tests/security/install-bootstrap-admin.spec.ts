import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../setup/server.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { generateRandomString, toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';

test.describe('Security - Single Bootstrap Admin', () => {
  let servers: TestServers;
  let installToken: string;

  test.beforeAll(async () => {
    servers = await createTestServers({
      testName: 'security-bootstrap-admin',
      installToken: 'test-install-token'
    });
  });

  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });

  test('enforces single bootstrap admin and email binding', async ({ request }) => {
    const adminEmail = FIXED_TEST_ADMIN.email;
    const adminName = FIXED_TEST_ADMIN.name;
    const adminPassword = FIXED_TEST_ADMIN.password;

    const client = new OpaqueClient();
    await client.initialize();
    const regStart = await client.startRegistration(adminPassword, adminEmail);

    const startRes = await request.post(`${servers.adminUrl}/api/install/opaque/start`, {
      data: {
        token: installToken,
        email: adminEmail,
        name: adminName,
        request: toBase64Url(Buffer.from(regStart.request))
      }
    });
    expect(startRes.ok()).toBeTruthy();
    const startJson = await startRes.json();
    const message = fromBase64Url(startJson.message);
    const serverPublicKey = fromBase64Url(startJson.serverPublicKey);

    const regFinish = await client.finishRegistration(
      message,
      regStart.state,
      serverPublicKey,
      'DarkAuth',
      adminEmail
    );

    const finishRes = await request.post(`${servers.adminUrl}/api/install/opaque/finish`, {
      data: {
        token: installToken,
        email: adminEmail,
        name: adminName,
        record: toBase64Url(Buffer.from(regFinish.upload))
      }
    });
    expect(finishRes.status()).toBe(201);

    const wrongEmail = `alt-${adminEmail}`;

    const startWrongRes = await request.post(`${servers.adminUrl}/api/install/opaque/start`, {
      data: {
        token: installToken,
        email: wrongEmail,
        name: 'Alt',
        request: toBase64Url(Buffer.from(regStart.request))
      }
    });
    expect(startWrongRes.status()).toBe(400);

    const startAgainRes = await request.post(`${servers.adminUrl}/api/install/opaque/start`, {
      data: {
        token: installToken,
        email: adminEmail,
        name: adminName,
        request: toBase64Url(Buffer.from(regStart.request))
      }
    });
    expect(startAgainRes.status()).toBe(400);

    const finishWrongRes = await request.post(`${servers.adminUrl}/api/install/opaque/finish`, {
      data: {
        token: installToken,
        email: wrongEmail,
        name: 'Alt',
        record: toBase64Url(Buffer.from(regFinish.upload))
      }
    });
    expect(finishWrongRes.status()).toBe(400);
  });
});

