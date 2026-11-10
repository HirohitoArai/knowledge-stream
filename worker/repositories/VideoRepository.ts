export interface SearchedVideo {
  id: string
  platform: string
  externalVideoId: string
  label: string
  categories: string[]
}

export interface AdminVideo extends SearchedVideo {
  searchKeywords: string
  enabled: boolean
  availabilityStatus: string
  categoryIds: string[]
}

interface VideoRow {
  id: string
  platform: string
  external_video_id: string
  label: string
}

interface AdminVideoRow extends VideoRow {
  search_keywords: string | null
  enabled: number
  availability_status: string
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
    return this.attachCategories(results)
  }

  /**
   * Feed candidates (SPEC section 3): enabled videos that belong to at
   * least one of the selected genres (OR). Ordering by viewed state is a
   * client concern and deliberately not done here.
   */
  async listFeedVideos(categoryIds: string[]): Promise<SearchedVideo[]> {
    if (categoryIds.length === 0) return []
    const placeholders = categoryIds.map(() => '?').join(', ')
    const { results } = await this.db
      .prepare(
        `SELECT v.id, v.platform, v.external_video_id, v.label
         FROM videos v
         WHERE v.enabled = 1
           AND EXISTS (
             SELECT 1 FROM video_categories vc
             JOIN categories c ON c.id = vc.category_id
             WHERE vc.video_id = v.id AND c.enabled = 1 AND vc.category_id IN (${placeholders})
           )
         ORDER BY v.created_at ASC, v.id ASC`,
      )
      .bind(...categoryIds)
      .all<VideoRow>()
    return this.attachCategories(results)
  }

  /** Every video including disabled ones, with genre ids; admin use only. */
  async listAllVideos(): Promise<AdminVideo[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, platform, external_video_id, label, search_keywords, enabled, availability_status
         FROM videos ORDER BY created_at ASC, id ASC`,
      )
      .all<AdminVideoRow>()
    if (results.length === 0) return []
    const ids = results.map(row => row.id)
    const placeholders = ids.map(() => '?').join(', ')
    const { results: linkRows } = await this.db
      .prepare(
        `SELECT vc.video_id AS video_id, c.id AS category_id, c.name AS name
         FROM video_categories vc
         JOIN categories c ON c.id = vc.category_id
         WHERE vc.video_id IN (${placeholders})
         ORDER BY c.name ASC`,
      )
      .bind(...ids)
      .all<CategoryNameRow & { category_id: string }>()
    const byVideo = new Map<string, { ids: string[]; names: string[] }>()
    for (const row of linkRows) {
      const entry = byVideo.get(row.video_id) ?? { ids: [], names: [] }
      entry.ids.push(row.category_id)
      entry.names.push(row.name)
      byVideo.set(row.video_id, entry)
    }
    return results.map(row => ({
      id: row.id,
      platform: row.platform,
      externalVideoId: row.external_video_id,
      label: row.label,
      searchKeywords: row.search_keywords ?? '',
      enabled: row.enabled === 1,
      availabilityStatus: row.availability_status,
      categories: byVideo.get(row.id)?.names ?? [],
      categoryIds: byVideo.get(row.id)?.ids ?? [],
    }))
  }

  /**
   * Inserts a video and its genre links. Throws the D1 UNIQUE error when
   * (platform, external_video_id) is already registered; the caller maps
   * that to 409 (SPEC section 4 duplicate prevention).
   */
  async createVideo(video: {
    id: string; platform: string; externalVideoId: string; label: string
    searchKeywords: string; enabled: boolean; categoryIds: string[]; now: string
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO videos (id, platform, external_video_id, label, search_keywords, enabled, availability_status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, ?7)`,
      )
      .bind(video.id, video.platform, video.externalVideoId, video.label, video.searchKeywords, video.enabled ? 1 : 0, video.now)
      .run()
    await this.replaceVideoCategories(video.id, video.categoryIds)
  }

  /** Updates editable fields; returns false when the video does not exist. */
  async updateVideo(id: string, patch: {
    label?: string; searchKeywords?: string; enabled?: boolean
    availabilityStatus?: string; categoryIds?: string[]; now: string
  }): Promise<boolean> {
    const sets: string[] = []
    const params: unknown[] = []
    if (patch.label !== undefined) { sets.push(`label = ?${params.length + 1}`); params.push(patch.label) }
    if (patch.searchKeywords !== undefined) { sets.push(`search_keywords = ?${params.length + 1}`); params.push(patch.searchKeywords) }
    if (patch.enabled !== undefined) { sets.push(`enabled = ?${params.length + 1}`); params.push(patch.enabled ? 1 : 0) }
    if (patch.availabilityStatus !== undefined) { sets.push(`availability_status = ?${params.length + 1}`); params.push(patch.availabilityStatus) }
    sets.push(`updated_at = ?${params.length + 1}`); params.push(patch.now)
    params.push(id)
    const result = await this.db
      .prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?${params.length}`)
      .bind(...params)
      .run()
    const changed = (result.meta?.changes ?? 0) > 0
    if (changed && patch.categoryIds !== undefined) await this.replaceVideoCategories(id, patch.categoryIds)
    return changed
  }

  async deleteVideo(id: string): Promise<boolean> {
    await this.db.prepare('DELETE FROM video_categories WHERE video_id = ?1').bind(id).run()
    await this.db.prepare('DELETE FROM feedback WHERE video_id = ?1').bind(id).run()
    const result = await this.db.prepare('DELETE FROM videos WHERE id = ?1').bind(id).run()
    return (result.meta?.changes ?? 0) > 0
  }

  private async replaceVideoCategories(videoId: string, categoryIds: string[]): Promise<void> {
    await this.db.prepare('DELETE FROM video_categories WHERE video_id = ?1').bind(videoId).run()
    for (const categoryId of categoryIds) {
      await this.db
        .prepare('INSERT INTO video_categories (video_id, category_id) VALUES (?1, ?2)')
        .bind(videoId, categoryId)
        .run()
    }
  }

  private async attachCategories(rows: VideoRow[]): Promise<SearchedVideo[]> {
    if (rows.length === 0) return []
    const ids = rows.map(row => row.id)
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
    return rows.map(row => ({
      id: row.id,
      platform: row.platform,
      externalVideoId: row.external_video_id,
      label: row.label,
      categories: categoriesByVideo.get(row.id) ?? [],
    }))
  }
}
