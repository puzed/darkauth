import { test, expect } from '@playwright/test'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'
import { installDarkAuth } from '../../setup/install.js'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { createUserViaAdmin, getAdminBearerToken } from '../../setup/helpers/auth.js'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'
import { toBase64Url, fromBase64Url, sha256Base64Url } from '@DarkAuth/api/src/utils/crypto.ts'

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

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) throw new Error('Invalid JWT format')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
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

test.describe('API - OIDC nonce auth code flow', () => {
  test.describe.configure({ mode: 'serial' })

  let servers: TestServers

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-oidc-nonce-auth-code-flow' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('stores nonce from authorize request and emits it in id_token', async () => {
    const user = {
      email: `nonce-flow-${Date.now()}@example.com`,
      name: 'Nonce Flow User',
      password: 'Passw0rd!123'
    }

    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user)
    const loginResult = await opaqueLoginFinish(servers.userUrl, user.email, user.password)
    const adminToken = await getAdminBearerToken(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })
    const clientsRes = await fetch(`${servers.adminUrl}/admin/clients`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl
      }
    })
    expect(clientsRes.ok).toBeTruthy()
    const clientsJson = await clientsRes.json() as {
      clients: Array<{ clientId: string; redirectUris: string[] }>
    }
    const publicClient = clientsJson.clients.find((client) => client.clientId === 'demo-public-client')
    expect(publicClient).toBeTruthy()
    const redirectUri = publicClient?.redirectUris?.[0]
    expect(redirectUri).toBeTruthy()
    if (!redirectUri) throw new Error('demo-public-client is missing redirect URI')

    const nonce = `nonce-${Date.now().toString(36)}`
    const state = `state-${Date.now().toString(36)}`
    const codeVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const codeChallenge = sha256Base64Url(codeVerifier)
    const zkPub = await createZkPub()

    const authorizeRes = await fetch(`${servers.userUrl}/api/user/authorize?${new URLSearchParams({
      client_id: 'demo-public-client',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      zk_pub: zkPub
    }).toString()}`, {
      method: 'GET',
      redirect: 'manual'
    })

    if (authorizeRes.status !== 302) {
      const errorBody = await authorizeRes.text()
      throw new Error(`authorize failed: ${authorizeRes.status} ${errorBody}`)
    }
    const location = authorizeRes.headers.get('location')
    expect(location).toBeTruthy()
    if (!location) throw new Error('Missing authorize redirect location')
    const authorizeRedirectUrl = new URL(location, servers.userUrl)
    const requestId = authorizeRedirectUrl.searchParams.get('request_id')
    expect(requestId).toBeTruthy()
    if (!requestId) throw new Error('Missing request_id')

    const finalizeRes = await fetch(`${servers.userUrl}/api/user/authorize/finalize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginResult.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({ request_id: requestId })
    })

    expect(finalizeRes.ok).toBeTruthy()
    const finalizeJson = await finalizeRes.json() as { code: string; state?: string; redirect_uri: string }
    expect(finalizeJson.code).toBeTruthy()
    expect(finalizeJson.state).toBe(state)
    expect(finalizeJson.redirect_uri).toBe(redirectUri)

    const tokenRes = await fetch(`${servers.userUrl}/api/user/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: finalizeJson.code,
        redirect_uri: redirectUri,
        client_id: 'demo-public-client',
        code_verifier: codeVerifier,
        nonce: 'attacker-controlled-nonce'
      })
    })

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text()
      throw new Error(`token failed: ${tokenRes.status} ${errorBody}`)
    }
    const tokenJson = await tokenRes.json() as { id_token: string }
    const claims = decodeJwtPayload(tokenJson.id_token)

    expect(claims.nonce).toBe(nonce)
  })

  test('deny finalize returns access_denied without authorization code', async () => {
    const user = {
      email: `nonce-deny-${Date.now()}@example.com`,
      name: 'Nonce Deny User',
      password: 'Passw0rd!123'
    }

    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user)
    const loginResult = await opaqueLoginFinish(servers.userUrl, user.email, user.password)
    const adminToken = await getAdminBearerToken(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })
    const clientsRes = await fetch(`${servers.adminUrl}/admin/clients`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl
      }
    })
    expect(clientsRes.ok).toBeTruthy()
    const clientsJson = await clientsRes.json() as {
      clients: Array<{ clientId: string; redirectUris: string[] }>
    }
    const publicClient = clientsJson.clients.find((client) => client.clientId === 'demo-public-client')
    expect(publicClient).toBeTruthy()
    const redirectUri = publicClient?.redirectUris?.[0]
    expect(redirectUri).toBeTruthy()
    if (!redirectUri) throw new Error('demo-public-client is missing redirect URI')

    const state = `state-${Date.now().toString(36)}`
    const codeVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const codeChallenge = sha256Base64Url(codeVerifier)
    const zkPub = await createZkPub()

    const authorizeRes = await fetch(`${servers.userUrl}/api/user/authorize?${new URLSearchParams({
      client_id: 'demo-public-client',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      zk_pub: zkPub
    }).toString()}`, {
      method: 'GET',
      redirect: 'manual'
    })

    if (authorizeRes.status !== 302) {
      const errorBody = await authorizeRes.text()
      throw new Error(`authorize failed: ${authorizeRes.status} ${errorBody}`)
    }
    const location = authorizeRes.headers.get('location')
    expect(location).toBeTruthy()
    if (!location) throw new Error('Missing authorize redirect location')
    const authorizeRedirectUrl = new URL(location, servers.userUrl)
    const requestId = authorizeRedirectUrl.searchParams.get('request_id')
    expect(requestId).toBeTruthy()
    if (!requestId) throw new Error('Missing request_id')

    const finalizeRes = await fetch(`${servers.userUrl}/api/user/authorize/finalize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginResult.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({ request_id: requestId, approve: 'false' })
    })

    expect(finalizeRes.ok).toBeTruthy()
    const finalizeJson = await finalizeRes.json() as {
      error?: string
      error_description?: string
      code?: string
      state?: string
      redirect_uri: string
    }
    expect(finalizeJson.error).toBe('access_denied')
    expect(finalizeJson.error_description).toBeTruthy()
    expect(finalizeJson.state).toBe(state)
    expect(finalizeJson.redirect_uri).toBe(redirectUri)
    expect(finalizeJson.code).toBeUndefined()
  })

  test('authorization code can only be redeemed once under concurrent requests', async () => {
    const user = {
      email: `nonce-race-${Date.now()}@example.com`,
      name: 'Nonce Race User',
      password: 'Passw0rd!123'
    }

    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user)
    const loginResult = await opaqueLoginFinish(servers.userUrl, user.email, user.password)
    const adminToken = await getAdminBearerToken(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })
    const clientsRes = await fetch(`${servers.adminUrl}/admin/clients`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl
      }
    })
    expect(clientsRes.ok).toBeTruthy()
    const clientsJson = await clientsRes.json() as {
      clients: Array<{ clientId: string; redirectUris: string[] }>
    }
    const publicClient = clientsJson.clients.find((client) => client.clientId === 'demo-public-client')
    expect(publicClient).toBeTruthy()
    const redirectUri = publicClient?.redirectUris?.[0]
    expect(redirectUri).toBeTruthy()
    if (!redirectUri) throw new Error('demo-public-client is missing redirect URI')

    const nonce = `nonce-${Date.now().toString(36)}`
    const state = `state-${Date.now().toString(36)}`
    const codeVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
    const codeChallenge = sha256Base64Url(codeVerifier)
    const zkPub = await createZkPub()

    const authorizeRes = await fetch(`${servers.userUrl}/api/user/authorize?${new URLSearchParams({
      client_id: 'demo-public-client',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      zk_pub: zkPub
    }).toString()}`, {
      method: 'GET',
      redirect: 'manual'
    })

    if (authorizeRes.status !== 302) {
      const errorBody = await authorizeRes.text()
      throw new Error(`authorize failed: ${authorizeRes.status} ${errorBody}`)
    }
    const location = authorizeRes.headers.get('location')
    expect(location).toBeTruthy()
    if (!location) throw new Error('Missing authorize redirect location')
    const authorizeRedirectUrl = new URL(location, servers.userUrl)
    const requestId = authorizeRedirectUrl.searchParams.get('request_id')
    expect(requestId).toBeTruthy()
    if (!requestId) throw new Error('Missing request_id')

    const finalizeRes = await fetch(`${servers.userUrl}/api/user/authorize/finalize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginResult.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({ request_id: requestId })
    })

    expect(finalizeRes.ok).toBeTruthy()
    const finalizeJson = await finalizeRes.json() as { code: string; redirect_uri: string }
    expect(finalizeJson.code).toBeTruthy()
    expect(finalizeJson.redirect_uri).toBe(redirectUri)

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: finalizeJson.code,
      redirect_uri: redirectUri,
      client_id: 'demo-public-client',
      code_verifier: codeVerifier
    })

    const [firstTokenRes, secondTokenRes] = await Promise.all([
      fetch(`${servers.userUrl}/api/user/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: servers.userUrl
        },
        body
      }),
      fetch(`${servers.userUrl}/api/user/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: servers.userUrl
        },
        body: new URLSearchParams(body)
      })
    ])

    const successCount = [firstTokenRes, secondTokenRes].filter((res) => res.ok).length
    expect(successCount).toBe(1)

    const failedResponse = firstTokenRes.ok ? secondTokenRes : firstTokenRes
    expect(failedResponse.status).toBe(400)
    const failedBody = await failedResponse.json() as { error?: string }
    expect(failedBody.error).toBe('invalid_grant')
  })

  test('confidential client authorization code can only be redeemed once under concurrent requests', async () => {
    const user = {
      email: `nonce-race-confidential-${Date.now()}@example.com`,
      name: 'Nonce Race Confidential User',
      password: 'Passw0rd!123'
    }

    await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, user)
    const loginResult = await opaqueLoginFinish(servers.userUrl, user.email, user.password)
    const adminToken = await getAdminBearerToken(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })
    const secretRes = await fetch(`${servers.adminUrl}/admin/clients/demo-confidential-client/secret`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl
      }
    })
    expect(secretRes.ok).toBeTruthy()
    const secretJson = await secretRes.json() as { clientSecret: string | null }
    if (!secretJson.clientSecret) throw new Error('demo-confidential-client secret missing')

    const clientsRes = await fetch(`${servers.adminUrl}/admin/clients`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: servers.adminUrl
      }
    })
    expect(clientsRes.ok).toBeTruthy()
    const clientsJson = await clientsRes.json() as {
      clients: Array<{ clientId: string; redirectUris: string[] }>
    }
    const confidentialClient = clientsJson.clients.find((client) => client.clientId === 'demo-confidential-client')
    expect(confidentialClient).toBeTruthy()
    const redirectUri = confidentialClient?.redirectUris?.[0]
    expect(redirectUri).toBeTruthy()
    if (!redirectUri) throw new Error('demo-confidential-client is missing redirect URI')

    const state = `state-${Date.now().toString(36)}`
    const nonce = `nonce-${Date.now().toString(36)}`
    const authorizeRes = await fetch(`${servers.userUrl}/api/user/authorize?${new URLSearchParams({
      client_id: 'demo-confidential-client',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce
    }).toString()}`, {
      method: 'GET',
      redirect: 'manual'
    })

    if (authorizeRes.status !== 302) {
      const errorBody = await authorizeRes.text()
      throw new Error(`authorize failed: ${authorizeRes.status} ${errorBody}`)
    }
    const location = authorizeRes.headers.get('location')
    expect(location).toBeTruthy()
    if (!location) throw new Error('Missing authorize redirect location')
    const authorizeRedirectUrl = new URL(location, servers.userUrl)
    const requestId = authorizeRedirectUrl.searchParams.get('request_id')
    expect(requestId).toBeTruthy()
    if (!requestId) throw new Error('Missing request_id')

    const finalizeRes = await fetch(`${servers.userUrl}/api/user/authorize/finalize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginResult.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: servers.userUrl
      },
      body: new URLSearchParams({ request_id: requestId })
    })

    expect(finalizeRes.ok).toBeTruthy()
    const finalizeJson = await finalizeRes.json() as { code: string; redirect_uri: string }
    expect(finalizeJson.code).toBeTruthy()
    expect(finalizeJson.redirect_uri).toBe(redirectUri)

    const authorization = `Basic ${Buffer.from(`demo-confidential-client:${secretJson.clientSecret}`).toString('base64')}`
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: finalizeJson.code,
      redirect_uri: redirectUri
    })

    const [firstTokenRes, secondTokenRes] = await Promise.all([
      fetch(`${servers.userUrl}/api/user/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: servers.userUrl,
          Authorization: authorization
        },
        body: tokenBody
      }),
      fetch(`${servers.userUrl}/api/user/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: servers.userUrl,
          Authorization: authorization
        },
        body: new URLSearchParams(tokenBody)
      })
    ])

    const successCount = [firstTokenRes, secondTokenRes].filter((res) => res.ok).length
    expect(successCount).toBe(1)

    const failedResponse = firstTokenRes.ok ? secondTokenRes : firstTokenRes
    expect(failedResponse.status).toBe(400)
    const failedBody = await failedResponse.json() as { error?: string }
    expect(failedBody.error).toBe('invalid_grant')
  })
})
