export interface HealthResponse {
  ok: true
  phase: 1
}

/**
 * One search hit from `GET /api/v1/search` (SPEC section 2.4).
 * Carries only what the client needs to open the video; never a raw D1 row.
 */
export interface SearchVideoDto {
  /** Knowledge Stream internal UUID (distinct from the YouTube video id). */
  id: string
  platform: string
  externalVideoId: string
  /** Our own description label, not the official YouTube title. */
  label: string
  /** Names of the enabled genres (categories) this video belongs to. */
  categories: string[]
}

export interface SearchResponse {
  /** The validated query that was executed (after trimming). */
  query: string
  /** The effective result limit after server-side clamping. */
  limit: number
  results: SearchVideoDto[]
}

/** A genre (category) from `GET /api/v1/categories` (SPEC sections 2.1, 7). */
export interface CategoryDto {
  id: string
  name: string
}

export interface CategoriesResponse {
  categories: CategoryDto[]
}

/** A registered video as the client feed consumes it. Same shape as a search hit. */
export type VideoDto = SearchVideoDto

/**
 * `GET /api/v1/feed?categories=<id,id,...>` (SPEC sections 3 and 7).
 * The server returns candidates for the selected genres (OR); viewed-first
 * ordering and not-interested exclusion happen on the client, because the
 * viewed / not-interested ids never leave the device (SPEC section 3).
 */
export interface FeedResponse {
  videos: VideoDto[]
}

export type FeedbackType = 'helpful' | 'wrong_category'

/**
 * `POST /api/v1/feedback` (SPEC section 5). The raw client id is only ever
 * sent with this request; the server stores an HMAC of it, never the raw id.
 */
export interface FeedbackRequest {
  videoId: string
  type: FeedbackType
  clientId: string
}

export interface FeedbackResponse {
  ok: true
  /** True when this exact feedback was already recorded (duplicate). */
  duplicate: boolean
}
