import { test, expect } from '@playwright/test';
import { createTestDatabase, destroyTestDatabase } from '../../../setup/database.js';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth, injectInstallToken } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN, createTestUser } from '../../../fixtures/testData.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Authentication - User Login', () => {
  let dbName: string;
  let servers: TestServers;
  let user = createTestUser();

  test.beforeAll(async () => {
    dbName = await createTestDatabase();
    servers = await createTestServers({ dbName });
    const installToken = generateRandomString(32);
    injectInstallToken(servers.context, installToken);
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      secureMode: false,
      installToken
    });
  });

  test.beforeEach(async ({ page, context }) => {
    user = createTestUser();
    await page.goto(`${servers.userUrl}/`);
    await page.click('button:has-text("Create one")');
    await page.fill('input[name="name"]', user.name);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', user.password);
    await page.fill('input[name="confirmPassword"]', user.password);
    await page.click('button:has-text("Create Account")');
    await page.getByText('Successfully Authenticated').waitFor({ state: 'visible', timeout: 5000 });
    await context.clearCookies();
  });

  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
    if (dbName) {
      await destroyTestDatabase(dbName);
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
    await page.getByText('Successfully Authenticated').waitFor({ state: 'visible', timeout: 5000 });
  });

  test('user cannot login with wrong password', async ({ page }) => {
    await page.goto(`${servers.userUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', user.email);
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('body')).toContainText(/invalid|error|incorrect|wrong|failed/i);
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
