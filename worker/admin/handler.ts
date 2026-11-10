import { CategoryRepository } from '../repositories/CategoryRepository'
import { FeedbackRepository } from '../repositories/FeedbackRepository'
import { VideoRepository } from '../repositories/VideoRepository'
import { isUniqueViolation, isUuid, validateCategoryName, validateVideoCreate, validateVideoPatch } from './validation'

/**
 * Admin APIs (SPEC section 6). The caller (worker/index.ts) has already
 * verified Cloudflare Access; this handler assumes an authorized admin and
 * focuses on validation and repository work. Duplicate registrations are
 * 409, unknown ids are 404, malformed input is 400.
 */

const methodNotAllowed = (allow: string) =>
  Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: allow } })

export async function handleAdmin(request: Request, db: D1Database): Promise<Response> {
  const path = new URL(request.url).pathname
  const now = new Date().toISOString()
  const videos = new VideoRepository(db)
  const categories = new CategoryRepository(db)

  if (path === '/api/v1/admin/videos') {
    if (request.method === 'GET') {
      return Response.json({ videos: await videos.listAllVideos() })
    }
    if (request.method === 'POST') {
      const validated = validateVideoCreate(await request.json().catch(() => null))
      if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 })
      const id = crypto.randomUUID()
      try {
        await videos.createVideo({
          id,
          platform: 'youtube',
          externalVideoId: validated.value.externalVideoId,
          label: validated.value.label,
          searchKeywords: validated.value.searchKeywords,
          enabled: validated.value.enabled,
          categoryIds: validated.value.categoryIds,
          now,
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          return Response.json({ error: 'This video is already registered' }, { status: 409 })
        }
        throw error
      }
      return Response.json({ id }, { status: 201 })
    }
    return methodNotAllowed('GET, POST')
  }

  const videoMatch = path.match(/^\/api\/v1\/admin\/videos\/([^/]+)$/)
  if (videoMatch) {
    const id = videoMatch[1]
    if (!isUuid(id)) return Response.json({ error: 'Video not found' }, { status: 404 })
    if (request.method === 'PATCH') {
      const validated = validateVideoPatch(await request.json().catch(() => null))
      if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 })
      const updated = await videos.updateVideo(id, { ...validated.value, now })
      return updated
        ? Response.json({ ok: true })
        : Response.json({ error: 'Video not found' }, { status: 404 })
    }
    if (request.method === 'DELETE') {
      const deleted = await videos.deleteVideo(id)
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Video not found' }, { status: 404 })
    }
    return methodNotAllowed('PATCH, DELETE')
  }

  if (path === '/api/v1/admin/categories') {
    if (request.method === 'GET') {
      return Response.json({ categories: await categories.listAllCategories() })
    }
    if (request.method === 'POST') {
      const validated = validateCategoryName(await request.json().catch(() => null))
      if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 })
      const id = crypto.randomUUID()
      await categories.createCategory({ id, name: validated.value.name, enabled: validated.value.enabled, now })
      return Response.json({ id }, { status: 201 })
    }
    return methodNotAllowed('GET, POST')
  }

  const categoryMatch = path.match(/^\/api\/v1\/admin\/categories\/([^/]+)$/)
  if (categoryMatch) {
    const id = categoryMatch[1]
    if (!isUuid(id)) return Response.json({ error: 'Category not found' }, { status: 404 })
    if (request.method === 'PATCH') {
      const body: unknown = await request.json().catch(() => null)
      const fields = (body ?? {}) as Record<string, unknown>
      const patch: { name?: string; enabled?: boolean; now: string } = { now }
      if (fields.name !== undefined) {
        const validated = validateCategoryName({ name: fields.name, enabled: true })
        if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 })
        patch.name = validated.value.name
      }
      if (fields.enabled !== undefined) {
        if (typeof fields.enabled !== 'boolean') return Response.json({ error: 'Field "enabled" must be a boolean' }, { status: 400 })
        patch.enabled = fields.enabled
      }
      const updated = await categories.updateCategory(id, patch)
      return updated
        ? Response.json({ ok: true })
        : Response.json({ error: 'Category not found' }, { status: 404 })
    }
    if (request.method === 'DELETE') {
      const deleted = await categories.deleteCategory(id)
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Category not found' }, { status: 404 })
    }
    return methodNotAllowed('PATCH, DELETE')
  }

  if (path === '/api/v1/admin/feedback') {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    return Response.json({ feedback: await new FeedbackRepository(db).listRecent(100) })
  }

  return Response.json({ error: 'Not found' }, { status: 404 })
}
