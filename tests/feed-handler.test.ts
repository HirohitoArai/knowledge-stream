// Feed/categories handler tests with a D1 stub that records SQL and bound
// parameters (same approach as the search handler tests).
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handleCategories, handleFeed, parseCategoryIds } from '../worker/feed/handler'

const categoryRow = { id: 'a0000000-0000-4000-8000-000000000001', name: '数学', enabled: 1 }
const videoRow = {
  id: '48dba56f-3271-4bb9-b59e-dca27c7221c0',
  platform: 'youtube',
  external_video_id: 'pgGrQjYcm5A',
  label: 'ピザで円周率を考える',
}

function createDbStub() {
  const calls: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params })
          return {
            async all() {
              if (sql.includes('FROM categories')) return { results: [categoryRow] }
              if (sql.includes('video_id AS video_id')) return { results: [{ video_id: videoRow.id, name: '数学' }] }
              return { results: [videoRow] }
            },
          }
        },
        async all() {
          calls.push({ sql, params: [] })
          return { results: [categoryRow] }
        },
      }
    },
  }
  return { db: db as unknown as D1Database, calls }
}

describe('GET /api/v1/categories', () => {
  it('returns enabled genres as DTOs', async () => {
    const { db, calls } = createDbStub()
    const response = await handleCategories(new Request('http://localhost/api/v1/categories'), db)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ categories: [{ id: categoryRow.id, name: '数学' }] })
    expect(calls[0].sql).toContain('enabled = 1')
  })

  it('rejects non-GET methods', async () => {
    const { db } = createDbStub()
    const response = await handleCategories(new Request('http://localhost/api/v1/categories', { method: 'POST' }), db)
    expect(response.status).toBe(405)
  })
})

describe('parseCategoryIds', () => {
  it('parses, trims and deduplicates ids', () => {
    const parsed = parseCategoryIds(`${categoryRow.id}, ${categoryRow.id}`)
    expect(parsed).toEqual({ ok: true, ids: [categoryRow.id] })
  })

  it('rejects missing, empty and non-UUID input', () => {
    expect(parseCategoryIds(null).ok).toBe(false)
    expect(parseCategoryIds('').ok).toBe(false)
    expect(parseCategoryIds('not-a-uuid').ok).toBe(false)
  })

  it('rejects more than the maximum number of ids', () => {
    const many = Array.from({ length: 51 }, (_, i) => `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',')
    expect(parseCategoryIds(many).ok).toBe(false)
  })
})

describe('GET /api/v1/feed', () => {
  it('returns candidate videos for the selected genres with bound ids', async () => {
    const { db, calls } = createDbStub()
    const response = await handleFeed(new Request(`http://localhost/api/v1/feed?categories=${categoryRow.id}`), db)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      videos: [{ id: videoRow.id, platform: 'youtube', externalVideoId: 'pgGrQjYcm5A', label: 'ピザで円周率を考える', categories: ['数学'] }],
    })
    const feedCall = calls.find(call => call.sql.includes('FROM videos'))
    expect(feedCall?.sql).toContain('v.enabled = 1')
    expect(feedCall?.params).toEqual([categoryRow.id])
    // The raw id list must be bound, never interpolated into the SQL text.
    expect(feedCall?.sql).not.toContain(categoryRow.id)
  })

  it('rejects a missing categories parameter without touching the DB', async () => {
    const { db, calls } = createDbStub()
    const response = await handleFeed(new Request('http://localhost/api/v1/feed'), db)
    expect(response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})
