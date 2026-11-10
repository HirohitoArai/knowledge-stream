import type { CategoriesResponse, FeedResponse } from '../../shared/api'
import { CategoryRepository } from '../repositories/CategoryRepository'
import { VideoRepository } from '../repositories/VideoRepository'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A client can never widen the feed query without bound. */
export const MAX_FEED_CATEGORIES = 50

/** `GET /api/v1/categories` — enabled genres for selection screens. */
export async function handleCategories(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } })
  }
  const categories = await new CategoryRepository(db).listEnabledCategories()
  const body: CategoriesResponse = { categories: categories.map(({ id, name }) => ({ id, name })) }
  return Response.json(body)
}

/**
 * Parses and validates `?categories=id,id,...`. Genre ids are UUIDs issued
 * by the server; anything else is a client error, never a SQL concern
 * (values are still only ever bound, never interpolated).
 */
export function parseCategoryIds(raw: string | null): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (raw === null || raw.trim() === '') {
    return { ok: false, error: 'Query parameter "categories" is required' }
  }
  const ids = raw.split(',').map(part => part.trim()).filter(Boolean)
  if (ids.length === 0) return { ok: false, error: 'Query parameter "categories" must list at least one genre id' }
  if (ids.length > MAX_FEED_CATEGORIES) {
    return { ok: false, error: `At most ${MAX_FEED_CATEGORIES} genre ids are accepted` }
  }
  if (ids.some(id => !UUID_PATTERN.test(id))) {
    return { ok: false, error: 'Genre ids must be UUIDs issued by the categories API' }
  }
  return { ok: true, ids: [...new Set(ids)] }
}

/** `GET /api/v1/feed?categories=...` — feed candidates for the genres (OR). */
export async function handleFeed(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } })
  }
  const parsed = parseCategoryIds(new URL(request.url).searchParams.get('categories'))
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
  const videos = await new VideoRepository(db).listFeedVideos(parsed.ids)
  const body: FeedResponse = {
    videos: videos.map(video => ({
      id: video.id,
      platform: video.platform,
      externalVideoId: video.externalVideoId,
      label: video.label,
      categories: video.categories,
    })),
  }
  return Response.json(body)
}
