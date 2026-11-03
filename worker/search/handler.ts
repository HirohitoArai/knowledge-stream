import type { SearchResponse } from '../../shared/api'
import { VideoRepository } from '../repositories/VideoRepository'
import { parseLimit, toContainsPattern, validateQuery } from './validation'

/**
 * `GET /api/v1/search?q=...&limit=...` (SPEC sections 2.4 and 7).
 * Validates input on the server, delegates all SQL to VideoRepository and
 * answers with the shared DTO only.
 */
export async function handleSearch(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } })
  }
  const params = new URL(request.url).searchParams
  const validated = validateQuery(params.get('q'))
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 })
  }
  const limit = parseLimit(params.get('limit'))
  const videos = await new VideoRepository(db).searchEnabledVideos(
    toContainsPattern(validated.query),
    limit,
  )
  const body: SearchResponse = {
    query: validated.query,
    limit,
    results: videos.map(video => ({
      id: video.id,
      platform: video.platform,
      externalVideoId: video.externalVideoId,
      label: video.label,
      categories: video.categories,
    })),
  }
  return Response.json(body)
}
