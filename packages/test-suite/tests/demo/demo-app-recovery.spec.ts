import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN, createTestUser } from '../../fixtures/testData.js';
import { createUserViaAdmin, setUserPasswordViaAdmin } from '../../setup/helpers/auth.js';
import { configureDemoClient } from '../../setup/helpers/admin.js';
import { startDemoApiServer, startDemoUiServer, type DemoApiServer, type DemoUiServer } from '../../setup/helpers/demo.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { fromBase64Url, sha256Base64Url, toBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Demo App Recovery', () => {
  let servers: TestServers | null = null;
  let demoApi: DemoApiServer | null = null;
  let demoUi: DemoUiServer | null = null;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'demo-app-recovery' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
    demoApi = await startDemoApiServer(servers.userUrl);
    demoUi = await startDemoUiServer(demoApi.url, servers.userUrl);
    await configureDemoClient(servers, FIXED_TEST_ADMIN, demoUi.url);
  });

  test.afterAll(async () => {
    if (demoUi) await demoUi.stop();
    if (demoApi) await demoApi.stop();
    if (servers) await destroyTestServers(servers);
  });

  test('user can recover existing drk after admin password reset', async ({ browser }) => {
    if (!servers || !demoUi || !demoApi) {
      throw new Error('servers not initialized');
    }
    const user = createTestUser({
      password: `User${generateRandomString(18)}!1`,
    });
    const tempPassword = `User${generateRandomString(18)}!1`;
    const newPassword = `User${generateRandomString(18)}!1`;
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      { email: user.email, password: user.password, name: user.name }
    );

    const setupPage = await browser.newPage();
    await setupPage.goto(`${servers.userUrl}/login`);
    await setupPage.fill('input[name="email"], input[type="email"]', user.email);
    await setupPage.fill('input[name="password"], input[type="password"]', user.password);
    await setupPage.click('button[type="submit"], button:has-text("Continue"), button:has-text("Sign In")');
    await setupPage.waitForURL(/\/dashboard/i, { timeout: 20000 });
    await setupPage.close();

    await setUserPasswordViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      { sub, email: user.email, password: tempPassword }
    );
    const { accessToken } = await loginUserViaApi(servers, { email: user.email, password: tempPassword });
    await changeUserPassword(servers, accessToken, {
      email: user.email,
      currentPassword: tempPassword,
      newPassword,
    });

    const { accessToken: newAccessToken } = await loginUserViaApi(servers, {
      email: user.email,
      password: newPassword,
    });
    const recoveryContext = await browser.newContext();
    const recoveryPage = await recoveryContext.newPage();
    await recoveryPage.addInitScript((payload) => {
      (window as any).__APP_CONFIG__ = payload.config;
      if (window.location.origin === payload.authOrigin) {
        window.localStorage.setItem('userAccessToken', payload.accessToken);
      }
    }, {
      config: {
        issuer: servers.userUrl,
        clientId: 'app-web',
        redirectUri: `${demoUi.url}/callback`,
        demoApi: demoApi?.url ?? ''
      },
      authOrigin: servers.userUrl,
      accessToken: newAccessToken,
    });
    await recoveryPage.goto(demoUi.url);
    const authorizeButton = recoveryPage.locator('button:has-text("Authorize")');
    await authorizeButton.waitFor({ state: 'visible', timeout: 20000 });
    await authorizeButton.click();
    await expect(recoveryPage.getByText('Key Recovery')).toBeVisible({ timeout: 20000 });
    await recoveryPage.getByLabel('Current Password').fill(newPassword);
    await recoveryPage.getByLabel('Old Password').fill(user.password);
    await recoveryPage.click('button:has-text("Recover with old password")');
    await recoveryPage.waitForURL((url) => url.toString().startsWith(`${demoUi.url}/`), { timeout: 30000 });
    await recoveryContext.close();

    const {
      accessToken: freshAccessToken,
      exportKeyB64Url: freshExportKeyB64Url,
      sub: freshSub,
    } = await loginUserViaApi(servers, { email: user.email, password: newPassword });
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.addInitScript((payload) => {
      (window as any).__APP_CONFIG__ = payload.config;
      if (window.location.origin === payload.authOrigin) {
        window.localStorage.setItem('userAccessToken', payload.accessToken);
        if (payload.exportKeyB64Url && payload.userSub) {
          window.sessionStorage.setItem(
            `DarkAuth_export_key:${payload.userSub}`,
            payload.exportKeyB64Url
          );
        }
      }
    }, {
      config: {
        issuer: servers.userUrl,
        clientId: 'app-web',
        redirectUri: `${demoUi.url}/callback`,
        demoApi: demoApi?.url ?? ''
      },
      authOrigin: servers.userUrl,
      accessToken: freshAccessToken,
      exportKeyB64Url: freshExportKeyB64Url,
      userSub: freshSub,
    });
    await freshPage.goto(demoUi.url);
    const freshAuthorizeButton = freshPage.locator('button:has-text("Authorize")');
    const dashboard = freshPage.locator('[class*="newCard"], button:has-text("New Note")');
    await Promise.race([
      freshAuthorizeButton.waitFor({ state: 'visible', timeout: 20000 }),
      dashboard.waitFor({ state: 'visible', timeout: 20000 }),
    ]);
    if (await freshAuthorizeButton.isVisible()) {
      await expect(freshPage.getByText('Key Recovery')).toHaveCount(0);
      await freshAuthorizeButton.click();
      await freshPage.waitForURL((url) => url.toString().startsWith(demoUi.url), {
        timeout: 30000,
      });
      await freshPage.waitForLoadState('domcontentloaded');
    }
    await dashboard.waitFor({ state: 'visible', timeout: 30000 });
    await freshContext.close();
  });
});

async function loginUserViaApi(
  servers: TestServers,
  user: { email: string; password: string }
): Promise<{ accessToken: string; exportKeyB64Url: string; sub: string }> {
  const client = new OpaqueClient();
  await client.initialize();
  const loginStart = await client.startLogin(user.password, user.email);
  const startRes = await fetch(`${servers.userUrl}/api/user/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ email: user.email, request: toBase64Url(Buffer.from(loginStart.request)) })
  });
  if (!startRes.ok) throw new Error(`login start failed: ${startRes.status}`);
  const startJson = await startRes.json() as { message: string; sessionId: string };
  const loginFinish = await client.finishLogin(
    fromBase64Url(startJson.message),
    loginStart.state,
    new Uint8Array(),
    'DarkAuth',
    user.email
  );
  const finishRes = await fetch(`${servers.userUrl}/api/user/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': servers.userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(loginFinish.finish)), sessionId: startJson.sessionId })
  });
  if (!finishRes.ok) throw new Error(`login finish failed: ${finishRes.status}`);
  const finishJson = await finishRes.json() as { accessToken: string; sub: string };
  return {
    accessToken: finishJson.accessToken,
    exportKeyB64Url: toBase64Url(Buffer.from(loginFinish.export_key)),
    sub: finishJson.sub,
  };
}

async function changeUserPassword(
  servers: TestServers,
  accessToken: string,
  payload: { email: string; currentPassword: string; newPassword: string }
): Promise<void> {
  const verifyClient = new OpaqueClient();
  await verifyClient.initialize();
  const verifyStart = await verifyClient.startLogin(payload.currentPassword, payload.email);
  const verifyStartRes = await fetch(`${servers.userUrl}/api/user/password/change/verify/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': servers.userUrl,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ request: toBase64Url(Buffer.from(verifyStart.request)) })
  });
  if (!verifyStartRes.ok) throw new Error(`password verify start failed: ${verifyStartRes.status}`);
  const verifyStartJson = await verifyStartRes.json() as { message: string; sessionId: string };
  const verifyFinish = await verifyClient.finishLogin(
    fromBase64Url(verifyStartJson.message),
    verifyStart.state,
    new Uint8Array(),
    'DarkAuth',
    payload.email
  );
  const verifyFinishRes = await fetch(`${servers.userUrl}/api/user/password/change/verify/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': servers.userUrl,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      finish: toBase64Url(Buffer.from(verifyFinish.finish)),
      sessionId: verifyStartJson.sessionId
    })
  });
  if (!verifyFinishRes.ok) throw new Error(`password verify finish failed: ${verifyFinishRes.status}`);
  const verifyFinishJson = await verifyFinishRes.json() as { reauth_token: string };

  const regClient = new OpaqueClient();
  await regClient.initialize();
  const regStart = await regClient.startRegistration(payload.newPassword, payload.email);
  const changeStartRes = await fetch(`${servers.userUrl}/api/user/password/change/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': servers.userUrl,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ request: toBase64Url(Buffer.from(regStart.request)) })
  });
  if (!changeStartRes.ok) throw new Error(`password change start failed: ${changeStartRes.status}`);
  const changeStartJson = await changeStartRes.json() as { message: string; serverPublicKey: string; identityU: string };
  const regFinish = await regClient.finishRegistration(
    fromBase64Url(changeStartJson.message),
    regStart.state,
    fromBase64Url(changeStartJson.serverPublicKey),
    'DarkAuth',
    changeStartJson.identityU
  );
  const exportKeyHash = sha256Base64Url(Buffer.from(regFinish.export_key));
  const changeFinishRes = await fetch(`${servers.userUrl}/api/user/password/change/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': servers.userUrl,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      record: toBase64Url(Buffer.from(regFinish.upload)),
      export_key_hash: exportKeyHash,
      reauth_token: verifyFinishJson.reauth_token
    })
  });
  if (!changeFinishRes.ok) throw new Error(`password change finish failed: ${changeFinishRes.status}`);
}
