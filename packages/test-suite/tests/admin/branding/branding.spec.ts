import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { ensureAdminDashboard, createSecondaryAdmin } from '../../../setup/helpers/admin.js';
import { createAdminUserViaAdmin } from '../../../setup/helpers/auth.js';

test.describe('Admin - Branding Settings', () => {
  let servers: TestServers;
  
  let adminCred = { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password };

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-branding' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
    const secondary = await createSecondaryAdmin();
    await createAdminUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      { ...secondary, role: 'write' }
    );
    adminCred = { email: secondary.email, password: secondary.password };
  });
  
  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });

  test.beforeEach(async ({ page }) => {
    await ensureAdminDashboard(page, servers, adminCred);
    
    // Navigate to Branding page
    await page.click('a[href="/branding"], button:has-text("Branding")');
    await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
    await expect(page.getByText('Customize logos, colors, text, and CSS')).toBeVisible();
  });

  test('can change brand color for light mode', async ({ page }) => {
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });
    const lightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);

    await lightColorInput.clear();
    await lightColorInput.fill('#ff0000');

    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });

    await page.locator('button:has-text("Reload")').first().click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });

    await page.waitForTimeout(500);
    const savedLightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await expect(savedLightColorInput).toHaveValue('#ff0000');
  });

  test('can change brand color for dark mode', async ({ page }) => {
    await page.getByRole('tab', { name: 'Dark' }).click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });

    const darkColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await darkColorInput.clear();
    await darkColorInput.fill('#00ff00');

    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });

    await page.locator('button:has-text("Reload")').first().click();
    await page.getByRole('tab', { name: 'Dark' }).click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });

    await page.waitForTimeout(500);
    const savedDarkColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await expect(savedDarkColorInput).toHaveValue('#00ff00');
  });

  test('can change both light and dark mode colors', async ({ page }) => {
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });
    const lightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await lightColorInput.clear();
    await lightColorInput.fill('#0000ff');

    await page.getByRole('tab', { name: 'Dark' }).click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });
    const darkColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await darkColorInput.clear();
    await darkColorInput.fill('#ffff00');

    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });

    await page.locator('button:has-text("Reload")').first().click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });

    await page.waitForTimeout(500);
    await page.getByRole('tab', { name: 'Light' }).click();
    const savedLightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await expect(savedLightColorInput).toHaveValue('#0000ff');

    await page.getByRole('tab', { name: 'Dark' }).click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });
    const savedDarkColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await expect(savedDarkColorInput).toHaveValue('#ffff00');
  });

  test('branding changes are reflected in user UI at localhost:9080', async ({ page, context }) => {
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });

    const lightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    const lightPrimaryBackgroundInput = page
      .locator('label:has-text("Primary Background Color") + div input')
      .nth(1);
    await lightColorInput.clear();
    await lightColorInput.fill('#ff00ff');
    await lightPrimaryBackgroundInput.clear();
    await lightPrimaryBackgroundInput.fill('#ff00ff');

    await page.getByRole('tab', { name: 'Dark' }).click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });
    const darkColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    const darkPrimaryBackgroundInput = page
      .locator('label:has-text("Primary Background Color") + div input')
      .nth(1);
    await darkColorInput.clear();
    await darkColorInput.fill('#ff00ff');
    await darkPrimaryBackgroundInput.clear();
    await darkPrimaryBackgroundInput.fill('#ff00ff');

    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });

    const userPage = await context.newPage();
    await userPage.goto(`${servers.userUrl}/`);
    await userPage.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });

    const submitButton = userPage.locator('button[type="submit"]').first();
    await expect
      .poll(
        async () =>
          await submitButton.evaluate((element) => window.getComputedStyle(element).backgroundColor),
        { timeout: 15000 }
      )
      .toContain('255');
    const buttonStyles = await submitButton.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return { backgroundColor: styles.backgroundColor, borderColor: styles.borderColor };
    });
    expect(buttonStyles.backgroundColor).toContain('255');
    await userPage.close();
  });

  test('can use color picker to change colors', async ({ page }) => {
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });
    const lightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);

    await lightColorInput.clear();
    await lightColorInput.fill('#123456');

    await expect(lightColorInput).toHaveValue('#123456');

    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });

    await page.locator('button:has-text("Reload")').first().click();
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });

    await page.waitForTimeout(500);
    const savedLightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await expect(savedLightColorInput).toHaveValue('#123456');
  });

  test('preview updates in real-time when changing colors', async ({ page }) => {
    await page.waitForSelector('text="Brand Color"', { timeout: 10000 });

    const lightColorInput = page.locator('label:has-text("Brand Color") + div input').nth(1);
    await lightColorInput.clear();
    await lightColorInput.fill('#ff69b4');

    await page.waitForTimeout(500);

    await expect(lightColorInput).toHaveValue('#ff69b4');

    await page.locator('button:has-text("Reload Preview")').click();
    await page.waitForTimeout(1000);

    await expect(lightColorInput).toHaveValue('#ff69b4');
  });
});
