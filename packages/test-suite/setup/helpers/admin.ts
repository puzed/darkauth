import { expect, type Page } from '@playwright/test';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';
import { getAdminBearerToken } from './auth.js';
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
  const accessToken = await getAdminBearerToken(servers, admin);
  await page.addInitScript((token: string) => {
    try {
      window.localStorage.setItem('adminAccessToken', token);
    } catch {}
  }, accessToken);
  await page.goto(`${servers.adminUrl}/`);
  await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible({
    timeout: 15000,
  });
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
  const demoPublicClient = await fetchDemoPublicClient(servers, adminToken);
  const normalizeUrl = (value: string) => value.replace(/\/$/, '');
  const updatedRedirectUris = Array.from(
    new Set([...demoPublicClient.redirectUris, `${demoUiUrl}/callback`, `${demoUiUrl}/`])
  );
  const updatedPostLogoutUris = Array.from(
    new Set([...demoPublicClient.postLogoutRedirectUris, `${demoUiUrl}/`, demoUiUrl])
  );
  const updatedAllowedZkOrigins = Array.from(
    new Set([...demoPublicClient.allowedZkOrigins.map(normalizeUrl), normalizeUrl(demoUiUrl)])
  );
  const updateResponse = await fetch(`${servers.adminUrl}/admin/clients/demo-public-client`, {
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
    throw new Error(`failed to update demo-public-client client: ${updateResponse.status} ${errorText}`);
  }
}

async function fetchDemoPublicClient(servers: TestServers, adminToken: string): Promise<AdminClient> {
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
  const demoPublicClient = clientListJson.clients.find(
    (client) => client.clientId === 'demo-public-client'
  );
  if (!demoPublicClient) throw new Error('demo-public-client client not found');
  return demoPublicClient;
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
