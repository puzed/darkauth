import { test, expect } from '@playwright/test'
import { CompactEncrypt, compactDecrypt, importJWK, type JWK } from 'jose'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'
import { installDarkAuth } from '../../setup/install.js'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js'
import { getOnlyOrganizationMembershipForUser } from '../../setup/helpers/rbac.js'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'
import { fromBase64Url, hkdf, sha256, sha256Base64Url, toBase64Url } from '@DarkAuth/api/src/utils/crypto.ts'

type Session = { cookieHeader: string; csrfToken: string }
type ZkKeyPair = { publicJwk: JWK; privateJwk: JWK; zkPub: string }
type ClientKeyPayload = {
  typ: string
  version: string
  sub: string
  client_id: string
  aud: string
  org_id?: string
  request_id: string
  state_hash: string
  redirect_uri_hash: string
  key_id: string
  key_kind: string
  cak: string
  iat: number
  exp: number
}

function readSetCookieValues(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headersWithSetCookie.getSetCookie === 'function') return headersWithSetCookie.getSetCookie()
  const raw = response.headers.get('set-cookie')
  if (!raw) return []
  return raw.split(/,(?=\s*__Host-)/g)
}

function readSessionFromLoginResponse(response: Response): Session {
  const cookies = readSetCookieValues(response)
    .map((line) => line.split(';')[0]?.trim())
    .filter((line): line is string => !!line)
  const authCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User='))
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('__Host-DarkAuth-User-Csrf='))
  if (!authCookie || !csrfCookie) throw new Error('missing session cookies')
  return {
    cookieHeader: [authCookie, csrfCookie].join('; '),
    csrfToken: decodeURIComponent(csrfCookie.slice('__Host-DarkAuth-User-Csrf='.length)),
  }
}

async function opaqueLoginFinish(userUrl: string, email: string, password: string): Promise<Session> {
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

async function createZkKeyPair(): Promise<ZkKeyPair> {
  const pair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  const publicJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey)
  const privateJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey)
  return {
    publicJwk: publicJwk as JWK,
    privateJwk: privateJwk as JWK,
    zkPub: Buffer.from(JSON.stringify(publicJwk)).toString('base64url')
  }
}

function deriveClientAppKey(input: {
  ark: Buffer
  sub: string
  keyId: string
  clientId: string
  organizationId?: string
}): Buffer {
  const salt = sha256(`DarkAuth|v2|client-key|sub=${input.sub}|key_id=${input.keyId}`)
  const orgPart = input.organizationId ? `|org_id=${input.organizationId}` : '|org_id='
  return hkdf(input.ark, salt, `client_id=${input.clientId}${orgPart}|aud=${input.clientId}`, 32)
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) throw new Error('Invalid JWT format')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
}

async function createClientKeyJwe(input: {
  payload: ClientKeyPayload
  publicJwk: JWK
}): Promise<string> {
  const key = await importJWK({ ...input.publicJwk, alg: undefined }, 'ECDH-ES')
  return await new CompactEncrypt(Buffer.from(JSON.stringify(input.payload)))
    .setProtectedHeader({ alg: 'ECDH-ES', enc: 'A256GCM' })
    .encrypt(key)
}

async function decryptClientKeyJwe(jwe: string, privateJwk: JWK): Promise<ClientKeyPayload> {
  const key = await importJWK({ ...privateJwk, alg: undefined }, 'ECDH-ES')
  const { plaintext } = await compactDecrypt(jwe, key)
  return JSON.parse(Buffer.from(plaintext).toString('utf8')) as ClientKeyPayload
}

async function createDrkJwe(input: {
  ark: Buffer
  publicJwk: JWK
  sub: string
  clientId: string
}): Promise<string> {
  const key = await importJWK({ ...input.publicJwk, alg: undefined }, 'ECDH-ES')
  return await new CompactEncrypt(input.ark)
    .setProtectedHeader({
      alg: 'ECDH-ES',
      enc: 'A256GCM',
      sub: input.sub,
      client_id: input.clientId
    })
    .encrypt(key)
}

async function decryptRawJwe(jwe: string, privateJwk: JWK): Promise<Buffer> {
  const key = await importJWK({ ...privateJwk, alg: undefined }, 'ECDH-ES')
  const { plaintext } = await compactDecrypt(jwe, key)
  return Buffer.from(plaintext)
}

async function createClient(input: {
  servers: TestServers
  adminSession: Session
  clientId: string
  keyDeliveryVersion?: 'v1-drk' | 'v2'
  deliveredKeyKind?: 'root_key' | 'client_app_key'
  clientKeyScope?: 'account' | 'organization'
}): Promise<string> {
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
      zkDelivery: 'fragment-jwe',
      zkRequired: true,
      keyDeliveryVersion: input.keyDeliveryVersion ?? 'v2',
      deliveredKeyKind: input.deliveredKeyKind,
      clientKeyScope: input.clientKeyScope ?? 'organization',
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

async function createOrganization(input: {
  servers: TestServers
  adminSession: Session
  slug: string
  name: string
}): Promise<string> {
  const res = await fetch(`${input.servers.adminUrl}/admin/organizations`, {
    method: 'POST',
    headers: {
      Cookie: input.adminSession.cookieHeader,
      Origin: input.servers.adminUrl,
      'x-csrf-token': input.adminSession.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ slug: input.slug, name: input.name })
  })
  if (!res.ok) throw new Error(`create organization failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { organization: { id: string } }
  return json.organization.id
}

async function addOrganizationMember(input: {
  servers: TestServers
  adminSession: Session
  organizationId: string
  sub: string
}): Promise<void> {
  const res = await fetch(`${input.servers.adminUrl}/admin/organizations/${input.organizationId}/members`, {
    method: 'POST',
    headers: {
      Cookie: input.adminSession.cookieHeader,
      Origin: input.servers.adminUrl,
      'x-csrf-token': input.adminSession.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userSub: input.sub })
  })
  if (!res.ok && res.status !== 409) {
    throw new Error(`add organization member failed: ${res.status} ${await res.text()}`)
  }
}

async function createAccountKey(input: {
  servers: TestServers
  session: Session
  keyId: string
}): Promise<string> {
  const res = await fetch(`${input.servers.userUrl}/api/user/crypto/keybag/account-key`, {
    method: 'POST',
    headers: {
      Cookie: input.session.cookieHeader,
      Origin: input.servers.userUrl,
      'x-csrf-token': input.session.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key_id: input.keyId, version: 'v2' })
  })
  if (!res.ok) throw new Error(`create account key failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { account_key: { key_id: string } }
  return json.account_key.key_id
}

async function beginAuthorization(input: {
  servers: TestServers
  clientId: string
  redirectUri: string
  organizationId?: string
}): Promise<{
  requestId: string
  codeVerifier: string
  state: string
  zkKeyPair: ZkKeyPair
  redirectParams: URLSearchParams
}> {
  const codeVerifier = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
  const codeChallenge = sha256Base64Url(codeVerifier)
  const zkKeyPair = await createZkKeyPair()
  const state = `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    zk_pub: zkKeyPair.zkPub,
  })
  if (input.organizationId) params.set('organization_id', input.organizationId)
  const res = await fetch(`${input.servers.userUrl}/api/user/authorize?${params.toString()}`, {
    method: 'GET',
    redirect: 'manual'
  })
  if (res.status !== 302) throw new Error(`authorize failed: ${res.status} ${await res.text()}`)
  const location = res.headers.get('location')
  if (!location) throw new Error('missing authorize redirect')
  const redirectParams = new URL(location, input.servers.userUrl).searchParams
  const requestId = redirectParams.get('request_id')
  if (!requestId) throw new Error('missing request_id')
  return { requestId, codeVerifier, state, zkKeyPair, redirectParams }
}

async function finalizeAuthorization(input: {
  servers: TestServers
  session: Session
  requestId: string
  keyHash: string
  version: 'v1-drk' | 'v2'
  organizationId?: string
}): Promise<{ code: string; redirect_uri: string }> {
  const body = new URLSearchParams({
    request_id: input.requestId,
  })
  if (input.version === 'v1-drk') body.set('drk_hash', input.keyHash)
  if (input.version === 'v2') body.set('zk_key_hash', input.keyHash)
  if (input.organizationId) body.set('organization_id', input.organizationId)
  const res = await fetch(`${input.servers.userUrl}/api/user/authorize/finalize`, {
    method: 'POST',
    headers: {
      Cookie: input.session.cookieHeader,
      Origin: input.servers.userUrl,
      'x-csrf-token': input.session.csrfToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body
  })
  if (!res.ok) throw new Error(`finalize failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { code: string; redirect_uri: string }
  expect(json.code).toBeTruthy()
  return json
}

async function exchangeCode(input: {
  servers: TestServers
  code: string
  redirectUri: string
  clientId: string
  codeVerifier: string
}): Promise<Record<string, unknown>> {
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
    })
  })
  if (!res.ok) throw new Error(`token failed: ${res.status} ${await res.text()}`)
  return await res.json() as Record<string, unknown>
}

async function completeV2Delivery(input: {
  servers: TestServers
  session: Session
  ark: Buffer
  keyId: string
  sub: string
  clientId: string
  redirectUri: string
  clientKeyScope: 'account' | 'organization'
  organizationId?: string
}): Promise<{ payload: ClientKeyPayload; token: Record<string, unknown>; keyHash: string }> {
  const auth = await beginAuthorization(input)
  expect(auth.redirectParams.get('has_zk')).toBe('1')
  expect(auth.redirectParams.get('key_delivery_version')).toBe('v2')
  expect(auth.redirectParams.get('delivered_key_kind')).toBe('client_app_key')
  expect(auth.redirectParams.get('client_key_scope')).toBe(input.clientKeyScope)
  const scopedOrganizationId = input.clientKeyScope === 'account' ? undefined : input.organizationId
  const cak = deriveClientAppKey({
    ark: input.ark,
    sub: input.sub,
    keyId: input.keyId,
    clientId: input.clientId,
    organizationId: scopedOrganizationId,
  })
  const now = Math.floor(Date.now() / 1000)
  const payload: ClientKeyPayload = {
    typ: 'DarkAuth-Client-Key',
    version: 'v2',
    sub: input.sub,
    client_id: input.clientId,
    aud: input.clientId,
    ...(scopedOrganizationId ? { org_id: scopedOrganizationId } : {}),
    request_id: auth.requestId,
    state_hash: sha256Base64Url(auth.state),
    redirect_uri_hash: sha256Base64Url(input.redirectUri),
    key_id: input.keyId,
    key_kind: 'client_app_key',
    cak: cak.toString('base64url'),
    iat: now,
    exp: now + 120,
  }
  const jwe = await createClientKeyJwe({ payload, publicJwk: auth.zkKeyPair.publicJwk })
  const decrypted = await decryptClientKeyJwe(jwe, auth.zkKeyPair.privateJwk)
  expect(decrypted).toEqual(payload)
  const keyHash = sha256Base64Url(jwe)
  const finalized = await finalizeAuthorization({
    servers: input.servers,
    session: input.session,
    requestId: auth.requestId,
    keyHash,
    version: 'v2',
    organizationId: input.organizationId,
  })
  const token = await exchangeCode({
    servers: input.servers,
    code: finalized.code,
    redirectUri: input.redirectUri,
    clientId: input.clientId,
    codeVerifier: auth.codeVerifier,
  })
  expect(token.zk_key_hash).toBe(keyHash)
  expect(token.zk_key_kind).toBe('client_app_key')
  expect(token.zk_key_version).toBe('v2')
  expect(token.zk_drk_hash).toBeUndefined()
  return { payload, token, keyHash }
}

test.describe('API - user key management delivery matrix', () => {
  test.describe.configure({ mode: 'serial' })

  let servers: TestServers
  let adminSession: Session
  let userSession: Session
  let sub: string
  let keyId: string
  let defaultOrganizationId: string
  let secondOrganizationId: string
  const ark = Buffer.from('a0'.repeat(32), 'hex')

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-user-key-management-delivery' })
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
    const user = {
      email: `ukm-delivery-${Date.now()}@example.com`,
      name: 'User Key Delivery',
      password: 'Passw0rd!123'
    }
    const created = await createUserViaAdmin(servers, FIXED_TEST_ADMIN, user, { createPersonalOrganization: true })
    sub = created.sub
    userSession = await opaqueLoginFinish(servers.userUrl, user.email, user.password)
    keyId = await createAccountKey({
      servers,
      session: userSession,
      keyId: `ark_${sub}_delivery_1`,
    })
    defaultOrganizationId = (
      await getOnlyOrganizationMembershipForUser(servers, adminSession, sub)
    ).organizationId
    secondOrganizationId = await createOrganization({
      servers,
      adminSession,
      slug: `delivery-${Date.now().toString(36)}`,
      name: 'Delivery Second Organization',
    })
    await addOrganizationMember({ servers, adminSession, organizationId: secondOrganizationId, sub })
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('password login to a v2 ZK account-scoped client receives a stable CAK', async () => {
    const clientId = `ukm-stable-${Date.now().toString(36)}`
    const redirectUri = await createClient({
      servers,
      adminSession,
      clientId,
      clientKeyScope: 'account',
    })
    const first = await completeV2Delivery({
      servers,
      session: userSession,
      ark,
      keyId,
      sub,
      clientId,
      redirectUri,
      clientKeyScope: 'account',
      organizationId: defaultOrganizationId,
    })
    const second = await completeV2Delivery({
      servers,
      session: userSession,
      ark,
      keyId,
      sub,
      clientId,
      redirectUri,
      clientKeyScope: 'account',
      organizationId: secondOrganizationId,
    })
    expect(first.payload.cak).toBe(second.payload.cak)
    expect(first.payload.org_id).toBeUndefined()
    expect(second.payload.org_id).toBeUndefined()
    expect(first.keyHash).not.toBe(second.keyHash)
  })

  test('different v2 clients receive different CAKs', async () => {
    const suffix = Date.now().toString(36)
    const firstClientId = `ukm-client-a-${suffix}`
    const secondClientId = `ukm-client-b-${suffix}`
    const firstRedirectUri = await createClient({
      servers,
      adminSession,
      clientId: firstClientId,
      clientKeyScope: 'account',
    })
    const secondRedirectUri = await createClient({
      servers,
      adminSession,
      clientId: secondClientId,
      clientKeyScope: 'account',
    })
    const first = await completeV2Delivery({
      servers,
      session: userSession,
      ark,
      keyId,
      sub,
      clientId: firstClientId,
      redirectUri: firstRedirectUri,
      clientKeyScope: 'account',
      organizationId: defaultOrganizationId,
    })
    const second = await completeV2Delivery({
      servers,
      session: userSession,
      ark,
      keyId,
      sub,
      clientId: secondClientId,
      redirectUri: secondRedirectUri,
      clientKeyScope: 'account',
      organizationId: defaultOrganizationId,
    })
    expect(first.payload.cak).not.toBe(second.payload.cak)
    expect(first.payload.client_id).toBe(firstClientId)
    expect(second.payload.client_id).toBe(secondClientId)
  })

  test('organization-scoped v2 clients receive different CAKs per organization', async () => {
    const clientId = `ukm-org-${Date.now().toString(36)}`
    const redirectUri = await createClient({
      servers,
      adminSession,
      clientId,
      clientKeyScope: 'organization',
    })
    const first = await completeV2Delivery({
      servers,
      session: userSession,
      ark,
      keyId,
      sub,
      clientId,
      redirectUri,
      clientKeyScope: 'organization',
      organizationId: defaultOrganizationId,
    })
    const second = await completeV2Delivery({
      servers,
      session: userSession,
      ark,
      keyId,
      sub,
      clientId,
      redirectUri,
      clientKeyScope: 'organization',
      organizationId: secondOrganizationId,
    })
    const firstIdToken = decodeJwtPayload(String(first.token.id_token))
    const secondIdToken = decodeJwtPayload(String(second.token.id_token))
    expect(first.payload.cak).not.toBe(second.payload.cak)
    expect(first.payload.org_id).toBe(defaultOrganizationId)
    expect(second.payload.org_id).toBe(secondOrganizationId)
    expect(firstIdToken.org_id).toBe(defaultOrganizationId)
    expect(secondIdToken.org_id).toBe(secondOrganizationId)
  })

  test('legacy v1 clients receive root-key delivery only when explicitly configured', async () => {
    const suffix = Date.now().toString(36)
    const v2ClientId = `ukm-v2-${suffix}`
    const v1ClientId = `ukm-v1-${suffix}`
    const v2RedirectUri = await createClient({
      servers,
      adminSession,
      clientId: v2ClientId,
      clientKeyScope: 'account',
    })
    const v1RedirectUri = await createClient({
      servers,
      adminSession,
      clientId: v1ClientId,
      keyDeliveryVersion: 'v1-drk',
      deliveredKeyKind: 'root_key',
      clientKeyScope: 'account',
    })
    const v2 = await completeV2Delivery({
      servers,
      session: userSession,
      ark,
      keyId,
      sub,
      clientId: v2ClientId,
      redirectUri: v2RedirectUri,
      clientKeyScope: 'account',
      organizationId: defaultOrganizationId,
    })
    expect(v2.payload.cak).not.toBe(ark.toString('base64url'))
    const auth = await beginAuthorization({
      servers,
      clientId: v1ClientId,
      redirectUri: v1RedirectUri,
      organizationId: defaultOrganizationId,
    })
    expect(auth.redirectParams.get('key_delivery_version')).toBe('v1-drk')
    expect(auth.redirectParams.get('delivered_key_kind')).toBe('root_key')
    const jwe = await createDrkJwe({
      ark,
      publicJwk: auth.zkKeyPair.publicJwk,
      sub,
      clientId: v1ClientId,
    })
    const decryptedRootKey = await decryptRawJwe(jwe, auth.zkKeyPair.privateJwk)
    expect(decryptedRootKey.equals(ark)).toBeTruthy()
    const keyHash = sha256Base64Url(jwe)
    const finalized = await finalizeAuthorization({
      servers,
      session: userSession,
      requestId: auth.requestId,
      keyHash,
      version: 'v1-drk',
      organizationId: defaultOrganizationId,
    })
    const token = await exchangeCode({
      servers,
      code: finalized.code,
      redirectUri: v1RedirectUri,
      clientId: v1ClientId,
      codeVerifier: auth.codeVerifier,
    })
    expect(token.zk_drk_hash).toBe(keyHash)
    expect(token.zk_key_hash).toBeUndefined()
    expect(token.zk_key_kind).toBeUndefined()
    expect(token.zk_key_version).toBeUndefined()
  })
})
