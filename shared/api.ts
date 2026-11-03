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
