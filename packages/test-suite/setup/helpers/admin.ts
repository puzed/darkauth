import { expect, type Page } from '@playwright/test';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';
import { completeAdminOtpForPage, establishAdminSession, getAdminBearerToken } from './auth.js';
import type { TestServers } from '../server.js';
import { attachConsoleLogging } from './browser.js';

type AdminClient = {
  clientId: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedZkOrigins: string[];
};

export type AdminCredentials = {
  email: string;
  password: string;
  name?: string;
  role?: 'read' | 'write';
};

export async function ensureAdminDashboard(
  page: Page,
  servers: TestServers,
  admin: AdminCredentials,
  options?: { label?: string }
): Promise<void> {
  attachConsoleLogging(page, options?.label ?? 'admin');
  await page.goto(`${servers.adminUrl}/`);
  try {
    await page.fill('input[name="email"], input[type="email"]', admin.email, { timeout: 4000 });
    await page.fill('input[name="password"], input[type="password"]', admin.password);
    await page.click('button[type="submit"], button:has-text("Sign In")');
    await page.waitForURL(/\/(otp|dashboard)/, { timeout: 15000 }).catch(() => {});
    if (page.url().includes('/otp')) {
      await page.waitForFunction(() => window.localStorage.getItem('adminAccessToken'), undefined, {
        timeout: 10000,
      });
      await completeAdminOtpForPage(page, servers, admin);
      await page.goto(`${servers.adminUrl}/`);
    }
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
  } catch {
    await establishAdminSession(page.context(), servers, admin);
    await page.goto(`${servers.adminUrl}/`);
    await page.waitForURL(/\/(otp|dashboard)/, { timeout: 15000 }).catch(() => {});
    if (page.url().includes('/otp')) {
      await page.waitForFunction(() => window.localStorage.getItem('adminAccessToken'), undefined, {
        timeout: 10000,
      });
      await completeAdminOtpForPage(page, servers, admin);
      await page.goto(`${servers.adminUrl}/`);
    }
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 15000 });
  }
}

export async function ensureSelfRegistrationEnabled(page: Page): Promise<void> {
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
  if (state === 'checked') return;
  const updateResponse = page.waitForResponse((response) => {
    return response.url().endsWith('/admin/settings') && response.request().method() === 'PUT';
  });
  await checkbox.click();
  const response = await updateResponse;
  expect(response.ok()).toBeTruthy();
  await expect(checkbox).toHaveAttribute('data-state', 'checked', { timeout: 5000 });
}

export async function configureDemoClient(
  servers: TestServers,
  admin: AdminCredentials,
  demoUiUrl: string
): Promise<void> {
  const adminToken = await getAdminBearerToken(servers, admin);
  const appWebClient = await fetchAppWebClient(servers, adminToken);
  const normalizeUrl = (value: string) => value.replace(/\/$/, '');
  const updatedRedirectUris = Array.from(
    new Set([...appWebClient.redirectUris, `${demoUiUrl}/callback`, `${demoUiUrl}/`])
  );
  const updatedPostLogoutUris = Array.from(
    new Set([...appWebClient.postLogoutRedirectUris, `${demoUiUrl}/`, demoUiUrl])
  );
  const updatedAllowedZkOrigins = Array.from(
    new Set([...appWebClient.allowedZkOrigins.map(normalizeUrl), normalizeUrl(demoUiUrl)])
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
}

async function fetchAppWebClient(servers: TestServers, adminToken: string): Promise<AdminClient> {
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
  const clientListJson = (await clientListResponse.json()) as { clients: AdminClient[] };
  const appWebClient = clientListJson.clients.find((client) => client.clientId === 'app-web');
  if (!appWebClient) throw new Error('app-web client not found');
  return appWebClient;
}

export async function createSecondaryAdmin(): Promise<AdminCredentials> {
  const email = `playwright-admin-${Date.now()}@example.com`;
  const password = `Admin${generateRandomString(18)}!1`;
  return {
    email,
    password,
    name: 'Playwright Demo Admin',
    role: 'write',
  };
}
