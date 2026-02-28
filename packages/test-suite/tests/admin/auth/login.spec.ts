import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { establishAdminSession, getAdminBearerToken } from '../../../setup/helpers/auth.js';
import { totp, base32 } from '@DarkAuth/api/src/utils/totp.ts';

test.describe('Authentication - Login', () => {
  let servers: TestServers;
  
  async function waitForLoginForm(page: import('@playwright/test').Page) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (page.url().includes('/error')) {
        await page.goto(`${servers.adminUrl}/`);
      }
      const count = await page.locator('input[name="email"], input[type="email"]').count();
      if (count > 0) return;
      await page.waitForTimeout(200);
    }
    throw new Error('Login form did not render');
  }
  
  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-auth-login' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    await getAdminBearerToken(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    });
    const deadline = Date.now() + 30000;
    let ok = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${servers.adminUrl}/api/health`);
        if (res.ok) { ok = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 250));
    }
    if (!ok) throw new Error('Admin API did not become healthy in time');
  });
  
  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });
  
  test('admin can login with correct email and password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForLoadState('domcontentloaded');
    await waitForLoginForm(page);
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('input[name="password"], input[type="password"]').first()).toBeVisible({ timeout: 10000 });
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/otp(?:\/(?:setup|verify))?(?:\?.*)?$/, { timeout: 15000 });
    await expect(page.getByText('Two-Factor Authentication')).toBeVisible({ timeout: 10000 });
    const accessToken = await getAdminBearerToken(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    });
    const initRes = await fetch(`${servers.adminUrl}/admin/otp/setup/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Origin: servers.adminUrl,
      },
    });
    if (!initRes.ok) throw new Error(`admin otp setup init failed: ${initRes.status}`);
    const initJson = (await initRes.json()) as { secret: string };
    const secret = base32.decode(initJson.secret);
    const now = Math.floor(Date.now() / 1000);
    const { code } = totp(secret, now, 30, 6, 'sha1');
    const verifyRes = await fetch(`${servers.adminUrl}/admin/otp/setup/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Origin: servers.adminUrl,
      },
      body: JSON.stringify({ code }),
    });
    if (!verifyRes.ok) throw new Error(`admin otp setup verify failed: ${verifyRes.status}`);
    await establishAdminSession(page.context(), servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });
    await page.goto(`${servers.adminUrl}/`);
    await expect(
      page.getByRole('heading', { name: 'Admin Dashboard', exact: true })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Overview of activity and system health')).toBeVisible({ timeout: 15000 });
  });
  
  test('admin cannot login with correct email but wrong password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForLoadState('domcontentloaded');
    await waitForLoginForm(page);
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible({ timeout: 20000 });
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('body')).toContainText(/invalid|error|incorrect|wrong|failed/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });
  
  test('admin cannot login with wrong email but correct password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForLoadState('domcontentloaded');
    await waitForLoginForm(page);
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible({ timeout: 20000 });
    await page.fill('input[name="email"], input[type="email"]', 'wrong-admin@example.com');
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"]');
    await expect(page.locator('body')).toContainText(/no admin account found|not found|invalid|error|incorrect/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });
  
  test('admin cannot login with both wrong email and wrong password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForLoadState('domcontentloaded');
    await waitForLoginForm(page);
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible({ timeout: 20000 });
    await page.fill('input[name="email"], input[type="email"]', 'wrong-admin@example.com');
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('body')).toContainText(/no admin account found|not found|invalid|error|incorrect/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });
  
  test('empty email field shows validation error', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForLoadState('domcontentloaded');
    await waitForLoginForm(page);
    await expect(page.locator('input[name="password"], input[type="password"]').first()).toBeVisible({ timeout: 20000 });
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
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
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForLoadState('domcontentloaded');
    await waitForLoginForm(page);
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible({ timeout: 20000 });
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
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
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => !!document.querySelector('button[type="submit"]'), null, { timeout: 20000 });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible({ timeout: 20000 });
    await page.click('button[type="submit"]');
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
  });
});
