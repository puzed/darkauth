import { test, expect } from '@playwright/test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'
import { installDarkAuth } from '../../setup/install.js'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { getAdminSession } from '../../setup/helpers/auth.js'
import { sha256Base64Url } from '@DarkAuth/api/src/utils/crypto.ts'

type Session = { cookieHeader: string; csrfToken: string }
type MockOidcClaims = {
  sub: string
  email: string
  emailVerified: boolean
  name: string
  nonce: string
}
type MockOidcProvider = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksUri: string
  prepareCode: (code: string, claims: MockOidcClaims) => void
  stop: () => Promise<void>
}

function readSetCookieValues(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headersWithSetCookie.getSetCookie === 'function') return headersWithSetCookie.getSetCookie()
  const raw = response.headers.get('set-cookie')
  if (!raw) return []
  return raw.split(/,(?=\s*__Host-)/g)
}

function cookieHeaderFromResponse(response: Response): string {
  return readSetCookieValues(response)
    .map((line) => line.split(';')[0]?.trim())
    .filter((line): line is string => !!line)
    .join('; ')
}

function readSessionFromResponse(response: Response): Session {
  const cookies = cookieHeaderFromResponse(response).split(/;\s*/).filter(Boolean)
  const authCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User='))
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User-Csrf='))
  if (!authCookie || !csrfCookie) throw new Error('missing user session cookies')
  return {
    cookieHeader: [authCookie, csrfCookie].join('; '),
    csrfToken: decodeURIComponent(csrfCookie.slice('__Host-DarkAuth-User-Csrf='.length)),
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) throw new Error('Invalid JWT format')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(value))
}

async function createMockOidcProvider(): Promise<MockOidcProvider> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const publicJwk = await exportJWK(publicKey) as JWK & { kid?: string; alg?: string; use?: string }
  publicJwk.kid = 'mock-key'
  publicJwk.alg = 'RS256'
  publicJwk.use = 'sig'
  const claimsByCode = new Map<string, MockOidcClaims>()
  let issuer = ''
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', issuer || 'http://localhost')
      if (url.pathname === '/oauth/token') {
        const body = new URLSearchParams(await readBody(request))
        const code = body.get('code') || ''
        const claims = claimsByCode.get(code)
        if (!claims) return sendJson(response, 400, { error: 'invalid_grant' })
        const idToken = await new SignJWT({
          email: claims.email,
          email_verified: claims.emailVerified,
          name: claims.name,
          nonce: claims.nonce,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'mock-key' })
          .setIssuer(issuer)
          .setSubject(claims.sub)
          .setAudience('mock-oidc-client')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey)
        return sendJson(response, 200, {
          id_token: idToken,
          access_token: `access-${code}`,
          token_type: 'Bearer',
        })
      }
      if (url.pathname === '/oauth/jwks') return sendJson(response, 200, { keys: [publicJwk] })
      if (url.pathname === '/oauth/userinfo') {
        return sendJson(response, 200, { sub: 'unused' })
      }
      response.statusCode = 404
      response.end('not found')
    } catch (error) {
      response.statusCode = 500
      response.end(error instanceof Error ? error.message : 'mock oidc error')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  issuer = `http://localhost:${port}`
  return {
    issuer,
    authorizationEndpoint: `${issuer}/oauth/authorize`,
    tokenEndpoint: `${issuer}/oauth/token`,
    jwksUri: `${issuer}/oauth/jwks`,
    prepareCode: (code, claims) => claimsByCode.set(code, claims),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

async function createFederationConnection(input: {
  servers: TestServers
  adminSession: Session
  provider: MockOidcProvider
}) {
  const res = await fetch(`${input.servers.adminUrl}/admin/federation/connections`, {
    method: 'POST',
    headers: {
      Cookie: input.adminSession.cookieHeader,
      Origin: input.servers.adminUrl,
      'x-csrf-token': input.adminSession.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Mock OIDC',
      issuer: input.provider.issuer,
      clientId: 'mock-oidc-client',
      authorizationEndpoint: input.provider.authorizationEndpoint,
      tokenEndpoint: input.provider.tokenEndpoint,
      jwksUri: input.provider.jwksUri,
      scopes: ['openid', 'profile', 'email'],
      accountLinkingPolicy: 'email_verified',
      domains: ['example.com'],
      enabled: true,
    })
  })
  if (!res.ok) throw new Error(`create federation connection failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { id: string }
  return json.id
}

async function createClient(input: {
  servers: TestServers
  adminSession: Session
  clientId: string
  zk: boolean
}) {
  const redirectUri = `${input.servers.userUrl}/callback/${input.clientId}`
  const res = await fetch(`${input.servers.adminUrl}/admin/clients`, {
    method: 'POST',
    headers: {
      Cookie: input.adminSession.cookieHeader,
      Origin: input.servers.adminUrl,
      'x-csrf-token': input.adminSession.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: input.clientId,
      name: input.clientId,
      type: 'public',
      tokenEndpointAuthMethod: 'none',
      requirePkce: true,
      zkDelivery: input.zk ? 'fragment-jwe' : 'none',
      zkRequired: input.zk,
      keyDeliveryVersion: 'v2',
      clientKeyScope: 'account',
      redirectUris: [redirectUri],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scopes: ['openid', 'profile'],
      allowedZkOrigins: [input.servers.userUrl],
    })
  })
  if (!res.ok) throw new Error(`create client failed: ${res.status} ${await res.text()}`)
  return redirectUri
}

async function federationLogin(input: {
  servers: TestServers
  provider: MockOidcProvider
  connectionId: string
  subject: string
  email: string
  name: string
}) {
  const start = await fetch(
    `${input.servers.userUrl}/api/user/federation/oidc/start?connection_id=${encodeURIComponent(input.connectionId)}&return_to=%2Fdashboard`,
    { method: 'GET', redirect: 'manual' }
  )
  expect(start.status).toBe(302)
  const startCookie = cookieHeaderFromResponse(start)
  const location = start.headers.get('location')
  if (!location) throw new Error('federation start missing location')
  const upstream = new URL(location)
  const state = upstream.searchParams.get('state')
  const nonce = upstream.searchParams.get('nonce')
  if (!state || !nonce) throw new Error('federation start missing state or nonce')
  const code = `code-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  input.provider.prepareCode(code, {
    sub: input.subject,
    email: input.email,
    emailVerified: true,
    name: input.name,
    nonce,
  })
  const callback = await fetch(
    `${input.servers.userUrl}/api/user/federation/oidc/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
    {
      method: 'GET',
      headers: { Cookie: startCookie },
      redirect: 'manual',
    }
  )
  if (callback.status !== 302) {
    throw new Error(`federation callback failed: ${callback.status} ${await callback.text()}`)
  }
  return readSessionFromResponse(callback)
}

async function getSessionInfo(servers: TestServers, session: Session) {
  const res = await fetch(`${servers.userUrl}/api/user/session`, {
    headers: {
      Cookie: session.cookieHeader,
      Origin: servers.userUrl,
    },
  })
  if (!res.ok) throw new Error(`session failed: ${res.status} ${await res.text()}`)
  return await res.json() as {
    sub: string
    email: string
    keyState: string
    organizationId?: string
  }
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

async function beginAuthorization(input: {
  servers: TestServers
  session: Session
  clientId: string
  redirectUri: string
  zk: boolean
}) {
  const codeVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
  const codeChallenge = sha256Base64Url(codeVerifier)
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state: `state-${Date.now().toString(36)}`,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  if (input.zk) params.set('zk_pub', await createZkPub())
  const res = await fetch(`${input.servers.userUrl}/api/user/authorize?${params.toString()}`, {
    method: 'GET',
    headers: {
      Cookie: input.session.cookieHeader,
      Origin: input.servers.userUrl,
    },
    redirect: 'manual',
  })
  if (res.status !== 302) throw new Error(`authorize failed: ${res.status} ${await res.text()}`)
  const location = res.headers.get('location')
  if (!location) throw new Error('authorize missing location')
  const redirectParams = new URL(location, input.servers.userUrl).searchParams
  const requestId = redirectParams.get('request_id')
  if (!requestId) throw new Error('authorize missing request id')
  return { requestId, codeVerifier, redirectParams }
}

async function finalizeAuthorization(input: {
  servers: TestServers
  session: Session
  requestId: string
  zkKeyHash?: string
}) {
  const body = new URLSearchParams({ request_id: input.requestId })
  if (input.zkKeyHash) body.set('zk_key_hash', input.zkKeyHash)
  return await fetch(`${input.servers.userUrl}/api/user/authorize/finalize`, {
    method: 'POST',
    headers: {
      Cookie: input.session.cookieHeader,
      Origin: input.servers.userUrl,
      'x-csrf-token': input.session.csrfToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
}

async function exchangeCode(input: {
  servers: TestServers
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}) {
  const res = await fetch(`${input.servers.userUrl}/api/user/token`, {
    method: 'POST',
    headers: {
      Origin: input.servers.userUrl,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      code_verifier: input.codeVerifier,
    }),
  })
  if (!res.ok) throw new Error(`token failed: ${res.status} ${await res.text()}`)
  return await res.json() as Record<string, unknown>
}

async function completeNonZkAuthorization(input: {
  servers: TestServers
  session: Session
  clientId: string
  redirectUri: string
}) {
  const auth = await beginAuthorization({ ...input, zk: false })
  expect(auth.redirectParams.get('has_zk')).toBeNull()
  expect(auth.redirectParams.get('key_delivery_version')).toBeNull()
  const finalized = await finalizeAuthorization({
    servers: input.servers,
    session: input.session,
    requestId: auth.requestId,
  })
  if (!finalized.ok) throw new Error(`finalize failed: ${finalized.status} ${await finalized.text()}`)
  const json = await finalized.json() as { code: string; redirect_uri: string }
  const token = await exchangeCode({
    servers: input.servers,
    code: json.code,
    redirectUri: input.redirectUri,
    clientId: input.clientId,
    codeVerifier: auth.codeVerifier,
  })
  expect(token.zk_key_hash).toBeUndefined()
  expect(token.zk_key_kind).toBeUndefined()
  expect(token.zk_key_version).toBeUndefined()
  expect(token.zk_drk_hash).toBeUndefined()
  return token
}

async function assertZkRequiresUnlock(input: {
  servers: TestServers
  session: Session
  clientId: string
  redirectUri: string
}) {
  const auth = await beginAuthorization({ ...input, zk: true })
  expect(auth.redirectParams.get('has_zk')).toBe('1')
  expect(auth.redirectParams.get('key_delivery_version')).toBe('v2')
  expect(auth.redirectParams.get('delivered_key_kind')).toBe('client_app_key')
  const finalized = await finalizeAuthorization({
    servers: input.servers,
    session: input.session,
    requestId: auth.requestId,
    zkKeyHash: 'mock-zk-key-hash',
  })
  expect(finalized.status).toBe(400)
  expect(await finalized.text()).toContain('Key unlock is required')
}

async function createScimToken(servers: TestServers, adminSession: Session) {
  const res = await fetch(`${servers.adminUrl}/admin/scim/tokens`, {
    method: 'POST',
    headers: {
      Cookie: adminSession.cookieHeader,
      Origin: servers.adminUrl,
      'x-csrf-token': adminSession.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Provisioning E2E' }),
  })
  if (!res.ok) throw new Error(`create scim token failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { token: string }
  return json.token
}

async function provisionScimUser(input: {
  servers: TestServers
  token: string
  email: string
  name: string
}) {
  const res = await fetch(`${input.servers.userUrl}/api/user/scim/v2/Users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      externalId: `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      userName: input.email,
      name: { formatted: input.name },
      displayName: input.name,
      active: true,
      emails: [{ value: input.email, primary: true }],
    }),
  })
  if (!res.ok) throw new Error(`provision scim user failed: ${res.status} ${await res.text()}`)
  return await res.json() as { id: string; userName: string }
}

async function getUnlockPolicy(servers: TestServers, session: Session) {
  const res = await fetch(`${servers.userUrl}/api/user/crypto/unlock-policy`, {
    headers: {
      Cookie: session.cookieHeader,
      Origin: servers.userUrl,
    },
  })
  if (!res.ok) throw new Error(`unlock policy failed: ${res.status} ${await res.text()}`)
  return await res.json() as {
    policy: {
      managed: boolean
      allow_new_key_setup: boolean
      require_key_unlock_for_zk: boolean
      reason: string | null
    }
  }
}

test.describe('API - user key management federation and SCIM E2E', () => {
  test.describe.configure({ mode: 'serial' })

  let servers: TestServers
  let provider: MockOidcProvider
  let adminSession: Session
  let connectionId: string
  let scimToken: string

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-user-key-management-provisioning' })
    provider = await createMockOidcProvider()
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })
    adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })
    connectionId = await createFederationConnection({ servers, adminSession, provider })
    scimToken = await createScimToken(servers, adminSession)
  })

  test.afterAll(async () => {
    if (provider) await provider.stop()
    if (servers) await destroyTestServers(servers)
  })

  test('SSO login to a non-ZK client completes without key delivery metadata', async () => {
    const suffix = Date.now().toString(36)
    const email = `sso-non-zk-${suffix}@example.com`
    const session = await federationLogin({
      servers,
      provider,
      connectionId,
      subject: `sso-non-zk-${suffix}`,
      email,
      name: 'SSO Non ZK',
    })
    const info = await getSessionInfo(servers, session)
    expect(info.email).toBe(email)
    expect(info.keyState).toBe('locked')
    const clientId = `sso-non-zk-${suffix}`
    const redirectUri = await createClient({ servers, adminSession, clientId, zk: false })
    const token = await completeNonZkAuthorization({ servers, session, clientId, redirectUri })
    const idClaims = decodeJwtPayload(String(token.id_token))
    expect(idClaims.sub).toBe(info.sub)
  })

  test('SSO login to a ZK client requires a separate unlock', async () => {
    const suffix = Date.now().toString(36)
    const email = `sso-zk-${suffix}@example.com`
    const session = await federationLogin({
      servers,
      provider,
      connectionId,
      subject: `sso-zk-${suffix}`,
      email,
      name: 'SSO ZK',
    })
    const info = await getSessionInfo(servers, session)
    expect(info.keyState).toBe('locked')
    const clientId = `sso-zk-${suffix}`
    const redirectUri = await createClient({ servers, adminSession, clientId, zk: true })
    await assertZkRequiresUnlock({ servers, session, clientId, redirectUri })
  })

  test('SCIM-provisioned first SSO login to a non-ZK client completes without key delivery metadata', async () => {
    const suffix = Date.now().toString(36)
    const email = `scim-non-zk-${suffix}@example.com`
    const scimUser = await provisionScimUser({
      servers,
      token: scimToken,
      email,
      name: 'SCIM Non ZK',
    })
    const session = await federationLogin({
      servers,
      provider,
      connectionId,
      subject: `scim-non-zk-${suffix}`,
      email,
      name: 'SCIM Non ZK',
    })
    const info = await getSessionInfo(servers, session)
    expect(info.sub).toBe(scimUser.id)
    expect(info.keyState).toBe('locked')
    const policy = await getUnlockPolicy(servers, session)
    expect(policy.policy.managed).toBe(true)
    expect(policy.policy.reason).toBe('scim')
    const clientId = `scim-non-zk-${suffix}`
    const redirectUri = await createClient({ servers, adminSession, clientId, zk: false })
    await completeNonZkAuthorization({ servers, session, clientId, redirectUri })
  })

  test('SCIM-provisioned first SSO login to a ZK client requires setup or unlock', async () => {
    const suffix = Date.now().toString(36)
    const email = `scim-zk-${suffix}@example.com`
    const scimUser = await provisionScimUser({
      servers,
      token: scimToken,
      email,
      name: 'SCIM ZK',
    })
    const session = await federationLogin({
      servers,
      provider,
      connectionId,
      subject: `scim-zk-${suffix}`,
      email,
      name: 'SCIM ZK',
    })
    const info = await getSessionInfo(servers, session)
    expect(info.sub).toBe(scimUser.id)
    expect(info.keyState).toBe('locked')
    const policy = await getUnlockPolicy(servers, session)
    expect(policy.policy.managed).toBe(true)
    expect(policy.policy.allow_new_key_setup).toBe(true)
    expect(policy.policy.require_key_unlock_for_zk).toBe(true)
    const clientId = `scim-zk-${suffix}`
    const redirectUri = await createClient({ servers, adminSession, clientId, zk: true })
    await assertZkRequiresUnlock({ servers, session, clientId, redirectUri })
  })
})
