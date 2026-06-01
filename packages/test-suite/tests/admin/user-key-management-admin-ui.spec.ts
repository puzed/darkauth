import { expect, test, type Locator, type Page } from '@playwright/test';
import { createAccountKey, createKeyEnvelope } from '@DarkAuth/api/src/models/keybag.ts';
import { createTrustedDevice } from '@DarkAuth/api/src/models/trustedDevices.ts';
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js';
import { installDarkAuth } from '../../setup/install.js';
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js';
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js';

const adminCred = {
  email: FIXED_TEST_ADMIN.email,
  password: FIXED_TEST_ADMIN.password,
};

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeXPathText(value: string) {
  if (!value.includes("'")) return `'${value}'`;
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', "\"\'\"", ')})`;
}

function field(root: Page | Locator, label: string) {
  return root.locator(
    `xpath=.//label[normalize-space(.)=${escapeXPathText(label)}]/ancestor::div[contains(@class, "field")][1]`
  );
}

async function fillField(root: Page | Locator, label: string, value: string) {
  await field(root, label).locator('input, textarea').first().fill(value);
}

async function selectControl(root: Page | Locator, label: string) {
  const container = field(root, label);
  const combobox = container.locator('select, [role="combobox"]').first();
  if ((await combobox.count()) > 0) return combobox;
  return container.locator('button').first();
}

async function selectField(root: Page | Locator, page: Page, label: string, option: string) {
  const control = await selectControl(root, label);
  if ((await control.evaluate((element) => element.tagName.toLowerCase())) === 'select') {
    await control.selectOption({ label: option });
    return;
  }
  await clickElement(control);
  await clickElement(page.getByRole('option', { name: option, exact: true }));
}

async function selectFirstFieldOption(root: Page | Locator, page: Page, label: string) {
  const control = await selectControl(root, label);
  if ((await control.evaluate((element) => element.tagName.toLowerCase())) === 'select') {
    const value = await control.evaluate((element) => {
      const select = element as HTMLSelectElement;
      return Array.from(select.options).find((option) => !option.disabled)?.value ?? '';
    });
    await control.selectOption(value);
    return;
  }
  await clickElement(control);
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  await clickElement(option);
}

async function openRowAction(row: Locator, name: string) {
  await row.getByRole('button', { name: 'Actions' }).click();
  await row.page().getByRole('menuitem', { name, exact: true }).click();
}

async function acceptNextDialog(page: Page) {
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
}

async function clickElement(locator: Locator) {
  await locator.evaluate((element) => {
    if (element instanceof HTMLElement) element.click();
  });
}

async function addAdminSessionCookies(page: Page, servers: TestServers) {
  const session = await getAdminSession(servers, adminCred);
  const url = new URL(servers.adminUrl);
  await page.context().addCookies(
    session.cookieHeader.split('; ').map((pair) => {
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      return {
        name,
        value,
        domain: url.hostname,
        path: '/',
        secure: true,
        httpOnly: name === '__Host-DarkAuth-Admin',
        sameSite: 'Lax' as const,
      };
    })
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('Admin - user key management UI', () => {
  let servers: TestServers;
  let keyedUserSub = '';

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'admin-user-key-management-ui' });
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    });
    const user = {
      email: `${uniqueId('keyed-user')}@example.com`,
      password: 'Passw0rd!keyed-user',
      name: 'Keyed User',
    };
    const created = await createUserViaAdmin(servers, adminCred, user, {
      createPersonalOrganization: true,
    });
    keyedUserSub = created.sub;
    const context = servers.getContext();
    const keyId = `key-${uniqueId('admin-ui')}`;
    const passwordEnvelopeId = `env-password-${uniqueId('admin-ui')}`;
    const deviceEnvelopeId = `env-device-${uniqueId('admin-ui')}`;
    await createAccountKey(context, { keyId, sub: keyedUserSub });
    await createKeyEnvelope(context, {
      envelopeId: passwordEnvelopeId,
      keyId,
      sub: keyedUserSub,
      type: 'password',
      label: 'Password envelope',
      wrappingAlg: 'test-wrap',
      wrappedKey: Buffer.from('wrapped-password-key'),
      aad: Buffer.from('password-aad'),
      metadata: { version: 'v2' },
    });
    await createKeyEnvelope(context, {
      envelopeId: deviceEnvelopeId,
      keyId,
      sub: keyedUserSub,
      type: 'trusted_device',
      label: 'Trusted browser envelope',
      wrappingAlg: 'test-wrap',
      wrappedKey: Buffer.from('wrapped-device-key'),
      aad: Buffer.from('device-aad'),
      metadata: { version: 'v2' },
    });
    await createTrustedDevice(context, {
      deviceId: `device-${uniqueId('admin-ui')}`,
      sub: keyedUserSub,
      label: 'Browser E2E',
      publicJwk: { kty: 'EC' },
      keyHandle: 'local-key-handle',
      envelopeId: deviceEnvelopeId,
    });
  });

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers);
  });

  test.beforeEach(async ({ page }) => {
    await addAdminSessionCookies(page, servers);
  });

  test('manages federation connection CRUD controls', async ({ page }) => {
    const suffix = uniqueId('fed');
    const name = `Federation ${suffix}`;
    const updatedName = `${name} Updated`;
    const domain = `${suffix}.example.com`;
    const issuer = `https://${domain}`;

    await page.goto(`${servers.adminUrl}/federation`);
    await expect(page.getByRole('heading', { name: 'Federation Connections' })).toBeVisible();
    await page.getByRole('button', { name: 'New Connection' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New Federation Connection' })).toBeVisible();

    await fillField(dialog, 'Name', name);
    await selectFirstFieldOption(dialog, page, 'Organization *');
    await fillField(dialog, 'Issuer', issuer);
    await fillField(dialog, 'Client ID', `client-${suffix}`);
    await fillField(dialog, 'Client Secret', `secret-${suffix}`);
    await fillField(dialog, 'Authorization Endpoint', `${issuer}/authorize`);
    await fillField(dialog, 'Token Endpoint', `${issuer}/token`);
    await fillField(dialog, 'JWKS URI', `${issuer}/jwks`);
    await fillField(dialog, 'Domains', domain);
    await selectField(dialog, page, 'Account Linking', 'Verified email');
    await selectField(dialog, page, 'JIT User Creation', 'Require existing user link');
    await selectField(dialog, page, 'SCIM Pre-provisioning', 'Required');
    await selectField(dialog, page, 'ZK Password Setup', 'Require password envelope');
    await selectField(dialog, page, 'Passkey PRF Unlock', 'Disabled');
    await selectField(dialog, page, 'Trusted-device Approval', 'Disabled');
    await selectField(dialog, page, 'Non-ZK Key Setup Bypass', 'Require key setup for all sign-ins');
    await clickElement(dialog.getByRole('button', { name: 'Create' }));

    const row = page.locator('tbody tr', { hasText: name }).first();
    await expect(row).toBeVisible();
    await page.getByPlaceholder('user@example.com').fill(`user@${domain}`);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText(`${name} (${issuer})`, { exact: true })).toBeVisible();

    await row.locator('button').first().click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog.getByRole('heading', { name: 'Edit Federation Connection' })).toBeVisible();
    await fillField(editDialog, 'Name', updatedName);
    await selectField(editDialog, page, 'Status', 'Disabled');
    await clickElement(editDialog.getByRole('button', { name: 'Save' }));
    const updatedRow = page.locator('tbody tr', { hasText: updatedName }).first();
    await expect(updatedRow).toContainText('Disabled');

    await acceptNextDialog(page);
    await openRowAction(updatedRow, 'Delete');
    await expect(page.locator('tbody tr', { hasText: updatedName })).toHaveCount(0);
  });

  test('manages SCIM token creation and revocation controls', async ({ page }) => {
    const tokenName = `SCIM ${uniqueId('token')}`;

    await page.goto(`${servers.adminUrl}/scim`);
    await expect(page.getByRole('heading', { name: 'SCIM Tokens' })).toBeVisible();
    await page.getByRole('button', { name: 'New Token' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Create SCIM Token' })).toBeVisible();
    await selectFirstFieldOption(dialog, page, 'Organization *');
    await fillField(dialog, 'Name', tokenName);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Copy this SCIM bearer token now')).toBeVisible();
    await expect(page.locator('input[readonly]').filter({ hasText: '' }).first()).toHaveValue(/.+/);
    const row = page.locator('tbody tr', { hasText: tokenName }).first();
    await expect(row).toContainText('Active');
    await acceptNextDialog(page);
    await openRowAction(row, 'Revoke');
    await expect(row).toContainText('Revoked');
  });

  test('manages client key delivery controls', async ({ page }) => {
    const clientId = uniqueId('client');
    let lastClient: Record<string, unknown> | null = null;
    const buildClient = (data: Record<string, unknown>) => ({
      clientId: data.clientId,
      name: data.name,
      showOnUserDashboard: data.showOnUserDashboard ?? false,
      dashboardAutoLogin: data.dashboardAutoLogin ?? false,
      dashboardPosition: data.dashboardPosition ?? 0,
      appUrl: data.appUrl ?? null,
      dashboardIconMode: data.dashboardIconMode ?? 'letter',
      dashboardIconEmoji: data.dashboardIconEmoji ?? null,
      dashboardIconLetter: data.dashboardIconLetter ?? 'D',
      type: data.type ?? 'public',
      tokenEndpointAuthMethod: data.tokenEndpointAuthMethod ?? 'none',
      requirePkce: data.requirePkce ?? true,
      zkDelivery: data.zkDelivery ?? 'none',
      zkRequired: data.zkRequired ?? false,
      keyDeliveryVersion: data.keyDeliveryVersion ?? 'v2',
      deliveredKeyKind: data.deliveredKeyKind ?? 'client_app_key',
      clientKeyScope: data.clientKeyScope ?? 'organization',
      allowedJweAlgs: data.allowedJweAlgs ?? [],
      allowedJweEncs: data.allowedJweEncs ?? [],
      redirectUris: data.redirectUris ?? [],
      postLogoutRedirectUris: data.postLogoutRedirectUris ?? [],
      grantTypes: data.grantTypes ?? ['authorization_code'],
      responseTypes: data.responseTypes ?? ['code'],
      scopes: data.scopes ?? [
        { key: 'openid', description: 'Authenticate you' },
        { key: 'profile', description: 'Access your profile information' },
      ],
      allowedZkOrigins: data.allowedZkOrigins ?? [],
      idTokenLifetimeSeconds: data.idTokenLifetimeSeconds ?? null,
      accessTokenLifetimeSeconds: data.accessTokenLifetimeSeconds ?? null,
      refreshTokenLifetimeSeconds: data.refreshTokenLifetimeSeconds ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientSecret: data.type === 'confidential' ? 'test-secret' : undefined,
    });
    await page.route(`${servers.adminUrl}/admin/clients`, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: { clients: lastClient ? [lastClient] : [] },
        });
        return;
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        expect(body.keyDeliveryVersion).toBe('v1-drk');
        expect(body.deliveredKeyKind).toBe('root_key');
        expect(body.clientKeyScope).toBe('account');
        lastClient = buildClient(body);
        await route.fulfill({ status: 201, json: lastClient });
        return;
      }
      await route.fallback();
    });
    await page.route(`${servers.adminUrl}/admin/clients/${clientId}`, async (route) => {
      const request = route.request();
      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as Record<string, unknown>;
        expect(body.keyDeliveryVersion).toBe('v2');
        expect(body.deliveredKeyKind).toBe('client_app_key');
        expect(body.clientKeyScope).toBe('organization');
        lastClient = buildClient({ ...(lastClient || {}), ...body, clientId });
        await route.fulfill({ status: 200, json: lastClient });
        return;
      }
      await route.fallback();
    });

    await page.goto(`${servers.adminUrl}/clients/new`);
    await expect(page.getByRole('heading', { name: 'Create Client' })).toBeVisible();
    await fillField(page, 'Client ID', clientId);
    await fillField(page, 'Name', 'Admin UI Key Delivery Client');
    await page.getByRole('tab', { name: 'Security' }).click();
    await selectField(page, page, 'ZK Delivery', 'fragment-jwe');
    await selectField(page, page, 'ZK Required', 'Yes');
    await selectField(page, page, 'Key Delivery Version', 'v1-drk');
    await expect(field(page, 'Delivered Key Kind').locator('input')).toHaveValue('root_key');
    await selectField(page, page, 'Client Key Scope', 'Account scoped');
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/admin/clients') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Create' }).click();
    const response = await createResponse;
    expect(response.ok()).toBeTruthy();
  });

  test('shows user key status and revokes unlock records', async ({ page }) => {
    await page.goto(`${servers.adminUrl}/users/${encodeURIComponent(keyedUserSub)}`);
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Key Status' })).toBeVisible();
    await expect(field(page, 'Key State').locator('input')).toHaveValue('locked');
    await expect(field(page, 'Active Envelopes').locator('input')).toHaveValue('2');
    await expect(field(page, 'Trusted Devices').locator('input')).toHaveValue('1');

    const passwordEnvelopeRow = page.locator('tbody tr', { hasText: 'password' }).first();
    await expect(passwordEnvelopeRow).toContainText('Active');
    await acceptNextDialog(page);
    await passwordEnvelopeRow.getByRole('button', { name: 'Revoke' }).click();
    await expect(passwordEnvelopeRow).toContainText('Revoked');
    await expect(field(page, 'Active Envelopes').locator('input')).toHaveValue('1');

    const deviceRow = page.locator('tbody tr', { hasText: 'Browser E2E' }).first();
    await expect(deviceRow).toContainText('Active');
    await acceptNextDialog(page);
    await deviceRow.getByRole('button', { name: 'Revoke' }).click();
    await expect(deviceRow).toContainText('Revoked');
    await expect(field(page, 'Trusted Devices').locator('input')).toHaveValue('0');
  });
});
