import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, TestServers } from '../../../setup/server.js'
import { installDarkAuth } from '../../../setup/install.js'
import { FIXED_TEST_ADMIN, createTestUser } from '../../../fixtures/testData.js'
import { createUserViaAdmin } from '../../../setup/helpers/auth.js'

test.describe('User Dashboard', () => {
  let servers: TestServers
  let user = createTestUser()

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-dashboard' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })
  })

  test.beforeEach(async ({ page }) => {
    user = createTestUser()
    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user)
    await page.goto(`${servers.userUrl}/`)
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('shows user name and email after login', async ({ page }) => {
    await page.fill('input[name="email"], input[type="email"]', user.email)
    await page.fill('input[name="password"], input[type="password"]', user.password)
    await page.click('button[type="submit"], button:has-text("Sign In")')

    await expect(page.getByRole('heading', { name: /Successfully authenticated/i })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: new RegExp(`Welcome\\s+back,\\s*${user.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i') })).toBeVisible()
    const accountSection = page.locator('section:has(h3:has-text("Account Information"))')
    await expect(accountSection).toBeVisible()
    await expect(accountSection.getByText(user.name, { exact: false })).toBeVisible()
    await expect(accountSection.getByText(user.email, { exact: false })).toBeVisible()
  })
})
