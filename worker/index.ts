import type { HealthResponse } from '../shared/api'
import { handleSearch } from './search/handler'

export interface Env {
  DB?: D1Database
}

export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path === '/api/v1/health') {
      if (request.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } })
      }
      return Response.json({ ok: true, phase: 1 } satisfies HealthResponse)
    }
    if (path === '/api/v1/search') {
      // Fail closed with a JSON error when the D1 binding is missing instead
      // of falling through to the SPA or throwing an opaque 500.
      if (!env?.DB) {
        return Response.json({ error: 'Search is unavailable' }, { status: 500 })
      }
      return handleSearch(request, env.DB)
    }
    // Unknown API paths must never fall through to the SPA (including admin).
    return Response.json({ error: 'Not found' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
