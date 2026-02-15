import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js'
import { installDarkAuth } from '../../../setup/install.js'
import { FIXED_TEST_ADMIN, createTestUser } from '../../../fixtures/testData.js'
import { createUserViaAdmin, getAdminBearerToken } from '../../../setup/helpers/auth.js'

test.describe('User Dashboard - Apps Visibility', () => {
  let servers: TestServers
  let user = createTestUser()

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-dashboard-apps' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })

    const token = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password })
    const res = await fetch(`${servers.adminUrl}/admin/clients/demo-public-client`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': servers.adminUrl
      },
      body: JSON.stringify({ showOnUserDashboard: true })
    })
    if (!res.ok) throw new Error(`Failed to enable demo-public-client on dashboard: ${res.status}`)
  })

  test.beforeEach(async () => {
    user = createTestUser()
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('enabled client appears on dashboard after login', async ({ page }) => {
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user)

    await page.goto(`${servers.userUrl}/`)
    await page.fill('input[name="email"], input[type="email"]', user.email)
    await page.fill('input[name="password"], input[type="password"]', user.password)
    await page.click('button[type="submit"], button:has-text("Sign In")')

    const appsSection = page.locator('section:has(h3:has-text("Your Applications"))')
    await expect(appsSection).toBeVisible({ timeout: 15000 })
    await expect(appsSection.getByText('Demo Public Client', { exact: false })).toBeVisible()
  })
})
