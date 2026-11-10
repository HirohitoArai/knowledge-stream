export interface FeedbackRecord {
  id: string
  videoId: string
  videoLabel: string
  type: string
  createdAt: string
}

interface FeedbackRow {
  id: string
  video_id: string
  label: string
  type: string
  created_at: string
}

/** Thin repository: all SQL for feedback lives here (SPEC sections 5, 7). */
export class FeedbackRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Records one anonymous feedback. Returns 'duplicate' when the UNIQUE
   * (video_id, client_hash, type) constraint rejects it, so the handler can
   * answer idempotently instead of erroring (SPEC section 5).
   */
  async record(entry: {
    id: string; videoId: string; clientHash: string; type: string; now: string
  }): Promise<'recorded' | 'duplicate'> {
    try {
      await this.db
        .prepare('INSERT INTO feedback (id, video_id, client_hash, type, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(entry.id, entry.videoId, entry.clientHash, entry.type, entry.now)
        .run()
      return 'recorded'
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return 'duplicate'
      throw error
    }
  }

  async videoExists(videoId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT id FROM videos WHERE id = ?1')
      .bind(videoId)
      .first<{ id: string }>()
    return row !== null
  }

  /** Recent feedback for the admin report view. Hashes are never selected. */
  async listRecent(limit: number): Promise<FeedbackRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT f.id, f.video_id, v.label AS label, f.type, f.created_at
         FROM feedback f JOIN videos v ON v.id = f.video_id
         ORDER BY f.created_at DESC LIMIT ?1`,
      )
      .bind(limit)
      .all<FeedbackRow>()
    return results.map(row => ({
      id: row.id, videoId: row.video_id, videoLabel: row.label, type: row.type, createdAt: row.created_at,
    }))
  }
}
