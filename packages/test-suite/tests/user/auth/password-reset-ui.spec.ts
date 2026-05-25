import { expect, test } from '@playwright/test';
import { createPasswordResetToken } from '@DarkAuth/api/src/models/passwordResetTokens.ts';
import { setSetting } from '@DarkAuth/api/src/services/settings.ts';
import { FIXED_TEST_ADMIN, createTestUser } from '../../../fixtures/testData.js';
import { createUserViaAdmin } from '../../../setup/helpers/auth.js';
import { installDarkAuth } from '../../../setup/install.js';
import { createTestServers, destroyTestServers, type TestServers } from '../../../setup/server.js';

async function configurePasswordReset(servers: TestServers, enabled: boolean, showLink = true) {
  const context = servers.getContext();
  await setSetting(context, 'email.transport', 'smtp');
  await setSetting(context, 'email.from', 'DarkAuth <noreply@example.com>');
  await setSetting(context, 'email.smtp.host', 'localhost');
  await setSetting(context, 'email.smtp.port', 2525);
  await setSetting(context, 'email.smtp.user', 'test');
  await setSetting(context, 'email.smtp.password', 'test', true);
  await setSetting(context, 'email.smtp.enabled', true);
  await setSetting(context, 'users.password_reset_email_enabled', enabled);
  await setSetting(context, 'users.password_reset_show_login_link', showLink);
}

test.describe('User - Password reset UI', () => {
  let servers: TestServers;

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-password-reset-ui' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test('login link follows password reset visibility settings', async ({ page }) => {
    await configurePasswordReset(servers, true, true);
    await page.goto(`${servers.userUrl}/login`);
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();

    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();

    await configurePasswordReset(servers, true, false);
    await page.goto(`${servers.userUrl}/login`);
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveCount(0);
  });

  test('forgot-password page always shows generic submitted copy', async ({ page }) => {
    await configurePasswordReset(servers, true, true);
    await page.goto(`${servers.userUrl}/forgot-password`);
    await page.getByLabel('Email').fill(`missing-${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Send reset instructions' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();
    await expect(page.getByText('If an account exists, we sent reset instructions.')).toBeVisible();
  });

  test('reset-password page handles invalid tokens and validates confirmation', async ({ page }) => {
    await configurePasswordReset(servers, true, true);
    const user = createTestUser();
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    );
    const created = await createPasswordResetToken(servers.getContext(), {
      userSub: sub,
      email: user.email,
      ttlMinutes: 30,
    });

    await page.goto(`${servers.userUrl}/reset-password?token=missing-${Date.now()}`);
    await expect(page.getByText('This reset link is invalid or expired.')).toBeVisible();

    await page.goto(`${servers.userUrl}/reset-password?token=${encodeURIComponent(created.token)}`);
    await expect(page.getByText(/Resetting password for/)).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('NewPassword123!');
    await page.getByLabel('Confirm Password').fill('DifferentPassword123!');
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });
});
