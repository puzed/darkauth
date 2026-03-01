import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'
import { installDarkAuth } from '../../setup/install.js'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'
import { toBase64Url, fromBase64Url, sha256Base64Url } from '@DarkAuth/api/src/utils/crypto.ts'

function readSetCookieValues(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headersWithSetCookie.getSetCookie === 'function') return headersWithSetCookie.getSetCookie()
  const raw = response.headers.get('set-cookie')
  if (!raw) return []
  return raw.split(/,(?=\s*__Host-)/g)
}

function readSessionFromLoginResponse(
  response: Response
): { cookieHeader: string; csrfToken: string } {
  const cookies = readSetCookieValues(response)
    .map((line) => line.split(';')[0]?.trim())
    .filter((line): line is string => !!line)
  const authCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User='))
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User-Csrf='))
  if (!authCookie || !csrfCookie) throw new Error('missing session cookies')
  const csrfToken = decodeURIComponent(csrfCookie.slice('__Host-DarkAuth-User-Csrf='.length))
  return {
    cookieHeader: [authCookie, csrfCookie].join('; '),
    csrfToken,
  }
}

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
  return readSessionFromLoginResponse(resFinish)
}

async function createZkPub(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return Buffer.from(JSON.stringify(publicJwk)).toString('base64url')
}

async function getClientRedirectUri(servers: TestServers, clientId: string): Promise<string> {
  const adminSession = await getAdminSession(servers, {
    email: FIXED_TEST_ADMIN.email,
    password: FIXED_TEST_ADMIN.password
  })
  const clientsRes = await fetch(`${servers.adminUrl}/admin/clients`, {
    headers: {
      Cookie: adminSession.cookieHeader,
      Origin: servers.adminUrl
    }
  })
  expect(clientsRes.ok).toBeTruthy()
  const clientsJson = await clientsRes.json() as {
    clients: Array<{ clientId: string; redirectUris: string[] }>
  }
  const client = clientsJson.clients.find((entry) => entry.clientId === clientId)
  expect(client).toBeTruthy()
  const redirectUri = client?.redirectUris?.[0]
  expect(redirectUri).toBeTruthy()
  if (!redirectUri) throw new Error(`${clientId} is missing redirect URI`)
  return redirectUri
}

async function createPublicAuthorizationCode(input: {
  servers: TestServers
  loginSession: { cookieHeader: string; csrfToken: string }
  redirectUri: string
}): Promise<{ code: string; codeVerifier: string }> {
  const codeVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
  const codeChallenge = sha256Base64Url(codeVerifier)
  const zkPub = await createZkPub()
  const authorizeRes = await fetch(`${input.servers.userUrl}/api/user/authorize?${new URLSearchParams({
    client_id: 'demo-public-client',
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state: `edge-state-${Date.now().toString(36)}`,
    nonce: `edge-nonce-${Date.now().toString(36)}`,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    zk_pub: zkPub
  }).toString()}`, {
    method: 'GET',
    redirect: 'manual'
  })
  if (authorizeRes.status !== 302) {
    throw new Error(`authorize failed: ${authorizeRes.status} ${await authorizeRes.text()}`)
  }
  const location = authorizeRes.headers.get('location')
  if (!location) throw new Error('Missing authorize redirect location')
  const requestId = new URL(location, input.servers.userUrl).searchParams.get('request_id')
  if (!requestId) throw new Error('Missing request_id')
  const finalizeRes = await fetch(`${input.servers.userUrl}/api/user/authorize/finalize`, {
    method: 'POST',
    headers: {
      Cookie: input.loginSession.cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: input.servers.userUrl,
      'x-csrf-token': input.loginSession.csrfToken,
    },
    body: new URLSearchParams({
      request_id: requestId,
      drk_hash: sha256Base64Url(`edge-drk-${requestId}`)
    })
  })
  expect(finalizeRes.ok).toBeTruthy()
  const finalizeJson = await finalizeRes.json() as { code?: string }
  expect(finalizeJson.code).toBeTruthy()
  if (!finalizeJson.code) throw new Error('Missing authorization code')
  return {
    code: finalizeJson.code,
    codeVerifier,
  }
}

test.describe('API - OIDC authorize/token edge cases', () => {
  test.describe.configure({ mode: 'serial' })

  let servers: TestServers
  let loginSession: { cookieHeader: string; csrfToken: string }
  let publicRedirectUri: string

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-oidc-auth-edge-cases' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })

    const user = {
      email: `oidc-edge-${Date.now()}@example.com`,
      name: 'OIDC Edge User',
      password: 'Passw0rd!123'
    }
    await createUserViaAdmin(
      servers,
      { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password },
      user
    )
    loginSession = await opaqueLoginFinish(servers.userUrl, user.email, user.password)
    publicRedirectUri = await getClientRedirectUri(servers, 'demo-public-client')
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('authorize rejects missing PKCE challenge for public client', async () => {
    const zkPub = await createZkPub()
    const authorizeRes = await fetch(`${servers.userUrl}/api/user/authorize?${new URLSearchParams({
      client_id: 'demo-public-client',
      redirect_uri: publicRedirectUri,
      response_type: 'code',
      scope: 'openid profile',
      zk_pub: zkPub
    }).toString()}`, {
      method: 'GET'
    })
    expect(authorizeRes.status).toBe(400)
    const json = await authorizeRes.json() as { error?: string; error_description?: string }
    expect(json.error).toBe('invalid_request')
    expect(json.error_description).toBe('PKCE code_challenge is required')
  })

  test('authorize rejects invalid zk_pub payload', async () => {
    const codeVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const codeChallenge = sha256Base64Url(codeVerifier)
    const authorizeRes = await fetch(`${servers.userUrl}/api/user/authorize?${new URLSearchParams({
      client_id: 'demo-public-client',
      redirect_uri: publicRedirectUri,
      response_type: 'code',
      scope: 'openid profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      zk_pub: 'not-a-valid-base64url-json-jwk'
    }).toString()}`, {
      method: 'GET'
    })
    expect(authorizeRes.status).toBe(400)
    const json = await authorizeRes.json() as { error?: string; code?: string }
    expect(json.code).toBe('VALIDATION_ERROR')
    expect(typeof json.error).toBe('string')
  })

  test('token rejects redirect_uri mismatch for authorization code exchange', async () => {
    const issued = await createPublicAuthorizationCode({
      servers,
      loginSession,
      redirectUri: publicRedirectUri,
    })
    const mismatchedRedirectUri = `${new URL(publicRedirectUri).origin}/mismatched-callback`
    const tokenRes = await fetch(`${servers.userUrl}/api/user/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: issued.code,
        redirect_uri: mismatchedRedirectUri,
        client_id: 'demo-public-client',
        code_verifier: issued.codeVerifier
      })
    })
    expect(tokenRes.status).toBe(400)
    const json = await tokenRes.json() as { error?: string; error_description?: string }
    expect(json.error).toBe('invalid_grant')
    expect(json.error_description).toBe('redirect_uri does not match authorization request')
  })

  test('token requires code_verifier when PKCE was used at authorize', async () => {
    const issued = await createPublicAuthorizationCode({
      servers,
      loginSession,
      redirectUri: publicRedirectUri,
    })
    const tokenRes = await fetch(`${servers.userUrl}/api/user/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: issued.code,
        redirect_uri: publicRedirectUri,
        client_id: 'demo-public-client'
      })
    })
    expect(tokenRes.status).toBe(400)
    const json = await tokenRes.json() as { error?: string; error_description?: string }
    expect(json.error).toBe('invalid_request')
    expect(json.error_description).toBe('code_verifier is required when PKCE is used')
  })
})
