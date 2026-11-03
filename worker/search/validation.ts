/**
 * Pure validation and LIKE-pattern helpers for `GET /api/v1/search`.
 * SPEC section 2.4 requires the server to validate the query string and the
 * result limit, to always bind values, and to mind LIKE special characters
 * and D1's LIKE pattern length limit.
 */

/**
 * Upper bound for the trimmed query. Search targets are short admin-entered
 * labels, keywords and genre names, so 100 characters is generous; keeping
 * the query short also keeps the generated LIKE pattern (query + two
 * wildcards) far below D1's LIKE pattern length limit.
 */
export const MAX_QUERY_LENGTH = 100

export const DEFAULT_LIMIT = 20
/** Hard ceiling for `limit`; larger requests are clamped, not honoured. */
export const MAX_LIMIT = 50

export type QueryValidation =
  | { ok: true; query: string }
  | { ok: false; error: string }

export function validateQuery(raw: string | null): QueryValidation {
  if (raw === null) return { ok: false, error: 'Query parameter "q" is required' }
  const query = raw.trim()
  if (query.length === 0) return { ok: false, error: 'Query parameter "q" must not be empty' }
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: `Query parameter "q" must be at most ${MAX_QUERY_LENGTH} characters` }
  }
  return { ok: true, query }
}

/**
 * Parses the `limit` parameter. Missing or non-numeric input falls back to
 * the default; valid numbers are clamped into [1, MAX_LIMIT] so a client can
 * never make the server return an unbounded result set.
 */
export function parseLimit(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_LIMIT
  const value = Number(raw)
  if (!Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)))
}

/**
 * Escapes the LIKE special characters `%`, `_` and the escape character
 * itself so user input always matches literally. Must be paired with
 * `ESCAPE '\'` in the SQL (see VideoRepository).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`)
}

/** Builds the bound contains-pattern for a partial (substring) match. */
export function toContainsPattern(query: string): string {
  return `%${escapeLikePattern(query)}%`
}
