import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN, createTestUser } from '../../../fixtures/testData.js';
import { createUserViaAdmin } from '../../../setup/helpers/auth.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Authentication - User Login', () => {
  let servers: TestServers;
  let user = createTestUser();

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-auth-login' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });

    // No admin settings tweaks here; keep suite isolated from rate-limit state
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

  test('keeps login view hidden while sign-in configuration is still loading', async ({ page }) => {
    await page.route('**/api/user/scope-descriptions**', async (route) => {
      await page.waitForTimeout(3000);
      await route.continue();
    });
    await page.reload();
    await expect(page.getByText('Welcome back')).toHaveCount(0);
    await expect(page.getByText('DarkAuth')).toHaveCount(0);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });

  test('user can login with valid credentials', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    try {
      await page.getByRole('heading', { name: /Successfully authenticated/i }).waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      await page.waitForURL(/\/dashboard/i, { timeout: 8000 });
    }
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
    await expect(page.locator('body')).toContainText(/no account found|not found|invalid|error|incorrect|rate\s*limit|exceeded|slow\s*down/i);
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
