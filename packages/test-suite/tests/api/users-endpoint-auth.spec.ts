import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'
import { installDarkAuth } from '../../setup/install.js'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { createUserViaAdmin, getAdminBearerToken } from '../../setup/helpers/auth.js'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts'

async function opaqueLoginFinish(userUrl: string, email: string, password: string) {
  const client = new OpaqueClient()
  await client.initialize()
  const start = await client.startLogin(password, email)
  const resStart = await fetch(`${userUrl}/api/user/opaque/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request)) })
  })
  expect(resStart.ok).toBeTruthy()
  const startJson = await resStart.json() as { message: string; sessionId: string }
  const finish = await client.finishLogin(
    fromBase64Url(startJson.message),
    start.state,
    new Uint8Array(),
    'DarkAuth',
    email
  )
  const resFinish = await fetch(`${userUrl}/api/user/opaque/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: userUrl },
    body: JSON.stringify({ finish: toBase64Url(Buffer.from(finish.finish)), sessionId: startJson.sessionId })
  })
  expect(resFinish.ok).toBeTruthy()
  return await resFinish.json() as { accessToken: string; refreshToken: string }
}

async function getUserJwt(userUrl: string, refreshToken: string) {
  const tokenRes = await fetch(`${userUrl}/api/user/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: userUrl
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'app-web',
      refresh_token: refreshToken
    })
  })
  expect(tokenRes.ok).toBeTruthy()
  const tokenJson = await tokenRes.json() as { id_token: string }
  return tokenJson.id_token
}

test.describe('API - Users endpoint auth methods', () => {
  test.describe.configure({ mode: 'serial' })

  let servers: TestServers
  let targetSub: string
  let targetName: string
  let targetEmail: string
  let userJwt: string
  let plainUserJwt: string
  let supportDeskSecret: string

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-users-endpoint-auth' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })

    const adminToken = await getAdminBearerToken(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })

    const secretRes = await fetch(`${servers.adminUrl}/admin/clients/support-desk/secret`, {
      headers: { Authorization: `Bearer ${adminToken}`, Origin: servers.adminUrl }
    })
    expect(secretRes.ok).toBeTruthy()
    const secretJson = await secretRes.json() as { clientSecret: string | null }
    if (!secretJson.clientSecret) throw new Error('support-desk secret missing')
    supportDeskSecret = secretJson.clientSecret

    const permissionRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl
      },
      body: JSON.stringify({
        key: 'darkauth.users:read',
        description: 'Allows searching and reading users from the user directory endpoints'
      })
    })
    expect([201, 409].includes(permissionRes.status)).toBeTruthy()

    const reader = {
      email: `reader-${Date.now()}@example.com`,
      name: 'Directory Reader',
      password: 'Passw0rd!123'
    }
    const target = {
      email: `target-${Date.now()}@example.com`,
      name: 'Directory Target',
      password: 'Passw0rd!123'
    }
    const plain = {
      email: `plain-${Date.now()}@example.com`,
      name: 'Directory Plain',
      password: 'Passw0rd!123'
    }

    const { sub: readerSub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      reader
    )
    const { sub } = await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      target
    )
    await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      plain
    )
    targetSub = sub
    targetName = target.name
    targetEmail = target.email

    const updatePermissionsRes = await fetch(
      `${servers.adminUrl}/admin/users/${encodeURIComponent(readerSub)}/permissions`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          Origin: servers.adminUrl
        },
        body: JSON.stringify({ permissionKeys: ['darkauth.users:read'] })
      }
    )
    expect(updatePermissionsRes.ok).toBeTruthy()

    const loginResult = await opaqueLoginFinish(servers.userUrl, reader.email, reader.password)
    userJwt = await getUserJwt(servers.userUrl, loginResult.refreshToken)
    const plainLoginResult = await opaqueLoginFinish(servers.userUrl, plain.email, plain.password)
    plainUserJwt = await getUserJwt(servers.userUrl, plainLoginResult.refreshToken)
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('Bearer token with users:read returns directory entry shape', async () => {
    const res = await fetch(`${servers.userUrl}/api/user/users/${encodeURIComponent(targetSub)}`, {
      headers: {
        Authorization: `Bearer ${userJwt}`,
        Origin: servers.userUrl
      }
    })
    expect(res.status).toBe(200)
    const json = await res.json() as {
      sub: string
      display_name: string | null
      public_key_jwk?: unknown
      email?: unknown
    }
    expect(json.sub).toBe(targetSub)
    expect(json.display_name).toBe(targetName)
    expect('public_key_jwk' in json).toBeTruthy()
    expect('email' in json).toBeFalsy()
  })

  test('Basic client_secret_basic returns app secret user shape', async () => {
    const authorization = `Basic ${Buffer.from(`support-desk:${supportDeskSecret}`).toString('base64')}`
    const res = await fetch(`${servers.userUrl}/api/user/users/${encodeURIComponent(targetSub)}`, {
      headers: {
        Authorization: authorization,
        Origin: servers.userUrl
      }
    })
    expect(res.status).toBe(200)
    const json = await res.json() as {
      sub: string
      email: string | null
      name: string | null
      display_name?: unknown
      groups?: unknown[]
    }
    expect(json.sub).toBe(targetSub)
    expect(json.email).toBe(targetEmail)
    expect(json.name).toBe(targetName)
    expect('display_name' in json).toBeFalsy()
    expect(Array.isArray(json.groups)).toBeTruthy()
  })

  test('Missing authorization returns unauthorized', async () => {
    const res = await fetch(`${servers.userUrl}/api/user/users/${encodeURIComponent(targetSub)}`)
    expect(res.status).toBe(401)
  })

  test('Invalid client secret is rejected', async () => {
    const invalidAuthorization = `Basic ${Buffer.from('support-desk:not-the-secret').toString('base64')}`
    const res = await fetch(`${servers.userUrl}/api/user/users/${encodeURIComponent(targetSub)}`, {
      headers: {
        Authorization: invalidAuthorization,
        Origin: servers.userUrl
      }
    })
    expect(res.status).toBe(401)
  })

  test('Malformed bearer token is rejected', async () => {
    const res = await fetch(`${servers.userUrl}/api/user/users/${encodeURIComponent(targetSub)}`, {
      headers: {
        Authorization: 'Bearer definitely-not-a-jwt',
        Origin: servers.userUrl
      }
    })
    expect(res.status).toBe(401)
  })

  test('Bearer token without users:read permission is forbidden', async () => {
    const res = await fetch(`${servers.userUrl}/api/user/users/${encodeURIComponent(targetSub)}`, {
      headers: {
        Authorization: `Bearer ${plainUserJwt}`,
        Origin: servers.userUrl
      }
    })
    expect(res.status).toBe(403)
  })
})
