import { test } from '@playwright/test';
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
    await ensureSelfRegistrationEnabled(page);
    await configureDemoClient(servers, secondaryAdmin, demoUi.url);
    const { user, page: userPage, snapshot } = await registerDemoUser(context, servers);
    const demoPage = await openDemoDashboard(context, bundle, user, snapshot);
    const note = await createAndSaveDemoNote(demoPage);
    await verifyNoteAfterRelogin(demoPage, bundle, user, note);
  });
});
