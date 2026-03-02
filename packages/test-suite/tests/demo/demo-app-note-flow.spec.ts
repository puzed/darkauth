import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { createAdminUserViaAdmin } from '../../setup/helpers/auth.js';
import {
  startDemoApiServer,
  startDemoUiServer,
  registerDemoUser,
  openDemoDashboard,
  createAndSaveDemoNote,
  verifyNoteAfterRelogin,
  type DemoApiServer,
  type DemoUiServer,
  type DemoServerBundle,
} from '../../setup/helpers/demo.js';
import {
  ensureAdminDashboard,
  ensureSelfRegistrationEnabled,
  configureDemoClient,
  createSecondaryAdmin,
  type AdminCredentials,
} from '../../setup/helpers/admin.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';

test.describe('Demo App Note Flow', () => {
  let servers: TestServers | null = null;
  let demoApi: DemoApiServer | null = null;
  let demoUi: DemoUiServer | null = null;
  let secondaryAdmin: AdminCredentials | null = null;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'demo-app-note-flow' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
    demoApi = await startDemoApiServer(servers.userUrl);
    demoUi = await startDemoUiServer(demoApi.url, servers.userUrl);
    secondaryAdmin = await createSecondaryAdmin();
    await createAdminUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      secondaryAdmin
    );
  });

  test.afterAll(async () => {
    if (demoUi) await demoUi.stop();
    if (demoApi) await demoApi.stop();
    if (servers) await destroyTestServers(servers);
  });

  test('user can register and manage notes in demo app', async ({ page, context }) => {
    if (!servers || !demoUi || !demoApi || !secondaryAdmin) {
      throw new Error('servers not initialized');
    }
    const bundle: DemoServerBundle = { servers, demoApi, demoUi };
    await ensureAdminDashboard(page, servers, secondaryAdmin);
    await ensureSelfRegistrationEnabled(servers, secondaryAdmin);
    await configureDemoClient(servers, secondaryAdmin, demoUi.url);
    const { user, page: userPage, snapshot } = await registerDemoUser(context, servers);
    const demoPage = await openDemoDashboard(context, bundle, user, snapshot);
    const note = await createAndSaveDemoNote(demoPage);
    await verifyNoteAfterRelogin(demoPage, bundle, user, note);
  });

  test('deny returns user to logged-out app screen with oauth error message', async ({ context }) => {
    if (!servers || !demoUi || !demoApi || !secondaryAdmin) {
      throw new Error('servers not initialized');
    }
    const bundle: DemoServerBundle = { servers, demoApi, demoUi };
    const adminPage = await context.newPage();
    await ensureAdminDashboard(adminPage, servers, secondaryAdmin);
    await ensureSelfRegistrationEnabled(servers, secondaryAdmin);
    await configureDemoClient(servers, secondaryAdmin, demoUi.url);
    await adminPage.close();
    const userData = await registerDemoUser(context, servers);
    await userData.page.close();
    const snapshot = userData.snapshot;

    const denyPage = await context.newPage();
    await denyPage.addInitScript((data) => {
      (window as any).__APP_CONFIG__ = data.config;
      if (window.location.origin === data.authOrigin) {
        for (const [key, value] of data.sessionEntries) window.sessionStorage.setItem(key, value);
        for (const [key, value] of data.localEntries) window.localStorage.setItem(key, value);
      }
    }, {
      config: {
        issuer: bundle.servers.userUrl,
        clientId: 'demo-public-client',
        redirectUri: `${bundle.demoUi.url}/callback`,
        demoApi: bundle.demoApi.url,
      },
      authOrigin: bundle.servers.userUrl,
      sessionEntries: snapshot.sessionEntries.filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
      ),
      localEntries: snapshot.localEntries.filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
      ),
    });
    await denyPage.goto(bundle.demoUi.url);
    const loginGateButton = denyPage.getByRole('button', { name: 'Login', exact: true });
    if (await loginGateButton.isVisible().catch(() => false)) {
      await loginGateButton.click();
    }
    await denyPage.waitForURL((url) => url.toString().includes('/authorize'), { timeout: 30000 });
    await denyPage.getByRole('button', { name: 'Deny', exact: true }).click();
    await denyPage.waitForURL((url) => url.toString().startsWith(`${bundle.demoUi.url}/?error=access_denied`), {
      timeout: 30000,
    });
    await expect(denyPage.getByText('Login to access the app')).toBeVisible({ timeout: 10000 });
    await expect(denyPage.getByText('denied', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(denyPage.getByRole('button', { name: 'Login', exact: true })).toBeVisible({ timeout: 10000 });
    await denyPage.close();
  });
});
