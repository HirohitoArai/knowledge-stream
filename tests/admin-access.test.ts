// Cloudflare Access verifier tests. A real RS256 key pair is generated in
// the test and the certs fetch is stubbed, so signature, audience, issuer
// and expiry checks all run against genuine JWT verification.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createAccessVerifier } from '../worker/admin/access'
import worker from '../worker'

const TEAM = 'team.cloudflareaccess.com'
const AUD = 'test-audience-tag'

const base64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

async function makeKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey & { kid?: string }
  jwk.kid = 'test-key-1'
  return { privateKey: pair.privateKey, jwk }
}

async function signJwt(privateKey: CryptoKey, payload: Record<string, unknown>, kid = 'test-key-1') {
  const header = { alg: 'RS256', kid, typ: 'JWT' }
  const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)))
  const unsigned = `${encode(header)}.${encode(payload)}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`
}

const validPayload = () => ({
  aud: AUD,
  iss: `https://${TEAM}`,
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: 'admin@example.com',
})

const requestWithToken = (token?: string) => new Request('http://localhost/api/v1/admin/videos', {
  headers: token ? { 'cf-access-jwt-assertion': token } : {},
})

describe('Cloudflare Access verification', () => {
  it('accepts a correctly signed token for the configured audience', async () => {
    const { privateKey, jwk } = await makeKeys()
    const verify = createAccessVerifier(async () => [jwk])
    const result = await verify(requestWithToken(await signJwt(privateKey, validPayload())), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD })
    expect(result.ok).toBe(true)
  })

  it('rejects tampered, expired, wrong-audience and unknown-key tokens', async () => {
    const { privateKey, jwk } = await makeKeys()
    const verify = createAccessVerifier(async () => [jwk])
    const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }

    const good = await signJwt(privateKey, validPayload())
    const tampered = `${good.slice(0, -2)}xx`
    expect((await verify(requestWithToken(tampered), env)).ok).toBe(false)

    const expired = await signJwt(privateKey, { ...validPayload(), exp: Math.floor(Date.now() / 1000) - 60 })
    expect((await verify(requestWithToken(expired), env)).ok).toBe(false)

    const wrongAudience = await signJwt(privateKey, { ...validPayload(), aud: 'someone-else' })
    const audienceResult = await verify(requestWithToken(wrongAudience), env)
    expect(audienceResult).toMatchObject({ ok: false, status: 403 })

    const unknownKey = await signJwt(privateKey, validPayload(), 'no-such-kid')
    expect((await verify(requestWithToken(unknownKey), env)).ok).toBe(false)
  })

  it('fails closed when Access is not configured or the token is missing', async () => {
    const { jwk } = await makeKeys()
    const verify = createAccessVerifier(async () => [jwk])
    expect(await verify(requestWithToken('a.b.c'), {})).toMatchObject({ ok: false, status: 403 })
    expect(await verify(requestWithToken(), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD })).toMatchObject({ ok: false, status: 401 })
  })

  it('honours the explicit local-dev bypass only when set to "true"', async () => {
    const verify = createAccessVerifier(async () => [])
    expect((await verify(requestWithToken(), { ADMIN_DEV_BYPASS: 'true' })).ok).toBe(true)
    expect((await verify(requestWithToken(), { ADMIN_DEV_BYPASS: 'yes' })).ok).toBe(false)
  })
})

describe('worker admin routing', () => {
  it('rejects admin calls without a verifier pass and never reaches the SPA', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/v1/admin/videos'), {})
    expect(response.status).toBe(500) // no DB binding in this call
    const withDb = await worker.fetch(
      new Request('http://localhost/api/v1/admin/videos'),
      { DB: {} as D1Database, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD },
    )
    expect(withDb.status).toBe(401)
  })

  it('routes admin calls to the handler when the verifier accepts', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [] }) }),
        all: async () => ({ results: [] }),
      }),
    } as unknown as D1Database
    const response = await worker.fetch(
      new Request('http://localhost/api/v1/admin/videos'),
      { DB: db, ADMIN_DEV_BYPASS: 'true' },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ videos: [] })
  })
})
