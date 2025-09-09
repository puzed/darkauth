import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, TestServers } from '../../setup/server.js'
import { injectInstallToken } from '../../setup/install.js'
import { generateRandomString, toBase64Url } from '@DarkAuth/api/src/utils/crypto.ts'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'

test.describe('Security - Install Token Lifecycle', () => {
  let servers: TestServers
  let installToken: string

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'security-install-token-lifecycle' })
    installToken = generateRandomString(32)
    injectInstallToken(servers.context, installToken)
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('install opaque start refuses expired token', async ({ request }) => {
    servers.context.services.install.createdAt = Date.now() - (11 * 60 * 1000)

    const client = new OpaqueClient()
    await client.initialize()
    const adminEmail = `install-expired-${Date.now()}@example.com`
    const regStart = await client.startRegistration('pass-1234', adminEmail)

    const startRes = await request.post(`${servers.adminUrl}/api/install/opaque/start`, {
      data: {
        token: installToken,
        email: adminEmail,
        name: 'Admin',
        request: toBase64Url(Buffer.from(regStart.request))
      }
    })
    expect(startRes.status()).toBe(403)
  })

  test('token cleared after first finish cannot be reused', async ({ request }) => {
    // fresh token
    installToken = generateRandomString(32)
    injectInstallToken(servers.context, installToken)

    const client = new OpaqueClient()
    await client.initialize()
    const adminEmail = `bootstrap-${Date.now()}@example.com`
    const regStart = await client.startRegistration('pass-1234', adminEmail)

    const startRes = await request.post(`${servers.adminUrl}/api/install/opaque/start`, {
      data: {
        token: installToken,
        email: adminEmail,
        name: 'Admin',
        request: toBase64Url(Buffer.from(regStart.request))
      }
    })
    expect(startRes.ok()).toBeTruthy()
    const startJson = await startRes.json()
    const regFinish = await client.finishRegistration(
      Buffer.from(startJson.message, 'base64url'),
      regStart.state,
      Buffer.from(startJson.serverPublicKey, 'base64url'),
      'DarkAuth',
      adminEmail
    )
    const finishRes = await request.post(`${servers.adminUrl}/api/install/opaque/finish`, {
      data: {
        token: installToken,
        email: adminEmail,
        name: 'Admin',
        record: toBase64Url(Buffer.from(regFinish.upload))
      }
    })
    expect(finishRes.status()).toBe(201)

    const reuseRes = await request.post(`${servers.adminUrl}/api/install/opaque/start`, {
      data: {
        token: installToken,
        email: adminEmail,
        name: 'Admin',
        request: toBase64Url(Buffer.from(regStart.request))
      }
    })
    expect(reuseRes.status()).toBeGreaterThanOrEqual(400)
  })
})

