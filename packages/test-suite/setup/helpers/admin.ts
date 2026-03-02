import { expect, type Page } from '@playwright/test';
import { generateRandomString } from '@DarkAuth/api/src/utils/crypto.ts';
import { establishAdminSession, getAdminSession } from './auth.js';
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
  await establishAdminSession(page.context(), servers, admin);
  await page.goto(`${servers.adminUrl}/`);
  await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible({
    timeout: 15000,
  });
}

export async function ensureSelfRegistrationEnabled(
  servers: TestServers,
  admin: AdminCredentials
): Promise<void> {
  const adminSession = await getAdminSession(servers, admin);
  const updateResponse = await fetch(`${servers.adminUrl}/admin/settings`, {
    method: 'PUT',
    headers: {
      Cookie: adminSession.cookieHeader,
      Origin: servers.adminUrl,
      'Content-Type': 'application/json',
      'x-csrf-token': adminSession.csrfToken,
    },
    body: JSON.stringify({
      key: 'users.self_registration_enabled',
      value: true,
    }),
  });
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text().catch(() => '');
    throw new Error(`failed to enable self-registration: ${updateResponse.status} ${errorText}`);
  }
}

export async function configureDemoClient(
  servers: TestServers,
  admin: AdminCredentials,
  demoUiUrl: string
): Promise<void> {
  const adminSession = await getAdminSession(servers, admin);
  const demoPublicClient = await fetchDemoPublicClient(servers, adminSession);
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
      Cookie: adminSession.cookieHeader,
      Origin: servers.adminUrl,
      'Content-Type': 'application/json',
      'x-csrf-token': adminSession.csrfToken,
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

async function fetchDemoPublicClient(
  servers: TestServers,
  adminSession: { cookieHeader: string }
): Promise<AdminClient> {
  const clientListResponse = await fetch(`${servers.adminUrl}/admin/clients`, {
    headers: {
      Cookie: adminSession.cookieHeader,
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
