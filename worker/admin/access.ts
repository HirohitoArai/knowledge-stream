/**
 * Cloudflare Access JWT verification for the admin APIs (SPEC section 6).
 *
 * Fail-closed by design: every failure — missing token, missing Access
 * configuration, bad signature, wrong audience, expired token — returns a
 * rejection. The only way in without a token is the explicit local-dev
 * bypass flag, which must never be set in staging/production (SPEC 8).
 */

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  ADMIN_DEV_BYPASS?: string
}

export type AccessResult = { ok: true } | { ok: false; status: 401 | 403; error: string }

export type AccessVerifier = (request: Request, env: AccessEnv) => Promise<AccessResult>

interface Jwk {
  kid?: string
  kty?: string
  n?: string
  e?: string
  alg?: string
}

const base64UrlDecode = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

const decodeJsonPart = (part: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as Record<string, unknown>

/**
 * Fetches the Access public certs for a team domain. Injectable so tests
 * can serve a freshly generated key without network access.
 */
export type CertsFetcher = (teamDomain: string) => Promise<Jwk[]>

export const fetchAccessCerts: CertsFetcher = async teamDomain => {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!response.ok) throw new Error('Failed to fetch Access certs')
  const body = await response.json() as { keys?: Jwk[] }
  return body.keys ?? []
}

export function createAccessVerifier(fetchCerts: CertsFetcher = fetchAccessCerts): AccessVerifier {
  return async (request, env) => {
    // Local development bypass: explicit opt-in, checked before anything
    // else so local CRUD works without an Access application existing yet.
    if (env.ADMIN_DEV_BYPASS === 'true') return { ok: true }

    const teamDomain = env.ACCESS_TEAM_DOMAIN
    const audience = env.ACCESS_AUD
    if (!teamDomain || !audience) {
      return { ok: false, status: 403, error: 'Admin access is not configured' }
    }
    const token = request.headers.get('cf-access-jwt-assertion')
    if (!token) return { ok: false, status: 401, error: 'Missing Cloudflare Access token' }

    try {
      const parts = token.split('.')
      if (parts.length !== 3) return { ok: false, status: 401, error: 'Malformed Access token' }
      const header = decodeJsonPart(parts[0])
      const payload = decodeJsonPart(parts[1])
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
        return { ok: false, status: 401, error: 'Unsupported Access token header' }
      }
      const certs = await fetchCerts(teamDomain)
      const jwk = certs.find(candidate => candidate.kid === header.kid)
      if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
        return { ok: false, status: 401, error: 'Unknown Access signing key' }
      }
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
      const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlDecode(parts[2]), signed)
      if (!valid) return { ok: false, status: 401, error: 'Invalid Access token signature' }

      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
      if (!audiences.includes(audience)) return { ok: false, status: 403, error: 'Access token audience mismatch' }
      if (payload.iss !== `https://${teamDomain}`) return { ok: false, status: 403, error: 'Access token issuer mismatch' }
      if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
        return { ok: false, status: 401, error: 'Access token expired' }
      }
      return { ok: true }
    } catch {
      // Any decoding/network/crypto failure is a rejection, never a pass.
      return { ok: false, status: 401, error: 'Access token verification failed' }
    }
  }
}

export const requireAdmin: AccessVerifier = createAccessVerifier()
