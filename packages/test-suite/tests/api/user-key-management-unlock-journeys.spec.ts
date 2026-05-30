import { test, expect } from '@playwright/test'
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts'
import { fromBase64Url, sha256Base64Url, toBase64Url } from '@DarkAuth/api/src/utils/crypto.ts'
import { FIXED_TEST_ADMIN } from '../../fixtures/testData.js'
import { createUserViaAdmin, getAdminSession } from '../../setup/helpers/auth.js'
import { installDarkAuth } from '../../setup/install.js'
import { createTestServers, destroyTestServers, type TestServers } from '../../setup/server.js'

type Session = { cookieHeader: string; csrfToken: string }
type CredentialMode = 'auth-only' | 'prf'
type JsonRecord = Record<string, unknown>

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

function userHeaders(servers: TestServers, session: Session, contentType = 'application/json') {
  return {
    Cookie: session.cookieHeader,
    Origin: servers.userUrl,
    'x-csrf-token': session.csrfToken,
    'Content-Type': contentType,
  }
}

async function expectOk(response: Response) {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
}

async function expectStatus(response: Response, status: number) {
  if (response.status !== status) throw new Error(`${response.status} ${await response.text()}`)
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
  await expectOk(resStart)
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
  await expectOk(resFinish)
  return readSessionFromLoginResponse(resFinish)
}

async function createClient(input: {
  servers: TestServers
  adminSession: Session
  clientId: string
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
      keyDeliveryVersion: 'v2',
      deliveredKeyKind: 'client_app_key',
      clientKeyScope: 'account',
      redirectUris: [redirectUri],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      scopes: ['openid', 'profile'],
      allowedZkOrigins: [input.servers.userUrl],
    })
  })
  await expectOk(res)
  return redirectUri
}

async function createAccountKey(servers: TestServers, session: Session, keyId: string): Promise<string> {
  const res = await fetch(`${servers.userUrl}/api/user/crypto/keybag/account-key`, {
    method: 'POST',
    headers: userHeaders(servers, session),
    body: JSON.stringify({ key_id: keyId, version: 'v2' })
  })
  await expectOk(res)
  const json = await res.json() as { account_key: { key_id: string } }
  return json.account_key.key_id
}

async function createKeyEnvelope(input: {
  servers: TestServers
  session: Session
  envelopeId: string
  keyId: string
  sub: string
  type: 'trusted_device' | 'recovery'
  wrappingAlg: string
}) {
  const aad = canonicalEnvelopeAad({
    sub: input.sub,
    keyId: input.keyId,
    envelopeId: input.envelopeId,
    type: input.type,
    wrappingAlg: input.wrappingAlg,
  })
  const res = await fetch(`${input.servers.userUrl}/api/user/crypto/keybag/envelopes`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({
      envelope_id: input.envelopeId,
      key_id: input.keyId,
      type: input.type,
      wrapping_alg: input.wrappingAlg,
      wrapped_key: toBase64Url(Buffer.from(`wrapped-${input.envelopeId}`)),
      aad: toBase64Url(aad),
      metadata: { version: 'v2' },
    })
  })
  await expectOk(res)
}

async function createRecoveryKey(input: {
  servers: TestServers
  session: Session
  sub: string
  keyId: string
  recoveryKeyId: string
  verifier: Buffer
}) {
  const wrappingAlg = 'DarkAuth-Recovery-HKDF-SHA256+A256GCM/v2'
  const envelopeId = `env_${input.recoveryKeyId}`
  const aad = canonicalEnvelopeAad({
    sub: input.sub,
    keyId: input.keyId,
    envelopeId,
    type: 'recovery',
    wrappingAlg,
  })
  const res = await fetch(`${input.servers.userUrl}/api/user/crypto/recovery-keys`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({
      recovery_key_id: input.recoveryKeyId,
      envelope_id: envelopeId,
      key_id: input.keyId,
      wrapping_alg: wrappingAlg,
      wrapped_key: toBase64Url(Buffer.from(`wrapped-${input.recoveryKeyId}`)),
      aad: toBase64Url(aad),
      verifier: toBase64Url(input.verifier),
    })
  })
  await expectOk(res)
}

async function registerPasskey(input: {
  servers: TestServers
  session: Session
  credentialId: string
  mode: CredentialMode
}) {
  const start = await fetch(`${input.servers.userUrl}/api/user/webauthn/register/start`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
  })
  await expectOk(start)
  const startJson = await start.json() as { challenge_id: string; public_key: JsonRecord }
  expect((startJson.public_key.extensions as JsonRecord).prf).toBeTruthy()
  const finish = await fetch(`${input.servers.userUrl}/api/user/webauthn/register/finish`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({
      challenge_id: startJson.challenge_id,
      label: input.mode === 'prf' ? 'PRF passkey' : 'Auth-only passkey',
      response: {
        id: input.credentialId,
        rawId: input.credentialId,
        response: { clientDataJSON: 'client', attestationObject: 'attestation', transports: ['internal'] },
        clientExtensionResults: { prf: { enabled: input.mode === 'prf' } },
        type: 'public-key',
      },
    })
  })
  await expectOk(finish)
  const json = await finish.json() as {
    credential: { credential_id: string; prf_supported: boolean; can_unlock: boolean }
  }
  expect(json.credential.credential_id).toBe(input.credentialId)
  expect(json.credential.prf_supported).toBe(input.mode === 'prf')
  expect(json.credential.can_unlock).toBe(false)
}

async function createPasskeyPrfEnvelope(input: {
  servers: TestServers
  session: Session
  credentialId: string
  keyId: string
  envelopeId: string
}) {
  const res = await fetch(`${input.servers.userUrl}/api/user/webauthn/prf-envelope`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({
      credential_id: input.credentialId,
      key_id: input.keyId,
      envelope_id: input.envelopeId,
      wrapping_alg: 'WebAuthn-PRF-HKDF-SHA256+A256GCM/v2',
      wrapped_key: toBase64Url(Buffer.from(`wrapped-${input.envelopeId}`)),
      aad: toBase64Url(Buffer.from(`aad-${input.envelopeId}`)),
      prf_salt: toBase64Url(Buffer.from(`salt-${input.envelopeId}`)),
      prf_result_confirmed: true,
    })
  })
  await expectOk(res)
}

async function passkeyLogin(input: {
  servers: TestServers
  credentialId: string
  prfResultConfirmed?: boolean
}): Promise<{ session: Session; body: { key_state: string; unlock: unknown } }> {
  const start = await fetch(`${input.servers.userUrl}/api/user/webauthn/login/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: input.servers.userUrl },
  })
  await expectOk(start)
  const startJson = await start.json() as { challenge_id: string; public_key: JsonRecord }
  expect((startJson.public_key.extensions as JsonRecord).prf).toBeTruthy()
  const finish = await fetch(`${input.servers.userUrl}/api/user/webauthn/login/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: input.servers.userUrl },
    body: JSON.stringify({
      challenge_id: startJson.challenge_id,
      prf_result_confirmed: input.prfResultConfirmed,
      response: {
        id: input.credentialId,
        rawId: input.credentialId,
        response: { clientDataJSON: 'client', authenticatorData: 'auth', signature: 'signature' },
        clientExtensionResults: input.prfResultConfirmed
          ? { prf: { results: { first: toBase64Url(Buffer.from('confirmed-prf-result')) } } }
          : {},
        type: 'public-key',
      },
    })
  })
  await expectOk(finish)
  return {
    session: readSessionFromLoginResponse(finish),
    body: await finish.json() as { key_state: string; unlock: unknown },
  }
}

async function beginAuthorization(input: {
  servers: TestServers
  session: Session
  clientId: string
  redirectUri: string
}) {
  const codeVerifier = randomBase64Url(48)
  const codeChallenge = sha256Base64Url(codeVerifier)
  const state = `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const zkPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  const zkPub = Buffer.from(JSON.stringify(await crypto.subtle.exportKey('jwk', zkPair.publicKey))).toString('base64url')
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    zk_pub: zkPub,
  })
  const res = await fetch(`${input.servers.userUrl}/api/user/authorize?${params.toString()}`, {
    method: 'GET',
    headers: { Cookie: input.session.cookieHeader, Origin: input.servers.userUrl },
    redirect: 'manual',
  })
  await expectStatus(res, 302)
  const location = res.headers.get('location')
  if (!location) throw new Error('missing authorize redirect')
  const requestId = new URL(location, input.servers.userUrl).searchParams.get('request_id')
  if (!requestId) throw new Error('missing request_id')
  return { requestId, state }
}

async function finalizeAuthorization(input: {
  servers: TestServers
  session: Session
  requestId: string
  keyHash: string
}): Promise<Response> {
  return await fetch(`${input.servers.userUrl}/api/user/authorize/finalize`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session, 'application/x-www-form-urlencoded'),
    body: new URLSearchParams({
      request_id: input.requestId,
      zk_key_hash: input.keyHash,
    })
  })
}

async function createTrustedDevice(input: {
  servers: TestServers
  session: Session
  sub: string
  keyId: string
  deviceId: string
}) {
  const keys = await createSigningKeyPair()
  const envelopeId = `env_${input.deviceId}`
  await createKeyEnvelope({
    servers: input.servers,
    session: input.session,
    envelopeId,
    keyId: input.keyId,
    sub: input.sub,
    type: 'trusted_device',
    wrappingAlg: 'DarkAuth-DeviceLocal-AESGCM/v2',
  })
  const res = await fetch(`${input.servers.userUrl}/api/user/crypto/devices`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({
      device_id: input.deviceId,
      label: input.deviceId,
      public_jwk: keys.publicJwk,
      key_handle: `handle-${input.deviceId}`,
      envelope_id: envelopeId,
    })
  })
  await expectOk(res)
  return keys
}

async function createApproval(input: {
  servers: TestServers
  session: Session
  authorizationRequestId?: string
}) {
  const newDevice = await createSigningKeyPair()
  const res = await fetch(`${input.servers.userUrl}/api/user/crypto/device-approvals`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({
      new_device_public_jwk: newDevice.publicJwk,
      new_device_label: 'new browser',
      authorization_request_id: input.authorizationRequestId,
    })
  })
  await expectOk(res)
  const approval = await res.json() as {
    approval: {
      request_id: string
      approval_aad: string
      status: string
      verification_code: string
      new_device_public_jwk: JsonRecord
    }
  }
  return {
    approval: approval.approval,
    newDeviceProof: sha256Base64Url(JSON.stringify(newDevice.publicJwk)),
  }
}

async function approveRequest(input: {
  servers: TestServers
  session: Session
  requestId: string
  deviceId: string
  approvalAad: string
  privateKey: CryptoKey
}) {
  const proof = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    input.privateKey,
    fromBase64Url(input.approvalAad)
  )
  return await fetch(`${input.servers.userUrl}/api/user/crypto/device-approvals/${encodeURIComponent(input.requestId)}/approve`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({
      approved_device_id: input.deviceId,
      encrypted_approval: toBase64Url(Buffer.from(`encrypted-${input.requestId}`)),
      approval_aad: input.approvalAad,
      approval_proof: toBase64Url(Buffer.from(proof)),
    })
  })
}

async function consumeApproval(input: {
  servers: TestServers
  session: Session
  requestId: string
  newDeviceProof: string
}) {
  return await fetch(`${input.servers.userUrl}/api/user/crypto/device-approvals/${encodeURIComponent(input.requestId)}/consume`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
    body: JSON.stringify({ new_device_proof: input.newDeviceProof })
  })
}

async function revokeTrustedDevice(input: {
  servers: TestServers
  session: Session
  deviceId: string
}) {
  const res = await fetch(`${input.servers.userUrl}/api/user/crypto/devices/${encodeURIComponent(input.deviceId)}/revoke`, {
    method: 'POST',
    headers: userHeaders(input.servers, input.session),
  })
  await expectOk(res)
}

async function createSigningKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
  return {
    privateKey: pair.privateKey,
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonRecord,
  }
}

function installWebAuthnMock(servers: TestServers) {
  servers.getContext().services.webauthn = {
    verifyRegistrationResponse: async (options: unknown) => {
      const response = (options as { response: { id: string; clientExtensionResults?: { prf?: { enabled?: boolean } } } }).response
      return {
        verified: true,
        registrationInfo: {
          aaguid: '00000000-0000-0000-0000-000000000000',
          credential: {
            id: response.id,
            publicKey: new Uint8Array(Buffer.from(`public-key-${response.id}`)),
            counter: 1,
            transports: ['internal'],
          },
          credentialDeviceType: response.clientExtensionResults?.prf?.enabled ? 'multiDevice' : 'singleDevice',
          credentialBackedUp: false,
          userVerified: true,
        },
      }
    },
    verifyAuthenticationResponse: async () => ({
      verified: true,
      authenticationInfo: { newCounter: Math.floor(Date.now() / 1000) },
    }),
  }
}

function randomBase64Url(length: number) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(length))).toString('base64url')
}

function canonicalEnvelopeAad(data: {
  sub: string
  keyId: string
  envelopeId: string
  type: string
  wrappingAlg: string
}) {
  return Buffer.from(JSON.stringify({
    envelope_id: data.envelopeId,
    key_id: data.keyId,
    sub: data.sub,
    type: data.type,
    wrapping_alg: data.wrappingAlg,
  }))
}

test.describe('API - user key management unlock journeys', () => {
  test.describe.configure({ mode: 'serial' })

  let servers: TestServers
  let adminSession: Session
  let passwordSession: Session
  let sub: string
  let keyId: string
  let clientId: string
  let redirectUri: string
  let authOnlyCredentialId: string
  let prfCredentialId: string
  let trustedDeviceId: string
  let trustedDeviceKeys: { privateKey: CryptoKey; publicJwk: JsonRecord }
  const recoveryKeyId = `rk_unlock_${Date.now().toString(36)}`
  const recoveryVerifier = Buffer.from('11'.repeat(32), 'hex')

  test.beforeAll(async () => {
    servers = await createTestServers({ testName: 'api-user-key-management-unlock-journeys' })
    await installDarkAuth({
      adminUrl: servers.adminUrl,
      adminEmail: FIXED_TEST_ADMIN.email,
      adminName: FIXED_TEST_ADMIN.name,
      adminPassword: FIXED_TEST_ADMIN.password,
      installToken: 'test-install-token'
    })
    installWebAuthnMock(servers)
    adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password
    })
    const user = {
      email: `ukm-unlock-${Date.now()}@example.com`,
      name: 'User Key Unlock',
      password: 'Passw0rd!123'
    }
    const created = await createUserViaAdmin(servers, FIXED_TEST_ADMIN, user)
    sub = created.sub
    passwordSession = await opaqueLoginFinish(servers.userUrl, user.email, user.password)
    keyId = await createAccountKey(servers, passwordSession, `ark_${sub}_unlock_1`)
    clientId = `ukm-unlock-${Date.now().toString(36)}`
    redirectUri = await createClient({ servers, adminSession, clientId })
    await createRecoveryKey({
      servers,
      session: passwordSession,
      sub,
      keyId,
      recoveryKeyId,
      verifier: recoveryVerifier,
    })
    trustedDeviceId = `dev_unlock_${Date.now().toString(36)}`
    trustedDeviceKeys = await createTrustedDevice({
      servers,
      session: passwordSession,
      sub,
      keyId,
      deviceId: trustedDeviceId,
    })
  })

  test.afterAll(async () => {
    if (servers) await destroyTestServers(servers)
  })

  test('registers auth-only and PRF passkeys', async () => {
    authOnlyCredentialId = `cred_auth_only_${Date.now().toString(36)}`
    prfCredentialId = `cred_prf_${Date.now().toString(36)}`
    await registerPasskey({
      servers,
      session: passwordSession,
      credentialId: authOnlyCredentialId,
      mode: 'auth-only',
    })
    await registerPasskey({
      servers,
      session: passwordSession,
      credentialId: prfCredentialId,
      mode: 'prf',
    })
    await createPasskeyPrfEnvelope({
      servers,
      session: passwordSession,
      credentialId: prfCredentialId,
      keyId,
      envelopeId: `env_${prfCredentialId}`,
    })

    const res = await fetch(`${servers.userUrl}/api/user/webauthn/credentials`, {
      method: 'GET',
      headers: { Cookie: passwordSession.cookieHeader, Origin: servers.userUrl },
    })
    await expectOk(res)
    const json = await res.json() as {
      credentials: Array<{ credential_id: string; prf_supported: boolean; can_unlock: boolean }>
    }
    expect(json.credentials).toEqual(expect.arrayContaining([
      expect.objectContaining({ credential_id: authOnlyCredentialId, prf_supported: false, can_unlock: false }),
      expect.objectContaining({ credential_id: prfCredentialId, prf_supported: true, can_unlock: true }),
    ]))
  })

  test('auth-only passkey login creates a locked session', async () => {
    const login = await passkeyLogin({ servers, credentialId: authOnlyCredentialId })
    expect(login.body.key_state).toBe('locked')
    expect(login.body.unlock).toBeNull()
  })

  test('recovery key unlocks a locked ZK authorization', async () => {
    const login = await passkeyLogin({ servers, credentialId: authOnlyCredentialId })
    const auth = await beginAuthorization({ servers, session: login.session, clientId, redirectUri })
    const lockedFinalize = await finalizeAuthorization({
      servers,
      session: login.session,
      requestId: auth.requestId,
      keyHash: sha256Base64Url('locked-attempt'),
    })
    expect(lockedFinalize.ok).toBe(false)

    const unlock = await fetch(`${servers.userUrl}/api/user/crypto/recovery-keys/${encodeURIComponent(recoveryKeyId)}/use`, {
      method: 'POST',
      headers: userHeaders(servers, login.session),
      body: JSON.stringify({ verifier: toBase64Url(recoveryVerifier) })
    })
    await expectOk(unlock)

    const finalized = await finalizeAuthorization({
      servers,
      session: login.session,
      requestId: auth.requestId,
      keyHash: sha256Base64Url('recovery-jwe'),
    })
    await expectOk(finalized)
    const json = await finalized.json() as { code: string; redirect_uri: string }
    expect(json.code).toBeTruthy()
    expect(json.redirect_uri).toBe(redirectUri)
  })

  test('trusted-device approval completes a locked ZK authorization and cannot be replayed', async () => {
    const login = await passkeyLogin({ servers, credentialId: authOnlyCredentialId })
    const auth = await beginAuthorization({ servers, session: login.session, clientId, redirectUri })
    const approval = await createApproval({
      servers,
      session: login.session,
      authorizationRequestId: auth.requestId,
    })
    const approved = await approveRequest({
      servers,
      session: passwordSession,
      requestId: approval.approval.request_id,
      deviceId: trustedDeviceId,
      approvalAad: approval.approval.approval_aad,
      privateKey: trustedDeviceKeys.privateKey,
    })
    await expectOk(approved)

    const consumed = await consumeApproval({
      servers,
      session: login.session,
      requestId: approval.approval.request_id,
      newDeviceProof: approval.newDeviceProof,
    })
    await expectOk(consumed)
    const replay = await consumeApproval({
      servers,
      session: login.session,
      requestId: approval.approval.request_id,
      newDeviceProof: approval.newDeviceProof,
    })
    expect(replay.ok).toBe(false)

    const finalized = await finalizeAuthorization({
      servers,
      session: login.session,
      requestId: auth.requestId,
      keyHash: sha256Base64Url('trusted-device-jwe'),
    })
    await expectOk(finalized)
    const json = await finalized.json() as { code: string }
    expect(json.code).toBeTruthy()
  })

  test('revoked trusted devices cannot approve unlock requests', async () => {
    const revokedDeviceId = `dev_revoked_${Date.now().toString(36)}`
    const revokedKeys = await createTrustedDevice({
      servers,
      session: passwordSession,
      sub,
      keyId,
      deviceId: revokedDeviceId,
    })
    const login = await passkeyLogin({ servers, credentialId: authOnlyCredentialId })
    const approval = await createApproval({ servers, session: login.session })
    await revokeTrustedDevice({ servers, session: passwordSession, deviceId: revokedDeviceId })
    const rejected = await approveRequest({
      servers,
      session: passwordSession,
      requestId: approval.approval.request_id,
      deviceId: revokedDeviceId,
      approvalAad: approval.approval.approval_aad,
      privateKey: revokedKeys.privateKey,
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.status).toBeGreaterThanOrEqual(400)
  })

  test('PRF passkey login unlocks a ZK authorization', async () => {
    const login = await passkeyLogin({
      servers,
      credentialId: prfCredentialId,
      prfResultConfirmed: true,
    })
    expect(login.body.key_state).toBe('unlocked')
    expect(login.body.unlock).toEqual(expect.objectContaining({
      envelope: expect.objectContaining({ envelope_id: `env_${prfCredentialId}` }),
    }))

    const auth = await beginAuthorization({ servers, session: login.session, clientId, redirectUri })
    const finalized = await finalizeAuthorization({
      servers,
      session: login.session,
      requestId: auth.requestId,
      keyHash: sha256Base64Url('passkey-prf-jwe'),
    })
    await expectOk(finalized)
    const json = await finalized.json() as { code: string }
    expect(json.code).toBeTruthy()
  })
})
