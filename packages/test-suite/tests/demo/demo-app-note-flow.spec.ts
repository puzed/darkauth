import { test, expect } from '@playwright/test';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createServer as createDemoServer } from '@DarkAuth/demo-app/server/src/createServer.ts';
import type { Context as DemoContext } from '@DarkAuth/demo-app/server/src/types.ts';
import { createTestServers, destroyTestServers, TestServers } from '../../setup/server.js';
import { installDarkAuth } from '../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { createAdminUserViaAdmin, completeAdminOtpForPage, establishAdminSession, getAdminBearerToken } from '../../setup/helpers/auth.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

type DemoApiServer = {
  port: number;
  url: string;
  stop: () => Promise<void>;
};

type DemoUiServer = {
  port: number;
  url: string;
  stop: () => Promise<void>;
};

async function startDemoApiServer(issuer: string): Promise<DemoApiServer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'darkauth-demo-api-'));
  const client = await PGlite.create(tempDir);
  await client.query('create table if not exists settings(key text primary key, value jsonb)');
  const context: DemoContext = {
    db: client,
    logger: {
      info: () => {},
      error: () => {},
    },
    config: {
      port: 0,
      issuer,
    },
  };
  const application = createDemoServer(context);
  await application.start();
  const address = application.server.address() as AddressInfo | null;
  const port = address?.port ?? 0;
  context.config.port = port;
  console.log('demo api started', { port, issuer });
  return {
    port,
    url: `http://localhost:${port}`,
    stop: async () => {
      await application.stop();
      await client.close();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

async function resolveDemoStaticRoot(): Promise<string> {
  const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const candidates = [
    path.join(repoRoot, 'packages/demo-app/dist'),
    path.resolve(process.cwd(), 'packages/demo-app/dist'),
    path.resolve(process.cwd(), '../demo-app/dist'),
  ];
  for (const candidate of candidates) {
    const indexPath = path.join(candidate, 'index.html');
    if (await fileExists(indexPath)) {
      console.log('demo ui static candidate', { candidate, indexPath, selected: true });
      return candidate;
    }
    console.log('demo ui static candidate', { candidate, indexPath, selected: false });
  }
  throw new Error(`demo ui bundle missing, checked ${candidates.join(', ')}`);
}

async function startDemoUiServer(demoApiUrl: string, issuer: string): Promise<DemoUiServer> {
  const staticRoot = await resolveDemoStaticRoot();
  console.log('demo ui static root', staticRoot);
  const server = http.createServer(async (request, response) => {
    let resolvedPath = '';
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      console.log('demo ui request', { url: url.toString() });
      if (url.pathname === '/config.js') {
        const origin = `http://${request.headers.host ?? '127.0.0.1'}`;
        const configuration = {
          issuer,
          clientId: 'app-web',
          redirectUri: `${origin.replace(/\/$/, '')}/callback`,
          demoApi: demoApiUrl,
        };
        const body = `window.__APP_CONFIG__=${JSON.stringify(configuration)};`;
        response.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(body),
        });
        response.end(body);
        console.log('demo ui served config', { origin, issuer, demoApiUrl });
        return;
      }

      let normalizedPath = path.posix.normalize(url.pathname);
      if (normalizedPath.includes('..')) normalizedPath = '/index.html';
      if (normalizedPath.endsWith('/')) normalizedPath = `${normalizedPath}index.html`;
      if (normalizedPath === '') normalizedPath = '/index.html';
      const relativePath = normalizedPath.replace(/^\/+/, '');
      let filePath = path.join(staticRoot, relativePath);
      if (!(await fileExists(filePath))) {
        filePath = path.join(staticRoot, 'index.html');
      }
      resolvedPath = filePath;
      const data = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': getContentType(filePath),
        'Cache-Control': 'no-store',
      });
      response.end(data);
      console.log('demo ui served file', { filePath, type: getContentType(filePath) });
    } catch (error) {
      console.error('demo ui serve error', { url: request.url, resolvedPath, error });
      response.statusCode = 500;
      response.end('error');
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo | null;
  const port = address?.port ?? 0;
  return {
    port,
    url: `http://localhost:${port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

test.describe('Demo App Note Flow', () => {
  let servers: TestServers | null = null;
  let demoApi: DemoApiServer | null = null;
  let demoUi: DemoUiServer | null = null;
  const secondaryAdmin = {
    email: `playwright-admin-${Date.now()}@example.com`,
    password: `Admin${generateRandomString(18)}!1`,
    name: 'Playwright Demo Admin',
    role: 'write' as const,
  };
  const toUrlString = (value: string | URL): string => (typeof value === 'string' ? value : value.toString());

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'demo-app-note-flow' });
    console.log('darkauth servers started', { adminUrl: servers.adminUrl, userUrl: servers.userUrl });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
    console.log('darkauth install completed');
    demoApi = await startDemoApiServer(servers.userUrl);
    console.log('demo api server ready', demoApi);
    demoUi = await startDemoUiServer(demoApi.url, servers.userUrl);
    console.log('demo ui server ready', demoUi);
    await createAdminUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      secondaryAdmin
    );
    console.log('secondary admin created', secondaryAdmin.email);
  });

  test.afterAll(async () => {
    if (demoUi) await demoUi.stop();
    if (demoApi) await demoApi.stop();
    if (servers) await destroyTestServers(servers);
  });

  test('user can register and manage notes in demo app', async ({ page, context }) => {
    if (!servers || !demoUi || !demoApi) throw new Error('servers not initialized');
    page.on('console', (msg) => {
      console.log('admin console', msg.type(), msg.text());
    });
    console.log('navigating to admin ui', servers.adminUrl);
    await page.goto(`${servers.adminUrl}/`);
    try {
      console.log('filling admin credentials');
      await page.fill('input[name="email"], input[type="email"]', secondaryAdmin.email, { timeout: 4000 });
      await page.fill('input[name="password"], input[type="password"]', secondaryAdmin.password);
      console.log('submitting admin login form');
      await page.click('button[type="submit"], button:has-text("Sign In")');
      console.log('waiting for admin navigation');
      await page.waitForURL(/\/(otp|dashboard)/, { timeout: 15000 }).catch(() => {});
      if (page.url().includes('/otp')) {
        console.log('admin otp required');
        await page.waitForFunction(() => window.localStorage.getItem('adminAccessToken'), undefined, {
          timeout: 10000,
        });
        await completeAdminOtpForPage(page, servers, secondaryAdmin);
        console.log('admin otp completed, reloading admin ui');
        await page.goto(`${servers.adminUrl}/`);
      }
      await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
      console.log('admin dashboard visible');
    } catch {
      console.log('admin login via ui failed, establishing session via helper');
      await establishAdminSession(context, servers, secondaryAdmin);
      await page.goto(`${servers.adminUrl}/`);
      await page.waitForURL(/\/(otp|dashboard)/, { timeout: 15000 }).catch(() => {});
      if (page.url().includes('/otp')) {
        console.log('admin otp required after helper');
        await page.waitForFunction(() => window.localStorage.getItem('adminAccessToken'), undefined, {
          timeout: 10000,
        });
        await completeAdminOtpForPage(page, servers, secondaryAdmin);
        console.log('admin otp completed after helper, reloading admin ui');
        await page.goto(`${servers.adminUrl}/`);
      }
      await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
    }

    await page.click('a[href="/settings"], button:has-text("Settings")');
    const usersSectionTrigger = page.getByRole('button', { name: 'Users', exact: true }).first();
    const triggerState = await usersSectionTrigger.getAttribute('data-state');
    if (triggerState !== 'open') {
      await usersSectionTrigger.click();
    }
    const selfRegistrationRow = page.locator('div').filter({ hasText: 'Self Registration Enabled' }).first();
    await expect(selfRegistrationRow).toBeVisible({ timeout: 10000 });
    const checkbox = selfRegistrationRow.locator('[role="checkbox"]');
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    const state = await checkbox.getAttribute('data-state');
    if (state !== 'checked') {
      const updateResponse = page.waitForResponse((response) => {
        return response.url().endsWith('/admin/settings') && response.request().method() === 'PUT';
      });
      await checkbox.click();
      const response = await updateResponse;
      expect(response.ok()).toBeTruthy();
      await expect(checkbox).toHaveAttribute('data-state', 'checked', { timeout: 5000 });
    }

    console.log('updating demo client redirect configuration');
    const adminToken = await getAdminBearerToken(servers, secondaryAdmin);
    const clientListResponse = await fetch(`${servers.adminUrl}/admin/clients`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl,
      },
    });
    if (!clientListResponse.ok) {
      const errorText = await clientListResponse.text().catch(() => '');
      throw new Error(`failed to list clients: ${clientListResponse.status} ${errorText}`);
    }
    const clientListJson = (await clientListResponse.json()) as {
      clients: Array<{
        clientId: string;
        redirectUris: string[];
        postLogoutRedirectUris: string[];
        allowedZkOrigins: string[];
      }>;
    };
    const appWebClient = clientListJson.clients.find((client) => client.clientId === 'app-web');
    if (!appWebClient) throw new Error('app-web client not found');
    const normalizeUrl = (value: string) => value.replace(/\/$/, '');
    const updatedRedirectUris = Array.from(
      new Set([...appWebClient.redirectUris, `${demoUi.url}/callback`, `${demoUi.url}/`])
    );
    const updatedPostLogoutUris = Array.from(
      new Set([...appWebClient.postLogoutRedirectUris, `${demoUi.url}/`, demoUi.url])
    );
    const updatedAllowedZkOrigins = Array.from(
      new Set([...appWebClient.allowedZkOrigins.map(normalizeUrl), normalizeUrl(demoUi.url)])
    );
    const updateResponse = await fetch(`${servers.adminUrl}/admin/clients/app-web`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        redirectUris: updatedRedirectUris,
        postLogoutRedirectUris: updatedPostLogoutUris,
        allowedZkOrigins: updatedAllowedZkOrigins,
      }),
    });
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text().catch(() => '');
      throw new Error(`failed to update app-web client: ${updateResponse.status} ${errorText}`);
    }
    console.log('demo client redirect configuration updated');

    const user = {
      email: `playwright-user-${Date.now()}@example.com`,
      password: `User${generateRandomString(18)}!1`,
      name: 'Playwright Demo User',
    };

    const userPage = await context.newPage();
    userPage.on('console', (msg) => {
      console.log('user console', msg.type(), msg.text());
      const args = msg.args();
      if (args.length > 0) {
        Promise.all(args.map((arg) => arg.jsonValue().catch(() => undefined)))
          .then((values) => {
            console.log('user console values', values);
          })
          .catch((error) => {
            console.log('user console values read error', error);
          });
      }
    });
    console.log('opening user signup page', `${servers.userUrl}/signup`);
    await userPage.goto(`${servers.userUrl}/signup`);
    await userPage.fill('input[name="name"]', user.name);
    await userPage.fill('input[name="email"]', user.email);
    await userPage.fill('input[name="password"]', user.password);
    await userPage.fill('input[name="confirmPassword"]', user.password);
    console.log('submitting user signup form');
    await userPage.click('button[type="submit"]');
    console.log('waiting for user dashboard after signup');
    await userPage.waitForURL(/\/dashboard/, { timeout: 20000 });
    await expect(userPage.getByText('Successfully authenticated')).toBeVisible({ timeout: 20000 });
    console.log('user dashboard visible');
    const userStorageSnapshot = await userPage.evaluate(() => {
      const sessionEntries: Array<[string, string | null]> = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key) sessionEntries.push([key, window.sessionStorage.getItem(key)]);
      }
      const localEntries: Array<[string, string | null]> = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key) localEntries.push([key, window.localStorage.getItem(key)]);
      }
      console.log('user storage snapshot', { sessionEntries, localEntries });
      return { sessionEntries, localEntries };
    });

    const demoPage = await context.newPage();
    demoPage.on('console', (msg) => {
      console.log('demo console', msg.type(), msg.text());
      const args = msg.args();
      if (args.length > 0) {
        Promise.all(args.map((arg) => arg.jsonValue().catch(() => undefined)))
          .then((values) => {
            console.log('demo console values', values);
          })
          .catch((error) => {
            console.log('demo console values read error', error);
          });
      }
    });
    demoPage.on('pageerror', (error) => {
      console.log('demo page error', error);
    });
    demoPage.on('request', (request) => {
      console.log('demo request', request.method(), request.url());
    });
    demoPage.on('response', (response) => {
      console.log('demo response', response.status(), response.url());
      if (response.url().includes('/authorize/finalize')) {
        response
          .text()
          .then((body) => {
            console.log('demo authorize finalize body', body);
          })
          .catch((error) => {
            console.log('demo authorize finalize body read failed', error);
          });
      }
      if (response.url().includes('/crypto/wrapped-drk')) {
        response
          .text()
          .then((body) => {
            console.log('demo wrapped drk body', body);
          })
          .catch((error) => {
            console.log('demo wrapped drk body read failed', error);
          });
      }
    });
    demoPage.on('requestfailed', (request) => {
      console.log('demo request failed', request.url(), request.failure()?.errorText);
    });
    const sessionEntriesForAuth = userStorageSnapshot.sessionEntries.filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
    );
    const localEntriesForAuth = userStorageSnapshot.localEntries.filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
    );
    await demoPage.addInitScript((data) => {
      if ((window as any).__APP_CONFIG__ === undefined) {
        (window as any).__APP_CONFIG__ = data.config;
      }
      if (window.location.origin === data.authOrigin) {
        for (const [key, value] of data.sessionEntries) {
          window.sessionStorage.setItem(key, value);
        }
        for (const [key, value] of data.localEntries) {
          window.localStorage.setItem(key, value);
        }
        console.log('init script restored auth storage', {
          sessionKeys: data.sessionEntries.map(([key]) => key),
          localKeys: data.localEntries.map(([key]) => key),
        });
      }
    }, {
      config: {
        issuer: servers.userUrl,
        clientId: 'app-web',
        redirectUri: `${demoUi.url}/callback`,
        demoApi: demoApi.url,
      },
      authOrigin: servers.userUrl,
      sessionEntries: sessionEntriesForAuth,
      localEntries: localEntriesForAuth,
    });
    await demoPage.addInitScript((configuration) => {
      (window as any).__APP_CONFIG__ = configuration;
    }, {
      issuer: servers.userUrl,
      clientId: 'app-web',
      redirectUri: `${demoUi.url}/callback`,
      demoApi: demoApi.url,
    });
    console.log('opening demo ui', demoUi.url);
    await demoPage.goto(demoUi.url);

    await demoPage.waitForLoadState('networkidle');
    const runtimeConfiguration = await demoPage.evaluate(() => (window as any).__APP_CONFIG__);
    console.log('demo runtime config', runtimeConfiguration);
    const bodyPreview = await demoPage.evaluate(() => document.body.innerHTML.slice(0, 500));
    console.log('demo body preview:', bodyPreview);
    if (demoPage.url().includes('/login')) {
      console.log('demo app redirected to login ui');
      await demoPage.fill('input[name="email"], input[type="email"]', user.email);
      await demoPage.fill('input[name="password"], input[type="password"]', user.password);
      await demoPage.click('button[type="submit"], button:has-text("Continue")');
    }

    console.log('waiting for demo authorization redirect');
    await demoPage.waitForURL((url) => {
      const href = toUrlString(url);
      return href.includes('/authorize') || href.startsWith(demoUi.url);
    }, {
      timeout: 20000,
    });
    console.log('demo navigation reached', demoPage.url());
    if (demoPage.url().includes('/authorize')) {
      console.log('authorize page detected, approving');
      await demoPage.evaluate(() => {
        const sessionEntries: Array<[string, string | null]> = [];
        for (let index = 0; index < window.sessionStorage.length; index += 1) {
          const key = window.sessionStorage.key(index);
          if (key) sessionEntries.push([key, window.sessionStorage.getItem(key)]);
        }
        const localEntries: Array<[string, string | null]> = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key) localEntries.push([key, window.localStorage.getItem(key)]);
        }
        console.log('authorize storage snapshot before approve', { sessionEntries, localEntries });
      });
      await demoPage.waitForSelector('button:has-text("Authorize")', { timeout: 20000 });
      await demoPage.click('button:has-text("Authorize")');
      console.log('url after authorize click', demoPage.url());
    }

    if (!demoPage.url().startsWith(`${demoUi.url}/callback`)) {
      await demoPage.waitForURL((url) => toUrlString(url).startsWith(`${demoUi.url}/callback`), {
        timeout: 30000,
      });
    }
    console.log('demo callback reached', demoPage.url());
    if (demoPage.url() !== `${demoUi.url}/`) {
      await demoPage.waitForURL((url) => toUrlString(url) === `${demoUi.url}/`, { timeout: 30000 });
    }
    console.log('demo dashboard reached', demoPage.url());
    const hasNewCard = await demoPage.evaluate(() => {
      return Boolean(document.querySelector('[class*="newCard"]'));
    });
    if (!hasNewCard) {
      await demoPage.waitForTimeout(5000);
      await demoPage.screenshot({ path: 'test-results/demo-new-card-missing.png', fullPage: true });
    }
    let createNoteButton = demoPage
      .locator('[class*="newCard"]')
      .filter({ hasText: 'Create New Note' })
      .first();
    if ((await createNoteButton.count()) === 0) {
      createNoteButton = demoPage.locator('button:has-text("New Note")').first();
    }
    await createNoteButton.waitFor({ state: 'visible', timeout: 30000 });
    await createNoteButton.click();
    await demoPage.waitForURL(/\/notes\//, { timeout: 20000 });
    await demoPage.waitForSelector('input[placeholder="Untitled Note"]', { timeout: 10000 });

    const noteTitle = `Playwright Note ${Date.now()}`;
    const noteBody = `This note was created at ${new Date().toISOString()}.`;
    await demoPage.fill('input[placeholder="Untitled Note"]', noteTitle);
    await demoPage.click('.ProseMirror');
    await demoPage.keyboard.type(noteBody);

    const saveButton = demoPage.locator('button:has-text("Save")').first();
    await saveButton.click();
    await expect(saveButton).toBeDisabled({ timeout: 15000 });

    await demoPage.click('button[title="Back to dashboard"]');
    await demoPage.waitForURL((url) => toUrlString(url) === `${demoUi.url}/`, { timeout: 20000 });
    console.log('returned to dashboard, verifying note presence');
    await expect(demoPage.locator('h3', { hasText: noteTitle })).toBeVisible({ timeout: 20000 });

    const userInitial = user.name[0]?.toUpperCase() ?? user.email[0]?.toUpperCase() ?? 'U';
    const avatarButton = demoPage.locator('button').filter({
      has: demoPage.locator('span').filter({ hasText: new RegExp(`^${userInitial}$`) }),
    }).first();
    await avatarButton.click();
    await demoPage.click('button:has-text("Logout")');

    await demoPage.waitForURL((url) => {
      const href = toUrlString(url);
      return href.includes('/login') || href.includes('/authorize');
    }, {
      timeout: 20000,
    });
    if (demoPage.url().includes('/login')) {
      console.log('demo app redirected to login after logout');
      await demoPage.fill('input[name="email"], input[type="email"]', user.email);
      await demoPage.fill('input[name="password"], input[type="password"]', user.password);
      await demoPage.click('button[type="submit"], button:has-text("Continue")');
    }
    await demoPage.waitForURL((url) => {
      const href = toUrlString(url);
      return href.includes('/authorize') || href.startsWith(demoUi.url);
    }, {
      timeout: 20000,
    });
    if (demoPage.url().includes('/authorize')) {
      console.log('authorize page displayed after relogin, approving');
      await demoPage.waitForSelector('button:has-text("Authorize")', { timeout: 20000 });
      await demoPage.click('button:has-text("Authorize")');
    }
    await demoPage.waitForURL((url) => toUrlString(url) === `${demoUi.url}/`, { timeout: 30000 });
    console.log('back on demo dashboard after relogin');
    await expect(
      demoPage.locator('[class*="card"]', { hasText: noteTitle })
    ).toBeVisible({ timeout: 20000 });

    await demoPage.locator('a', { hasText: noteTitle }).first().click();
    await demoPage.waitForURL(/\/notes\//, { timeout: 20000 });
    console.log('opened note editor, validating content');
    await expect(demoPage.locator('input[placeholder="Untitled Note"]')).toHaveValue(noteTitle, {
      timeout: 10000,
    });
    const editorContent = await demoPage.locator('.ProseMirror').innerText();
    const normalizedContent = editorContent.replace(/\s+/g, ' ').trim();
    expect(normalizedContent).toContain(noteBody);

    await demoPage.close();
    await userPage.close();
  });
});
