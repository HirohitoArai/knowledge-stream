import { extractYouTubeVideoId } from '../../shared/youtubeUrl'

/**
 * Server-side validation for admin writes (SPEC sections 4 and 9). The
 * admin UI validates too, but nothing it says is trusted: lengths, formats
 * and UUID shapes are all re-checked here.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_LABEL_LENGTH = 200
export const MAX_KEYWORDS_LENGTH = 500
export const MAX_CATEGORY_NAME_LENGTH = 50
export const AVAILABILITY_STATUSES = ['active', 'unavailable', 'private', 'deleted'] as const

export interface VideoCreateInput {
  externalVideoId: string
  label: string
  searchKeywords: string
  enabled: boolean
  categoryIds: string[]
}

export interface VideoPatchInput {
  label?: string
  searchKeywords?: string
  enabled?: boolean
  availabilityStatus?: string
  categoryIds?: string[]
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })

function parseCategoryIds(value: unknown): Validation<string[]> {
  if (!Array.isArray(value)) return fail('Field "categoryIds" must be an array of genre UUIDs')
  if (value.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    return fail('Field "categoryIds" must contain genre UUIDs only')
  }
  return { ok: true, value: [...new Set(value as string[])] }
}

function parseLabel(value: unknown): Validation<string> {
  if (typeof value !== 'string') return fail('Field "label" is required')
  const label = value.trim()
  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    return fail(`Field "label" must be 1-${MAX_LABEL_LENGTH} characters`)
  }
  return { ok: true, value: label }
}

function parseKeywords(value: unknown): Validation<string> {
  if (value === undefined || value === null) return { ok: true, value: '' }
  if (typeof value !== 'string' || value.length > MAX_KEYWORDS_LENGTH) {
    return fail(`Field "searchKeywords" must be at most ${MAX_KEYWORDS_LENGTH} characters`)
  }
  return { ok: true, value: value.trim() }
}

export function validateVideoCreate(body: unknown): Validation<VideoCreateInput> {
  if (body === null || typeof body !== 'object') return fail('JSON body is required')
  const fields = body as Record<string, unknown>
  // The admin pastes either a full YouTube URL or the bare video id; both
  // are normalized with the shared extractor (SPEC section 4 input support).
  if (typeof fields.source !== 'string') return fail('Field "source" (YouTube URL or video id) is required')
  const externalVideoId = extractYouTubeVideoId(fields.source)
  if (!externalVideoId) return fail('Field "source" is not a supported YouTube URL or video id')
  const label = parseLabel(fields.label)
  if (!label.ok) return label
  const keywords = parseKeywords(fields.searchKeywords)
  if (!keywords.ok) return keywords
  const categoryIds = parseCategoryIds(fields.categoryIds ?? [])
  if (!categoryIds.ok) return categoryIds
  if (fields.enabled !== undefined && typeof fields.enabled !== 'boolean') return fail('Field "enabled" must be a boolean')
  return {
    ok: true,
    value: {
      externalVideoId,
      label: label.value,
      searchKeywords: keywords.value,
      enabled: fields.enabled ?? true,
      categoryIds: categoryIds.value,
    },
  }
}

export function validateVideoPatch(body: unknown): Validation<VideoPatchInput> {
  if (body === null || typeof body !== 'object') return fail('JSON body is required')
  const fields = body as Record<string, unknown>
  const patch: VideoPatchInput = {}
  if (fields.label !== undefined) {
    const label = parseLabel(fields.label)
    if (!label.ok) return label
    patch.label = label.value
  }
  if (fields.searchKeywords !== undefined) {
    const keywords = parseKeywords(fields.searchKeywords)
    if (!keywords.ok) return keywords
    patch.searchKeywords = keywords.value
  }
  if (fields.enabled !== undefined) {
    if (typeof fields.enabled !== 'boolean') return fail('Field "enabled" must be a boolean')
    patch.enabled = fields.enabled
  }
  if (fields.availabilityStatus !== undefined) {
    if (typeof fields.availabilityStatus !== 'string'
      || !AVAILABILITY_STATUSES.includes(fields.availabilityStatus as typeof AVAILABILITY_STATUSES[number])) {
      return fail(`Field "availabilityStatus" must be one of: ${AVAILABILITY_STATUSES.join(', ')}`)
    }
    patch.availabilityStatus = fields.availabilityStatus
  }
  if (fields.categoryIds !== undefined) {
    const categoryIds = parseCategoryIds(fields.categoryIds)
    if (!categoryIds.ok) return categoryIds
    patch.categoryIds = categoryIds.value
  }
  if (Object.keys(patch).length === 0) return fail('No editable fields were provided')
  return { ok: true, value: patch }
}

export function validateCategoryName(body: unknown): Validation<{ name: string; enabled: boolean }> {
  if (body === null || typeof body !== 'object') return fail('JSON body is required')
  const fields = body as Record<string, unknown>
  if (typeof fields.name !== 'string') return fail('Field "name" is required')
  const name = fields.name.trim()
  if (name.length === 0 || name.length > MAX_CATEGORY_NAME_LENGTH) {
    return fail(`Field "name" must be 1-${MAX_CATEGORY_NAME_LENGTH} characters`)
  }
  if (fields.enabled !== undefined && typeof fields.enabled !== 'boolean') return fail('Field "enabled" must be a boolean')
  return { ok: true, value: { name, enabled: fields.enabled ?? true } }
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/** Maps a D1 constraint failure to the API's duplicate response (409). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}
