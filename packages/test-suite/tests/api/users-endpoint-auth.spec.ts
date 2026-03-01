import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'
import { installDarkAuth } from '../../setup/install.js'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'
import { toBase64Url, fromBase64Url } from '@DarkAuth/api/src/utils/crypto.ts'

function readSetCookieValues(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headersWithSetCookie.getSetCookie === 'function') return headersWithSetCookie.getSetCookie()
  const raw = response.headers.get('set-cookie')
  if (!raw) return []
  return raw.split(/,(?=\s*__Host-)/g)
}

function readSessionCookieHeader(response: Response): string {
  const cookiePairs = readSetCookieValues(response)
    .map((line) => line.split(';')[0]?.trim())
    .filter((line): line is string => !!line)
  const authCookie = cookiePairs.find((cookie) => cookie.startsWith('__Host-DarkAuth-User='))
  const csrfCookie = cookiePairs.find((cookie) => cookie.startsWith('__Host-DarkAuth-User-Csrf='))
  const refreshCookie = cookiePairs.find((cookie) =>
    cookie.startsWith('__Host-DarkAuth-User-Refresh=')
  )
  if (!authCookie || !csrfCookie || !refreshCookie) throw new Error('missing user session cookies')
  return [authCookie, csrfCookie, refreshCookie].join('; ')
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) throw new Error('invalid jwt')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
}

async function opaqueLoginFinish(
  userUrl: string,
  email: string,
  password: string
): Promise<{ cookieHeader: string; clientId: string }> {
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
  const finishJson = await resFinish.json() as { accessToken?: string }
  const aud = typeof finishJson.accessToken === 'string'
    ? decodeJwtPayload(finishJson.accessToken).aud
    : null
  if (typeof aud !== 'string' || !aud) throw new Error('missing client audience in access token')
  return { cookieHeader: readSessionCookieHeader(resFinish), clientId: aud }
}

async function getUserJwt(userUrl: string, cookieHeader: string, clientId: string) {
  const tokenRes = await fetch(`${userUrl}/api/user/token`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: userUrl
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId
    })
  })
  expect(tokenRes.ok).toBeTruthy()
  const tokenJson = await tokenRes.json() as { id_token: string }
  return tokenJson.id_token
}

async function getClientCredentialsAccessToken(
  userUrl: string,
  clientId: string,
  clientSecret: string,
  scope: string
) {
  const authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  const tokenRes = await fetch(`${userUrl}/api/user/token`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: userUrl
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope
    })
  })
  expect(tokenRes.ok).toBeTruthy()
  const tokenJson = await tokenRes.json() as { access_token?: string; token_type?: string }
  expect(tokenJson.token_type).toBe('Bearer')
  expect(typeof tokenJson.access_token).toBe('string')
  return tokenJson.access_token as string
}

test.describe('API - Users endpoint auth methods', () => {
  test.describe.configure({ mode: 'serial' })

  let servers: TestServers
  let targetSub: string
  let targetName: string
  let targetEmail: string
  let userJwt: string
  let plainUserJwt: string
  let demoConfidentialSecret: string

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-users-endpoint-auth' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })

    const adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })

    const secretRes = await fetch(`${servers.adminUrl}/admin/clients/demo-confidential-client/secret`, {
      headers: { Cookie: adminSession.cookieHeader, Origin: servers.adminUrl }
    })
    expect(secretRes.ok).toBeTruthy()
    const secretJson = await secretRes.json() as { clientSecret: string | null }
    if (!secretJson.clientSecret) throw new Error('demo-confidential-client secret missing')
    demoConfidentialSecret = secretJson.clientSecret

    const permissionRes = await fetch(`${servers.adminUrl}/admin/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken
      },
      body: JSON.stringify({
        key: 'darkauth.users:read',
        description: 'Allows searching and reading users from the user directory endpoints'
      })
    })
    expect([201, 409].includes(permissionRes.status)).toBeTruthy()

    const updateSupportDeskRes = await fetch(`${servers.adminUrl}/admin/clients/demo-confidential-client`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken
      },
      body: JSON.stringify({
        grantTypes: ['authorization_code', 'client_credentials'],
        scopes: ['openid', 'profile', 'darkauth.users:read']
      })
    })
    expect(updateSupportDeskRes.ok).toBeTruthy()

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
          Cookie: adminSession.cookieHeader,
          Origin: servers.adminUrl,
          'x-csrf-token': adminSession.csrfToken
        },
        body: JSON.stringify({ permissionKeys: ['darkauth.users:read'] })
      }
    )
    expect(updatePermissionsRes.ok).toBeTruthy()

    const loginResult = await opaqueLoginFinish(servers.userUrl, reader.email, reader.password)
    userJwt = await getUserJwt(servers.userUrl, loginResult.cookieHeader, loginResult.clientId)
    const plainLoginResult = await opaqueLoginFinish(servers.userUrl, plain.email, plain.password)
    plainUserJwt = await getUserJwt(
      servers.userUrl,
      plainLoginResult.cookieHeader,
      plainLoginResult.clientId
    )
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

  test('client_credentials bearer returns management user shape', async () => {
    const managementAccessToken = await getClientCredentialsAccessToken(
      servers.userUrl,
      'demo-confidential-client',
      demoConfidentialSecret,
      'darkauth.users:read'
    )
    const res = await fetch(`${servers.userUrl}/api/user/users/${encodeURIComponent(targetSub)}`, {
      headers: {
        Authorization: `Bearer ${managementAccessToken}`,
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

  test('Invalid client secret is rejected at token endpoint', async () => {
    const invalidAuthorization = `Basic ${Buffer.from('demo-confidential-client:not-the-secret').toString('base64')}`
    const res = await fetch(`${servers.userUrl}/api/user/token`, {
      method: 'POST',
      headers: {
        Authorization: invalidAuthorization,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'darkauth.users:read'
      })
    })
    expect(res.status).toBe(401)
  })

  test('Unauthorized scope is rejected at token endpoint', async () => {
    const authorization = `Basic ${Buffer.from(`demo-confidential-client:${demoConfidentialSecret}`).toString('base64')}`
    const res = await fetch(`${servers.userUrl}/api/user/token`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'darkauth.admin'
      })
    })
    expect(res.status).toBe(400)
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
