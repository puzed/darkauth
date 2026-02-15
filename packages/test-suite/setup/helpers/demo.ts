import { expect, type BrowserContext, type Page } from '@playwright/test';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createServer as createDemoServer } from '@DarkAuth/demo-app/server/src/createServer.ts';
import type { Context as DemoContext } from '@DarkAuth/demo-app/server/src/types.ts';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';
import type { TestServers } from '../server.js';
import { attachConsoleLogging, attachNetworkLogging, toUrlString } from './browser.js';

export type DemoApiServer = {
  port: number;
  url: string;
  stop: () => Promise<void>;
};

export type DemoUiServer = {
  port: number;
  url: string;
  stop: () => Promise<void>;
};

export type StorageSnapshot = {
  sessionEntries: Array<[string, string | null]>;
  localEntries: Array<[string, string | null]>;
};

export type DemoUserCredentials = {
  email: string;
  password: string;
  name: string;
};

export type DemoServerBundle = {
  servers: TestServers;
  demoApi: DemoApiServer;
  demoUi: DemoUiServer;
};

export async function startDemoApiServer(issuer: string): Promise<DemoApiServer> {
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

export async function startDemoUiServer(
  demoApiUrl: string,
  issuer: string
): Promise<DemoUiServer> {
  const staticRoot = await resolveDemoStaticRoot();
  const server = http.createServer(async (request, response) => {
    let resolvedPath = '';
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      if (url.pathname === '/config.js') {
        const origin = `http://${request.headers.host ?? '127.0.0.1'}`;
        const configuration = {
          issuer,
          clientId: 'demo-public-client',
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

export async function registerDemoUser(
  context: BrowserContext,
  servers: TestServers
): Promise<{ user: DemoUserCredentials; page: Page; snapshot: StorageSnapshot }> {
  const user = {
    email: `playwright-user-${Date.now()}@example.com`,
    password: `User${generateRandomString(18)}!1`,
    name: 'Playwright Demo User',
  } satisfies DemoUserCredentials;
  const userPage = await context.newPage();
  attachConsoleLogging(userPage, 'user');
  await userPage.goto(`${servers.userUrl}/signup`);
  await userPage.fill('input[name="name"]', user.name);
  await userPage.fill('input[name="email"]', user.email);
  await userPage.fill('input[name="password"]', user.password);
  await userPage.fill('input[name="confirmPassword"]', user.password);
  await userPage.click('button[type="submit"]');
  await userPage.waitForURL(/\/dashboard/, { timeout: 20000 });
  await expect(userPage.getByText('Successfully authenticated')).toBeVisible({ timeout: 20000 });
  const snapshot = await userPage.evaluate(() => {
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
    return { sessionEntries, localEntries };
  });
  return { user, page: userPage, snapshot };
}

export async function openDemoDashboard(
  context: BrowserContext,
  bundle: DemoServerBundle,
  user: DemoUserCredentials,
  snapshot: StorageSnapshot,
  options?: { label?: string; captureBodies?: Array<string | RegExp> }
): Promise<Page> {
  const demoPage = await context.newPage();
  attachConsoleLogging(demoPage, options?.label ?? 'demo');
  attachNetworkLogging(demoPage, {
    label: options?.label ?? 'demo',
    captureBodies: options?.captureBodies ?? ['/authorize/finalize', '/crypto/wrapped-drk'],
  });
  const sessionEntries = snapshot.sessionEntries.filter(
    (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
  );
  const localEntries = snapshot.localEntries.filter(
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
    }
  }, {
    config: {
      issuer: bundle.servers.userUrl,
      clientId: 'demo-public-client',
      redirectUri: `${bundle.demoUi.url}/callback`,
      demoApi: bundle.demoApi.url,
    },
    authOrigin: bundle.servers.userUrl,
    sessionEntries,
    localEntries,
  });
  await demoPage.addInitScript((configuration) => {
    (window as any).__APP_CONFIG__ = configuration;
  }, {
    issuer: bundle.servers.userUrl,
    clientId: 'demo-public-client',
    redirectUri: `${bundle.demoUi.url}/callback`,
    demoApi: bundle.demoApi.url,
  });
  await demoPage.goto(bundle.demoUi.url);
  await demoPage.waitForLoadState('networkidle');
  if (demoPage.url().includes('/login')) {
    await demoPage.fill('input[name="email"], input[type="email"]', user.email);
    await demoPage.fill('input[name="password"], input[type="password"]', user.password);
    await demoPage.click('button[type="submit"], button:has-text("Continue")');
  }
  await demoPage.waitForURL((url) => {
    const href = toUrlString(url);
    return href.includes('/authorize') || href.startsWith(bundle.demoUi.url);
  }, {
    timeout: 20000,
  });
  if (demoPage.url().includes('/authorize')) {
    const authorizeButton = demoPage.locator('button:has-text("Authorize")');
    const shouldAuthorize = await Promise.race([
      authorizeButton.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false),
      demoPage
        .waitForURL((url) => toUrlString(url).startsWith(`${bundle.demoUi.url}/callback`), {
          timeout: 20000,
        })
        .then(() => false)
        .catch(() => false),
    ]);
    if (shouldAuthorize && (await authorizeButton.isVisible())) {
      await authorizeButton.click();
    }
  }
  if (!demoPage.url().startsWith(`${bundle.demoUi.url}/callback`)) {
    await demoPage.waitForURL((url) => toUrlString(url).startsWith(`${bundle.demoUi.url}/callback`), {
      timeout: 30000,
    });
  }
  if (demoPage.url() !== `${bundle.demoUi.url}/`) {
    await demoPage.waitForURL((url) => toUrlString(url) === `${bundle.demoUi.url}/`, { timeout: 30000 });
  }
  return demoPage;
}

export async function createAndSaveDemoNote(demoPage: Page): Promise<{ title: string; body: string }> {
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
  const title = `Playwright Note ${Date.now()}`;
  const body = `This note was created at ${new Date().toISOString()}.`;
  await demoPage.fill('input[placeholder="Untitled Note"]', title);
  await demoPage.click('.ProseMirror');
  await demoPage.keyboard.type(body);
  const saveButton = demoPage.locator('button:has-text("Save")').first();
  await saveButton.click();
  await expect(saveButton).toBeDisabled({ timeout: 15000 });
  await demoPage.click('button[title="Back to dashboard"]');
  await demoPage.waitForURL(/\/$/, { timeout: 20000 });
  await expect(demoPage.locator('h3', { hasText: title })).toBeVisible({ timeout: 20000 });
  return { title, body };
}

export async function verifyNoteAfterRelogin(
  demoPage: Page,
  bundle: DemoServerBundle,
  user: DemoUserCredentials,
  note: { title: string; body: string }
): Promise<void> {
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
    await demoPage.fill('input[name="email"], input[type="email"]', user.email);
    await demoPage.fill('input[name="password"], input[type="password"]', user.password);
    await demoPage.click('button[type="submit"], button:has-text("Continue")');
  }
  await demoPage.waitForURL((url) => {
    const href = toUrlString(url);
    return href.includes('/authorize') || href.startsWith(bundle.demoUi.url);
  }, {
    timeout: 20000,
  });
  if (demoPage.url().includes('/authorize')) {
    await demoPage.waitForSelector('button:has-text("Authorize")', { timeout: 20000 });
    await demoPage.click('button:has-text("Authorize")');
  }
  await demoPage.waitForURL((url) => toUrlString(url) === `${bundle.demoUi.url}/`, { timeout: 30000 });
  await expect(
    demoPage.locator('[class*="card"]', { hasText: note.title })
  ).toBeVisible({ timeout: 20000 });
  await demoPage.locator('a', { hasText: note.title }).first().click();
  await demoPage.waitForURL(/\/notes\//, { timeout: 20000 });
  await expect(demoPage.locator('input[placeholder="Untitled Note"]')).toHaveValue(note.title, {
    timeout: 10000,
  });
  const editorContent = await demoPage.locator('.ProseMirror').innerText();
  const normalizedContent = editorContent.replace(/\s+/g, ' ').trim();
  expect(normalizedContent).toContain(note.body);
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
      return candidate;
    }
  }
  throw new Error(`demo ui bundle missing, checked ${candidates.join(', ')}`);
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
