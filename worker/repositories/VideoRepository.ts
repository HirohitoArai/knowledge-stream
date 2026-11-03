export interface SearchedVideo {
  id: string
  platform: string
  externalVideoId: string
  label: string
  categories: string[]
}

interface VideoRow {
  id: string
  platform: string
  external_video_id: string
  label: string
}

interface CategoryNameRow {
  video_id: string
  name: string
}

// SPEC section 2.4: partial match over our own label, search_keywords and
// genre names, restricted to enabled videos. The pattern is always a bound
// value (never interpolated) and uses ESCAPE '\' together with
// escapeLikePattern, so `%`/`_` in user input match literally.
const SEARCH_SQL = `
SELECT v.id, v.platform, v.external_video_id, v.label
FROM videos v
WHERE v.enabled = 1
  AND (
    v.label LIKE ?1 ESCAPE '\\'
    OR v.search_keywords LIKE ?1 ESCAPE '\\'
    OR EXISTS (
      SELECT 1
      FROM video_categories vc
      JOIN categories c ON c.id = vc.category_id
      WHERE vc.video_id = v.id
        AND c.enabled = 1
        AND c.name LIKE ?1 ESCAPE '\\'
    )
  )
ORDER BY v.created_at ASC, v.id ASC
LIMIT ?2
`

/**
 * Thin repository: all SQL for videos lives here (SPEC section 7).
 * Callers pass an already-validated, already-escaped contains-pattern.
 */
export class VideoRepository {
  constructor(private readonly db: D1Database) {}

  async searchEnabledVideos(pattern: string, limit: number): Promise<SearchedVideo[]> {
    const { results } = await this.db
      .prepare(SEARCH_SQL)
      .bind(pattern, limit)
      .all<VideoRow>()
    if (results.length === 0) return []

    const ids = results.map(row => row.id)
    const placeholders = ids.map(() => '?').join(', ')
    const { results: categoryRows } = await this.db
      .prepare(
        `SELECT vc.video_id AS video_id, c.name AS name
         FROM video_categories vc
         JOIN categories c ON c.id = vc.category_id
         WHERE c.enabled = 1 AND vc.video_id IN (${placeholders})
         ORDER BY c.name ASC`,
      )
      .bind(...ids)
      .all<CategoryNameRow>()

    const categoriesByVideo = new Map<string, string[]>()
    for (const row of categoryRows) {
      const names = categoriesByVideo.get(row.video_id) ?? []
      names.push(row.name)
      categoriesByVideo.set(row.video_id, names)
    }
    return results.map(row => ({
      id: row.id,
      platform: row.platform,
      externalVideoId: row.external_video_id,
      label: row.label,
      categories: categoriesByVideo.get(row.id) ?? [],
    }))
  }
}
