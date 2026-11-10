import type { HealthResponse } from '../shared/api'
import { handleSearch } from './search/handler'
import { handleCategories, handleFeed } from './feed/handler'
import { handleFeedback } from './feedback/handler'
import { requireAdmin } from './admin/access'
import type { AccessVerifier } from './admin/access'
import { handleAdmin } from './admin/handler'

export interface Env {
  DB?: D1Database
  /** HMAC secret for anonymous feedback client hashes (SPEC section 5). */
  FEEDBACK_SECRET?: string
  /** Cloudflare Access team domain, e.g. "example.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string
  /** Cloudflare Access application audience (AUD) tag for /admin. */
  ACCESS_AUD?: string
  /**
   * Local development only: when exactly "true", admin APIs accept requests
   * without an Access JWT. Never set this in staging/production (SPEC 6/8).
   */
  ADMIN_DEV_BYPASS?: string
}

const DB_ROUTES = new Set(['/api/v1/search', '/api/v1/categories', '/api/v1/feed', '/api/v1/feedback'])

/**
 * Builds the worker with an injectable Access verifier (tests substitute
 * it; production uses the real Cloudflare Access verification).
 */
export function createWorker(verifyAccess: AccessVerifier): ExportedHandler<Env> {
  return {
    async fetch(request: Request, env?: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path === '/api/v1/health') {
      if (request.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } })
      }
      return Response.json({ ok: true, phase: 1 } satisfies HealthResponse)
    }
    if (path.startsWith('/api/v1/admin/')) {
      // Admin never falls through to the SPA and never works without a DB.
      if (!env?.DB) return Response.json({ error: 'Admin is unavailable' }, { status: 500 })
      const auth = await verifyAccess(request, env)
      if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
      return handleAdmin(request, env.DB)
    }
    if (DB_ROUTES.has(path)) {
      // Fail closed with a JSON error when the D1 binding is missing instead
      // of falling through to the SPA or throwing an opaque 500.
      if (!env?.DB) {
        return Response.json({ error: path === '/api/v1/search' ? 'Search is unavailable' : 'Service is unavailable' }, { status: 500 })
      }
      if (path === '/api/v1/search') return handleSearch(request, env.DB)
      if (path === '/api/v1/categories') return handleCategories(request, env.DB)
      if (path === '/api/v1/feed') return handleFeed(request, env.DB)
      return handleFeedback(request, env.DB, env.FEEDBACK_SECRET)
    }
      // Unknown API paths must never fall through to the SPA (including admin).
      return Response.json({ error: 'Not found' }, { status: 404 })
    },
  }
}

export default createWorker(requireAdmin)
