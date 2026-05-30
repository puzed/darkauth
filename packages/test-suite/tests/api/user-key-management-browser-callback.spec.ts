import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { CompactEncrypt, importJWK, type JWK } from 'jose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type ClientKeyPayload = {
  typ: string
  version: string
  sub: string
  client_id: string
  aud: string
  request_id: string
  state_hash: string
  redirect_uri_hash: string
  key_id: string
  key_kind: string
  cak: string
  iat: number
  exp: number
}

type BrowserResult = {
  ok: boolean
  message: string
  hash: string
  storedSession: boolean
  oauthState: string | null
  pkceVerifier: string | null
  privateKey: string | null
}

function toBase64Url(value: string | Uint8Array | Buffer) {
  return Buffer.from(value).toString('base64url')
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('base64url')
}

function createIdToken(sub = 'user-1') {
  return `${toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${toBase64Url(
    JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })
  )}.sig`
}

async function createClientKeyJwe(publicJwk: JWK, payload: ClientKeyPayload) {
  const key = await importJWK({ ...publicJwk, alg: undefined }, 'ECDH-ES')
  return await new CompactEncrypt(Buffer.from(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'ECDH-ES', enc: 'A256GCM' })
    .encrypt(key)
}

async function createZkJwks() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  return {
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) as JWK,
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) as JWK,
  }
}

async function buildSdkBundle() {
  const testDir = path.dirname(fileURLToPath(import.meta.url))
  const entry = path.resolve(testDir, '../../../darkauth-client/src/index.ts')
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  })
  return result.outputFiles[0].text
}

test.describe('Browser - user key management callback validation', () => {
  let sdkBundle = ''

  test.beforeAll(async () => {
    sdkBundle = await buildSdkBundle()
  })

  test('rejects invalid v2 key delivery metadata in a real browser context', async ({ page }) => {
    const origin = 'http://localhost:43187'
    const state = `state-${Date.now().toString(36)}`
    const redirectUri = `${origin}/callback`
    const cases = [
      {
        name: 'wrong-state',
        mutate: async (payload: ClientKeyPayload) => ({
          ...payload,
          state_hash: await sha256Base64Url('wrong-state'),
        }),
        expected: /Invalid client key state/,
      },
      {
        name: 'wrong-redirect',
        mutate: async (payload: ClientKeyPayload) => ({
          ...payload,
          redirect_uri_hash: await sha256Base64Url(`${origin}/other-callback`),
        }),
        expected: /Invalid client key redirect URI/,
      },
      {
        name: 'wrong-client',
        mutate: (payload: ClientKeyPayload) => ({ ...payload, client_id: 'other-client' }),
        expected: /Invalid client key client/,
      },
      {
        name: 'wrong-subject',
        mutate: (payload: ClientKeyPayload) => ({ ...payload, sub: 'other-user' }),
        expected: /Invalid client key subject/,
      },
      {
        name: 'expired',
        mutate: (payload: ClientKeyPayload) => ({ ...payload, iat: payload.iat - 900, exp: payload.iat - 1 }),
        expected: /Client key JWE expired/,
      },
      {
        name: 'mismatched-hash',
        mutate: (payload: ClientKeyPayload) => payload,
        tokenHash: 'wrong-hash',
        expected: /Client key hash mismatch/,
      },
    ]

    for (const testCase of cases) {
      const { publicJwk, privateJwk } = await createZkJwks()
      delete privateJwk.key_ops
      const now = Math.floor(Date.now() / 1000)
      const payload = await testCase.mutate({
        typ: 'DarkAuth-Client-Key',
        version: 'v2',
        sub: 'user-1',
        client_id: 'client-id',
        aud: 'client-id',
        request_id: `request-${testCase.name}`,
        state_hash: await sha256Base64Url(state),
        redirect_uri_hash: await sha256Base64Url(redirectUri),
        key_id: 'account-key-1',
        key_kind: 'client_app_key',
        cak: toBase64Url(Buffer.from('22'.repeat(32), 'hex')),
        iat: now,
        exp: now + 120,
      })
      const jwe = await createClientKeyJwe(publicJwk, payload)
      const tokenHash = testCase.tokenHash || await sha256Base64Url(jwe)
      await page.route(`${origin}/**`, async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === '/sdk.js') {
          await route.fulfill({ status: 200, contentType: 'application/javascript', body: sdkBundle })
          return
        }
        if (url.pathname === '/token') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id_token: createIdToken(),
              access_token: `access-${testCase.name}`,
              zk_key_hash: tokenHash,
              zk_key_kind: 'client_app_key',
              zk_key_version: 'v2',
            }),
          })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<script type="module">
            import { handleCallback, setConfig, getStoredSession } from '/sdk.js';
            sessionStorage.setItem('oauth_state', ${JSON.stringify(state)});
            sessionStorage.setItem('pkce_verifier', 'verifier');
            sessionStorage.setItem('zk_eph_priv_jwk', ${JSON.stringify(JSON.stringify(privateJwk))});
            setConfig({
              issuer: ${JSON.stringify(origin)},
              clientId: 'client-id',
              redirectUri: ${JSON.stringify(redirectUri)},
              discovery: false,
              zk: true
            });
            try {
              await handleCallback();
              window.__darkauthResult = { ok: true, message: '', hash: location.hash, storedSession: !!getStoredSession() };
            } catch (error) {
              window.__darkauthResult = {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                hash: location.hash,
                storedSession: !!getStoredSession(),
                oauthState: sessionStorage.getItem('oauth_state'),
                pkceVerifier: sessionStorage.getItem('pkce_verifier'),
                privateKey: sessionStorage.getItem('zk_eph_priv_jwk')
              };
            }
          </script>`,
        })
      })

      await page.goto(`${origin}/callback?code=${testCase.name}&state=${state}#darkauth_key_jwe=${encodeURIComponent(jwe)}&keep=1`)
      const result = await page.waitForFunction(() => (window as unknown as { __darkauthResult?: BrowserResult }).__darkauthResult)
      const value = await result.jsonValue() as BrowserResult
      expect(value.ok).toBe(false)
      expect(value.message).toMatch(testCase.expected)
      expect(value.hash).toBe('#keep=1')
      expect(value.storedSession).toBe(false)
      expect(value.oauthState).toBeNull()
      expect(value.pkceVerifier).toBeNull()
      expect(value.privateKey).toBeNull()
      await page.unroute(`${origin}/**`)
    }
  })
})
