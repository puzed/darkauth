import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { createAdminUserViaAdmin } from '../../setup/helpers/auth.js';
import {
  startDemoApiServer,
  startDemoUiServer,
  blockDemoExternalRequests,
  type DemoApiServer,
  type DemoUiServer,
} from '../../setup/helpers/demo.js';
import {
  ensureAdminDashboard,
  ensureSelfRegistrationEnabled,
  configureDemoClient,
  createSecondaryAdmin,
  type AdminCredentials,
} from '../../setup/helpers/admin.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Session Bound Unlock Cross Site', () => {
  test.describe.configure({ timeout: 120000 });

  let servers: TestServers | null = null;
  let demoApi: DemoApiServer | null = null;
  let demoUi: DemoUiServer | null = null;
  let secondaryAdmin: AdminCredentials | null = null;

  test.beforeAll(async () => {
    test.setTimeout(120000);
    servers = await createTestServers({ testName: 'session-unlock-cross-site' });
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

  test('portal sign-in unlocks keys for a cross-site app without a password prompt', async ({
    page,
    context,
  }) => {
    if (!servers || !demoUi || !demoApi || !secondaryAdmin) {
      throw new Error('servers not initialized');
    }
    const notesUrl = demoUi.url.replace('localhost', '127.0.0.1');
    const authorizeRequests: string[] = [];
    context.on('request', (request) => {
      const url = request.url();
      if (url.includes('/authorize')) authorizeRequests.push(url);
    });

    await ensureAdminDashboard(page, servers, secondaryAdmin);
    await ensureSelfRegistrationEnabled(servers, secondaryAdmin);
    await configureDemoClient(servers, secondaryAdmin, notesUrl);

    const user = {
      email: `session-unlock-${Date.now()}@example.com`,
      password: `User${generateRandomString(18)}!1`,
      name: 'Session Unlock User',
    };

    const signupPage = await context.newPage();
    await signupPage.goto(`${servers.userUrl}/signup`, { waitUntil: 'domcontentloaded' });
    await signupPage.fill('input[name="name"]', user.name);
    await signupPage.fill('input[name="email"]', user.email);
    await signupPage.fill('input[name="password"]', user.password);
    await signupPage.fill('input[name="confirmPassword"]', user.password);
    await signupPage.click('button[type="submit"]');
    await expect(signupPage.getByRole('heading', { name: 'Your apps' })).toBeVisible({
      timeout: 30000,
    });
    await signupPage.close();

    await context.clearCookies();

    const loginPage = await context.newPage();
    await loginPage.goto(`${servers.userUrl}/login`, { waitUntil: 'domcontentloaded' });
    await loginPage.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await loginPage.goto(`${servers.userUrl}/login`, { waitUntil: 'domcontentloaded' });
    await loginPage.fill('input[name="email"], input[type="email"]', user.email);
    await loginPage.fill('input[name="password"], input[type="password"]', user.password);
    await loginPage.click('button[type="submit"]');
    await expect(loginPage.getByRole('heading', { name: 'Your apps' })).toBeVisible({
      timeout: 30000,
    });

    await expect
      .poll(
        () =>
          loginPage.evaluate(() => {
            for (let index = 0; index < window.localStorage.length; index += 1) {
              const key = window.localStorage.key(index);
              if (key && key.startsWith('DarkAuth_session_ark:')) return true;
            }
            return false;
          }),
        { timeout: 15000 }
      )
      .toBe(true);
    await loginPage.close();

    const notesPage = await context.newPage();
    await notesPage.addInitScript((configuration) => {
      (window as unknown as { __APP_CONFIG__: unknown }).__APP_CONFIG__ = configuration;
    }, {
      issuer: servers.userUrl,
      clientId: 'demo-public-client',
      redirectUri: `${notesUrl}/callback`,
      demoApi: demoApi.url,
    });
    await blockDemoExternalRequests(notesPage);

    const unlockHeading = notesPage.getByRole('heading', { name: /Unlock encrypt(?:ed|ion)/ });
    const loginGateButton = notesPage.getByRole('button', { name: 'Login', exact: true });
    const newNoteButton = notesPage.getByRole('button', { name: 'New Note', exact: true });
    const createCard = notesPage.locator('[class*="newCard"]').first();

    await notesPage.goto(notesUrl, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      loginGateButton.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined),
      notesPage
        .waitForURL((url) => url.toString().includes('/authorize'), { timeout: 20000 })
        .catch(() => undefined),
    ]);
    if (await loginGateButton.isVisible().catch(() => false)) {
      await loginGateButton.click();
    }
    await notesPage.waitForURL((url) => url.toString().includes('/authorize'), { timeout: 30000 });

    const authorizeButton = notesPage.getByRole('button', { name: 'Authorize', exact: true });
    await Promise.race([
      authorizeButton.waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined),
      unlockHeading.waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined),
    ]);
    expect(await unlockHeading.isVisible().catch(() => false)).toBe(false);
    await authorizeButton.waitFor({ state: 'visible', timeout: 30000 });
    await authorizeButton.click();

    await notesPage.waitForURL((url) => url.toString().startsWith(notesUrl), { timeout: 30000 });
    expect(await unlockHeading.isVisible().catch(() => false)).toBe(false);
    await Promise.race([
      newNoteButton.waitFor({ state: 'visible', timeout: 30000 }),
      createCard.waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    expect(await unlockHeading.isVisible().catch(() => false)).toBe(false);

    authorizeRequests.length = 0;
    await notesPage.goto(notesUrl, { waitUntil: 'domcontentloaded' });
    await Promise.race([
      loginGateButton.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined),
      newNoteButton.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined),
      createCard.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined),
      notesPage
        .waitForURL((url) => url.toString().includes('/authorize'), { timeout: 20000 })
        .catch(() => undefined),
    ]);
    if (await loginGateButton.isVisible().catch(() => false)) {
      await loginGateButton.click();
    }
    await Promise.race([
      newNoteButton.waitFor({ state: 'visible', timeout: 30000 }),
      createCard.waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    expect(await unlockHeading.isVisible().catch(() => false)).toBe(false);
    expect(
      await notesPage
        .getByRole('button', { name: 'Authorize', exact: true })
        .isVisible()
        .catch(() => false)
    ).toBe(false);
    expect(authorizeRequests.some((url) => url.includes('/authorize'))).toBe(true);
    await notesPage.close();
  });
});
