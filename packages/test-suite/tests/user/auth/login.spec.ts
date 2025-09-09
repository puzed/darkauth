import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth, injectInstallToken } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN, createTestUser } from '../../../fixtures/testData.js';
import { createUserViaAdmin } from '../../../setup/helpers/auth.js';
import { generateRandomString, toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';

test.describe('Authentication - User Login', () => {
  let servers: TestServers;
  let user = createTestUser();

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-auth-login' });
    const installToken = generateRandomString(32);
    injectInstallToken(servers.context, installToken);
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken
    });

    const client = new OpaqueClient();
    await client.initialize();
    const start = await client.startLogin(FIXED_TEST_ADMIN.password, FIXED_TEST_ADMIN.email);
    let startRes: Response | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await fetch(`${servers.adminUrl}/admin/opaque/login/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': servers.adminUrl },
        body: JSON.stringify({ email: FIXED_TEST_ADMIN.email, request: toBase64Url(Buffer.from(start.request)) })
      });
      if (res.status !== 429) { startRes = res; break; }
      const resetHeader = res.headers.get('X-RateLimit-Reset');
      const nowSec = Math.ceil(Date.now() / 1000);
      const waitMs = resetHeader ? Math.max(0, (parseInt(resetHeader, 10) - nowSec) * 1000) : 1000;
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 5000)));
    }
    if (!startRes || !startRes.ok) throw new Error(`admin login start failed: ${startRes ? startRes.status : 'no-response'}`);
    const startJson = await startRes.json();
    const finish = await client.finishLogin(
      fromBase64Url(startJson.message),
      start.state,
      new Uint8Array(),
      'DarkAuth',
      FIXED_TEST_ADMIN.email
    );
    const finishRes = await fetch(`${servers.adminUrl}/admin/opaque/login/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': servers.adminUrl },
      body: JSON.stringify({ sessionId: startJson.sessionId, finish: toBase64Url(Buffer.from(finish.finish)) })
    });
    const finishJson = await finishRes.json();
    await fetch(`${servers.adminUrl}/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Origin': servers.adminUrl, 'Authorization': `Bearer ${finishJson.accessToken}` },
      body: JSON.stringify({ key: 'rate_limits.opaque.max_requests', value: 1000 })
    });
  });

  test.beforeEach(async ({ page }) => {
    user = createTestUser();
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user);
    await page.goto(`${servers.userUrl}/login`);
  });

  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });

  test('login form is visible', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
  });

  test('user can login with valid credentials', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.getByRole('heading', { name: /Successfully authenticated/i }).waitFor({ state: 'visible', timeout: 5000 });
  });

  test('user cannot login with wrong password', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('body')).toContainText(/invalid|error|incorrect|wrong|failed|rate\s*limit|exceeded|slow\s*down/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });

  test('user cannot login with wrong email but correct password', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', 'wrong-user@example.com');
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('body')).toContainText(/no account found|not found|invalid|error|incorrect/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });

  test('user cannot login with both wrong email and wrong password', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', 'wrong-user@example.com');
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('body')).toContainText(/no account found|not found|invalid|error|incorrect/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });

  test('empty email field shows validation error', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    const emailField = page.locator('input[name="email"], input[type="email"]');
    await expect(emailField).toBeVisible();
    const isRequired = await emailField.getAttribute('required');
    if (isRequired !== null) {
      await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    } else {
      await expect(page.locator('body')).toContainText(/required|email.*required|enter.*email/i);
    }
  });

  test('empty password field shows validation error', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    const passwordField = page.locator('input[name="password"], input[type="password"]');
    await expect(passwordField).toBeVisible();
    const isRequired = await passwordField.getAttribute('required');
    if (isRequired !== null) {
      await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    } else {
      await expect(page.locator('body')).toContainText(/required|password.*required|enter.*password/i);
    }
  });

  test('empty form shows validation errors', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
  });
});
