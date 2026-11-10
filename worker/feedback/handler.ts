import type { FeedbackRequest, FeedbackResponse, FeedbackType } from '../../shared/api'
import { FeedbackRepository } from '../repositories/FeedbackRepository'

/**
 * Fallback used only for local development when FEEDBACK_SECRET is not
 * configured. Staging/production must set a real secret (SPEC section 8);
 * the stored value is still a one-way HMAC, never the raw client id.
 */
export const LOCAL_DEV_SECRET = 'knowledge-stream-local-dev-secret'

const FEEDBACK_TYPES: FeedbackType[] = ['helpful', 'wrong_category']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** HMAC-SHA-256(secret, clientId) as hex, via WebCrypto (SPEC section 5). */
export async function hashClientId(clientId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(clientId))
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function validateFeedbackBody(body: unknown): { ok: true; value: FeedbackRequest } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object') return { ok: false, error: 'JSON body is required' }
  const { videoId, type, clientId } = body as Record<string, unknown>
  if (typeof videoId !== 'string' || !UUID_PATTERN.test(videoId)) {
    return { ok: false, error: 'Field "videoId" must be a video UUID' }
  }
  if (typeof type !== 'string' || !FEEDBACK_TYPES.includes(type as FeedbackType)) {
    return { ok: false, error: 'Field "type" must be "helpful" or "wrong_category"' }
  }
  if (typeof clientId !== 'string' || !UUID_PATTERN.test(clientId)) {
    return { ok: false, error: 'Field "clientId" must be the anonymous client UUID' }
  }
  return { ok: true, value: { videoId, type: type as FeedbackType, clientId } }
}

/**
 * Best-effort per-isolate rate limit (SPEC sections 5 and 9 ask for request
 * limits and 429s). A single Worker isolate keeps counts in memory; this
 * blunts bursts from one client without external storage. It is not a
 * global quota and resets when the isolate is recycled.
 */
export const RATE_LIMIT_MAX = 30
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const attempts = new Map<string, number[]>()

export function isRateLimited(clientHash: string, now: number): boolean {
  const recent = (attempts.get(clientHash) ?? []).filter(at => now - at < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  attempts.set(clientHash, recent)
  return recent.length > RATE_LIMIT_MAX
}

/** Test hook: clears the in-memory rate limit counters. */
export function resetRateLimit(): void {
  attempts.clear()
}

/** `POST /api/v1/feedback` — anonymous "helpful" / "wrong category" (SPEC 5). */
export async function handleFeedback(request: Request, db: D1Database, secret?: string): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
  }
  const body: unknown = await request.json().catch(() => null)
  const validated = validateFeedbackBody(body)
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 })

  const clientHash = await hashClientId(validated.value.clientId, secret ?? LOCAL_DEV_SECRET)
  if (isRateLimited(clientHash, Date.now())) {
    return Response.json({ error: 'Too many feedback requests' }, { status: 429 })
  }
  const repository = new FeedbackRepository(db)
  if (!await repository.videoExists(validated.value.videoId)) {
    return Response.json({ error: 'Video not found' }, { status: 404 })
  }
  const outcome = await repository.record({
    id: crypto.randomUUID(),
    videoId: validated.value.videoId,
    clientHash,
    type: validated.value.type,
    now: new Date().toISOString(),
  })
  const responseBody: FeedbackResponse = { ok: true, duplicate: outcome === 'duplicate' }
  return Response.json(responseBody)
}
