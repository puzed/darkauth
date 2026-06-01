import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { users } from '@DarkAuth/api/src/db/schema.ts'
import { FIXED_TEST_ADMIN, createTestUser } from '../../fixtures/testData.js'
import {
  createUserViaAdmin,
  establishUserSession,
  getAdminSession,
} from '../../setup/helpers/auth.js'
import { addOrganizationMember, getDefaultOrganizationId } from '../../setup/helpers/rbac.js'
import { installDarkAuth } from '../../setup/install.js'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'

type AdminSession = { cookieHeader: string; csrfToken: string }

function adminWriteHeaders(
  servers: TestServers,
  adminSession: AdminSession
): Record<string, string> {
  return {
    Cookie: adminSession.cookieHeader,
    Origin: servers.adminUrl,
    'Content-Type': 'application/json',
    'x-csrf-token': adminSession.csrfToken,
  }
}

async function createOrganization(
  servers: TestServers,
  adminSession: AdminSession,
  input: { name: string; slug: string }
): Promise<string> {
  const response = await fetch(`${servers.adminUrl}/admin/organizations`, {
    method: 'POST',
    headers: adminWriteHeaders(servers, adminSession),
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(`create organization failed: ${response.status}`)
  const json = (await response.json()) as { organization: { id: string } }
  return json.organization.id
}

async function createPublicClient(
  servers: TestServers,
  adminSession: AdminSession,
  input: { clientId: string; redirectUri: string }
): Promise<void> {
  const response = await fetch(`${servers.adminUrl}/admin/clients`, {
    method: 'POST',
    headers: adminWriteHeaders(servers, adminSession),
    body: JSON.stringify({
      clientId: input.clientId,
      name: input.clientId,
      type: 'public',
      tokenEndpointAuthMethod: 'none',
      requirePkce: true,
      zkDelivery: 'none',
      zkRequired: false,
      redirectUris: [input.redirectUri],
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      scopes: ['openid', 'profile'],
    }),
  })
  if (!response.ok) throw new Error(`create client failed: ${response.status}`)
}

test.describe.serial('Organization switching browser flows', () => {
  let servers: TestServers
  let defaultOrganizationId: string
  let secondOrganizationId: string
  let clientId: string
  let redirectUri: string
  const user = { ...createTestUser(), name: 'Org Switching User' }

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-org-switching' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    })
    const adminSession = await getAdminSession(servers, FIXED_TEST_ADMIN)
    const created = await createUserViaAdmin(servers, FIXED_TEST_ADMIN, user)
    await servers.getContext().db
      .update(users)
      .set({ passwordResetRequired: false })
      .where(eq(users.sub, created.sub))
    defaultOrganizationId = await getDefaultOrganizationId(servers, adminSession)
    const suffix = Date.now().toString(36)
    secondOrganizationId = await createOrganization(servers, adminSession, {
      name: 'Browser Switch Org',
      slug: `browser-switch-${suffix}`,
    })
    await addOrganizationMember(servers, adminSession, secondOrganizationId, created.sub)
    clientId = `browser-org-switch-${suffix}`
    redirectUri = `${servers.userUrl}/callback/${clientId}`
    await createPublicClient(servers, adminSession, { clientId, redirectUri })
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test.beforeEach(async ({ context }) => {
    await establishUserSession(context, servers, user)
  })

  test('multi-org authorize shows organization selector', async ({ page }) => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state: 'selector-state',
      code_challenge: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      code_challenge_method: 'S256',
    })

    await page.goto(`${servers.userUrl}/api/user/authorize?${params.toString()}`)

    await expect(
      page.getByRole('heading', { name: /Authorize Application|Continue to/ })
    ).toBeVisible({ timeout: 15000 })
    await expect(
      page.getByText('Choose which organization to use for this sign-in.')
    ).toBeVisible()
    await expect(page.locator('input[name="organization_id"]')).toHaveCount(2)
    await expect(page.getByLabel('Browser Switch Org')).toBeVisible()
  })

  test('/switch-org returns to a registered app URL', async ({ page }) => {
    const returnTo = `${servers.userUrl}/apps?switched=1`
    const params = new URLSearchParams({
      client_id: clientId,
      return_to: returnTo,
      organization_id: secondOrganizationId,
    })

    await page.goto(`${servers.userUrl}/switch-org?${params.toString()}`)

    await expect(page.getByRole('heading', { name: 'Switch organization' })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByLabel('Browser Switch Org')).toBeChecked()
    await page.getByRole('button', { name: 'Switch organization' }).click()
    await page.waitForURL(returnTo, { timeout: 15000 })

    const sessionResponse = await page.request.get(`${servers.userUrl}/api/user/session`, {
      headers: { Origin: servers.userUrl },
    })
    expect(sessionResponse.ok()).toBeTruthy()
    const session = (await sessionResponse.json()) as { organizationId?: string }
    expect(session.organizationId).toBe(secondOrganizationId)
    expect(defaultOrganizationId).not.toBe(secondOrganizationId)
  })
})
