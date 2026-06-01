import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { users } from '@DarkAuth/api/src/db/schema.ts'
import { FIXED_TEST_ADMIN, createTestUser } from '../../fixtures/testData.js'
import { createUserViaAdmin, establishUserSession } from '../../setup/helpers/auth.js'
import { installDarkAuth } from '../../setup/install.js'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'

const viewports = [
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 900 },
  { name: '1440', width: 1440, height: 1000 },
]

const routes = [
  { name: 'apps', path: '/apps', heading: 'Your apps' },
  { name: 'security', path: '/security', heading: 'Security overview' },
  { name: 'profile', path: '/profile', heading: /Profile|Responsive User/ },
]

test.describe('User portal responsive UX', () => {
  let servers: TestServers
  const user = { ...createTestUser(), name: 'Responsive User' }

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'user-portal-responsive' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token',
    })
    const created = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user, { createPersonalOrganization: true }
    )
    await servers.getContext().db
      .update(users)
      .set({ passwordResetRequired: false })
      .where(eq(users.sub, created.sub))
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test.beforeEach(async ({ context }) => {
    await establishUserSession(context, servers, user)
  })

  for (const viewport of viewports) {
    test(`renders core portal screens at ${viewport.name}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      for (const route of routes) {
        await page.goto(`${servers.userUrl}${route.path}`)
        await expect(page.getByRole('heading', { name: route.heading })).toBeVisible({
          timeout: 15000,
        })
        const overflow = await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
        )
        expect(overflow).toBeLessThanOrEqual(1)
        if (process.env.PW_ARTIFACTS === 'on') {
          await page.screenshot({
            fullPage: true,
            path: testInfo.outputPath(`${route.name}-${viewport.name}.png`),
          })
        }
      }
    })
  }

  test('supports keyboard navigation through shell and security sections', async ({ page }) => {
    await page.goto(`${servers.userUrl}/apps`)
    await expect(page.getByRole('heading', { name: 'Your apps' })).toBeVisible({ timeout: 15000 })
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).not.toHaveCount(0)
    await page.getByRole('link', { name: /security/i }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Security overview' })).toBeVisible()
    await page.getByRole('button', { name: /Passkeys/i }).first().focus()
    await page.keyboard.press('Enter')
    await expect(
      page.locator('section').getByRole('heading', { name: 'Passkeys', exact: true })
    ).toBeVisible()
  })
})
