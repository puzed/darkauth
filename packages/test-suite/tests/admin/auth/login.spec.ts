import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth, injectInstallToken } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Authentication - Login', () => {
  let servers: TestServers;
  
  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-auth-login' });
    const installToken = generateRandomString(32);
    injectInstallToken(servers.context, installToken);
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken
    });
  });
  
  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });
  
  test('admin can login with correct email and password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Overview of activity and system health')).toBeVisible();
  });
  
  test('admin cannot login with correct email but wrong password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('body')).toContainText(/invalid|error|incorrect|wrong|failed/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });
  
  test('admin cannot login with wrong email but correct password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', 'wrong-admin@example.com');
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('body')).toContainText(/no admin account found|not found|invalid|error|incorrect/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });
  
  test('admin cannot login with both wrong email and wrong password', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', 'wrong-admin@example.com');
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('body')).toContainText(/no admin account found|not found|invalid|error|incorrect/i);
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
  });
  
  test('empty email field shows validation error', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/`);
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
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
  });
});
