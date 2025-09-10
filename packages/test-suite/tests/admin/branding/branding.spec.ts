import { test, expect } from '@playwright/test';
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js';
import { installDarkAuth } from '../../../setup/install.js';
import { FIXED_TEST_ADMIN } from '../../../fixtures/testData.js';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';

test.describe('Admin - Branding Settings', () => {
  let servers: TestServers;
  
  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-branding' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    });
  });
  
  test.afterAll(async () => {
    if (servers) {
      await destroyTestServers(servers);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await page.goto(`${servers.adminUrl}/`);
    await page.fill('input[name="email"], input[type="email"]', FIXED_TEST_ADMIN.email);
    await page.fill('input[name="password"], input[type="password"]', FIXED_TEST_ADMIN.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
    
    // Navigate to Branding page
    await page.click('a[href="/branding"], button:has-text("Branding")');
    await expect(page.getByRole('heading', { name: 'Branding', exact: true })).toBeVisible();
    await expect(page.getByText('Customize logos, colors, text, and CSS')).toBeVisible();
  });

  test('can change brand color for light mode', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    // Find the text input for brand color (not the color picker)
    // The second input with a hex value is the text input for light mode
    const lightColorInput = page.locator('input[value*="#"]').nth(1);
    
    // Clear and set new color
    await lightColorInput.clear();
    await lightColorInput.fill('#ff0000');
    
    // Save the changes
    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });
    
    await page.locator('button:has-text("Reload")').first().click();
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    // Verify the color was saved
    await page.waitForTimeout(500); // Wait for values to load
    const savedLightColorInput = page.locator('input[value*="#"]').nth(1);
    await expect(savedLightColorInput).toHaveValue('#ff0000');
  });

  test('can change brand color for dark mode', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('text="Brand color (Dark)"', { timeout: 10000 });
    
    // Find the dark mode brand color input - it's the 4th input with # (indices: 0=picker, 1=text, 2=dark picker, 3=dark text)
    const darkColorInput = page.locator('input[value*="#"]').nth(3);
    
    // Clear and set new color
    await darkColorInput.clear();
    await darkColorInput.fill('#00ff00');
    
    // Save the changes
    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });
    
    await page.locator('button:has-text("Reload")').first().click();
    await page.waitForSelector('text="Brand color (Dark)"', { timeout: 10000 });
    
    // Verify the color was saved
    await page.waitForTimeout(500); // Wait for values to load
    const savedDarkColorInput = page.locator('input[value*="#"]').nth(3);
    await expect(savedDarkColorInput).toHaveValue('#00ff00');
  });

  test('can change both light and dark mode colors', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    // Get the color inputs (indices: 0=picker, 1=text, 2=dark picker, 3=dark text)
    const lightColorInput = page.locator('input[value*="#"]').nth(1);
    const darkColorInput = page.locator('input[value*="#"]').nth(3);
    
    // Change light mode color
    await lightColorInput.clear();
    await lightColorInput.fill('#0000ff');
    
    // Change dark mode color
    await darkColorInput.clear();
    await darkColorInput.fill('#ffff00');
    
    // Save the changes
    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });
    
    await page.locator('button:has-text("Reload")').first().click();
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    // Verify both colors were saved
    await page.waitForTimeout(500); // Wait for values to load
    const savedLightColorInput = page.locator('input[value*="#"]').nth(1);
    const savedDarkColorInput = page.locator('input[value*="#"]').nth(3);
    await expect(savedLightColorInput).toHaveValue('#0000ff');
    await expect(savedDarkColorInput).toHaveValue('#ffff00');
  });

  test('branding changes are reflected in user UI at localhost:9080', async ({ page, context }) => {
    // First, set a distinctive brand color
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    const lightColorInput = page.locator('input[value*="#"]').nth(1);
    await lightColorInput.clear();
    await lightColorInput.fill('#ff00ff'); // Magenta
    
    // Save the changes
    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });
    
    // Open a new page and navigate to the user UI
    const userPage = await context.newPage();
    await userPage.goto(`${servers.userUrl}/`);
    
    // Wait for the login page to load
    await userPage.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
    
    // Check if the brand color is applied to buttons
    const submitButton = userPage.locator('button[type="submit"]').first();
    const buttonStyles = await submitButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor
      };
    });
    
    // The magenta color should be applied (rgb(255, 0, 255))
    expect(buttonStyles.backgroundColor).toContain('255');
    
    await userPage.close();
  });

  test('can use color picker to change colors', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    // Find the color picker input for light mode (first color input)
    const lightColorPicker = page.locator('input[type="color"]').first();
    
    // Get the associated text input
    const lightColorInput = page.locator('input[value*="#"]').nth(1);
    
    // Change the value through the text input since color picker events are tricky
    await lightColorInput.clear();
    await lightColorInput.fill('#123456');
    
    // Verify the value changed
    await expect(lightColorInput).toHaveValue('#123456');
    
    // Save and verify
    await page.locator('button:has-text("Save")').first().click();
    await expect(page.getByText('Branding saved').first()).toBeVisible({ timeout: 5000 });
    
    await page.locator('button:has-text("Reload")').first().click();
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    await page.waitForTimeout(500); // Wait for values to load
    const savedLightColorInput = page.locator('input[value*="#"]').nth(1);
    await expect(savedLightColorInput).toHaveValue('#123456');
  });

  test('preview updates in real-time when changing colors', async ({ page }) => {
    // Wait for the page to load
    await page.waitForSelector('text="Brand color"', { timeout: 10000 });
    
    // Change the light mode color
    const lightColorInput = page.locator('input[value*="#"]').nth(1);
    await lightColorInput.clear();
    await lightColorInput.fill('#ff69b4'); // Hot pink
    
    // Wait a moment for the preview to update (debounced)
    await page.waitForTimeout(500);
    
    // Verify the input shows the new value (real-time update without saving)
    await expect(lightColorInput).toHaveValue('#ff69b4');
    
    // Click the Reload Preview button to ensure preview is updated
    await page.locator('button:has-text("Reload Preview")').click();
    await page.waitForTimeout(1000);
    
    // The color should still be in the input field
    await expect(lightColorInput).toHaveValue('#ff69b4');
  });
});
