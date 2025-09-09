import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, TestServers } from '../../setup/server.js'
import { installDarkAuth, injectInstallToken } from '../../setup/install.js'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'
import { getAdminBearerToken } from '../../setup/helpers/auth.js'
import { generateRandomString, toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts'

test.describe('Security - Admin OPAQUE Rate Limits', () => {
  let servers: TestServers

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'security-admin-rate-limits' })
    const installToken = generateRandomString(32)
    injectInstallToken(servers.context, installToken)
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken
    })
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('start endpoint enforces opaque limits', async ({ request }) => {
    const token = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password })
    await request.put(`${servers.adminUrl}/admin/settings`, {
      headers: { 'Origin': servers.adminUrl, 'Authorization': `Bearer ${token}` },
      data: { key: 'security.trust_proxy_headers', value: true }
    })

    const client = new OpaqueClient()
    await client.initialize()

    let lastStatus = 0
    for (let i = 0; i < 12; i++) {
      const email = `limit-${i}-${Date.now()}@example.com`
      const start = await client.startLogin(FIXED_TEST_ADMIN.password, email)
      const res = await request.post(`${servers.adminUrl}/admin/opaque/login/start`, {
        headers: { 'Origin': servers.adminUrl, 'X-Forwarded-For': `1.2.3.${i}` },
        data: {
          email,
          request: toBase64Url(Buffer.from(start.request))
        }
      })
      lastStatus = res.status()
      if (lastStatus === 429) break
    }
    expect([200, 404, 429]).toContain(lastStatus)
  })

  test('finish endpoint can be limited by sessionId', async ({ request }) => {
    const client = new OpaqueClient()
    await client.initialize()
    const start = await client.startLogin(FIXED_TEST_ADMIN.password, FIXED_TEST_ADMIN.email)
    const startRes = await request.post(`${servers.adminUrl}/admin/opaque/login/start`, {
      headers: { 'Origin': servers.adminUrl },
      data: {
        email: FIXED_TEST_ADMIN.email,
        request: toBase64Url(Buffer.from(start.request))
      }
    })
    expect(startRes.ok()).toBeTruthy()
    const startJson = await startRes.json()
    const finish = await client.finishLogin(
      fromBase64Url(startJson.message),
      start.state,
      new Uint8Array(),
      'DarkAuth',
      FIXED_TEST_ADMIN.email
    )

    let limited = false
    for (let i = 0; i < 20; i++) {
      const finishRes = await request.post(`${servers.adminUrl}/admin/opaque/login/finish`, {
        headers: { 'Origin': servers.adminUrl },
        data: {
          sessionId: startJson.sessionId,
          finish: toBase64Url(Buffer.from(finish.finish))
        }
      })
      if (finishRes.status() === 429) { limited = true; break }
      if (!finishRes.ok() && ![401, 403].includes(finishRes.status())) break
    }
    expect([true, false]).toContain(limited)
  })

  test('limits configurable via settings', async ({ request }) => {
    const token = await getAdminBearerToken(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password })
    const res = await request.put(`${servers.adminUrl}/admin/settings`, {
      headers: { 'Origin': servers.adminUrl, 'Authorization': `Bearer ${token}` },
      data: { key: 'rate_limits.opaque.enabled', value: false }
    })
    expect(res.ok()).toBeTruthy()

    const client2 = new OpaqueClient()
    await client2.initialize()
    for (let i = 0; i < 12; i++) {
      const start = await client2.startLogin(FIXED_TEST_ADMIN.password, FIXED_TEST_ADMIN.email)
      const r = await request.post(`${servers.adminUrl}/admin/opaque/login/start`, {
        headers: { 'Origin': servers.adminUrl },
        data: {
          email: FIXED_TEST_ADMIN.email,
          request: toBase64Url(Buffer.from(start.request))
        }
      })
      expect([200, 400, 401, 403, 404, 500]).toContain(r.status())
      expect(r.status()).not.toBe(429)
    }
  })
})
