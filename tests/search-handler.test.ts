// Search handler tests with a D1 stub. The stub records the SQL text and the
// bound parameters, which is what proves binding is used and the enabled
// filter is in the query; it returns canned rows instead of executing SQL.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import worker from '../worker'
import { handleSearch } from '../worker/search/handler'

interface RecordedCall {
  sql: string
  params: unknown[]
}

const videoRow = {
  id: '48dba56f-3271-4bb9-b59e-dca27c7221c0',
  platform: 'youtube',
  external_video_id: 'pgGrQjYcm5A',
  label: 'ピザで円周率を考える',
}
const categoryRow = { video_id: videoRow.id, name: '数学' }

function createDbStub(videos: unknown[] = [videoRow], categories: unknown[] = [categoryRow]) {
  const calls: RecordedCall[] = []
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params })
          return {
            async all() {
              return { results: sql.includes('FROM videos') ? videos : categories }
            },
          }
        },
      }
    },
  }
  return { db: db as unknown as D1Database, calls }
}

describe('GET /api/v1/search', () => {
  it('returns shared DTOs for a partial match on the label', async () => {
    const { db, calls } = createDbStub()
    const response = await handleSearch(new Request('http://localhost/api/v1/search?q=ピザ'), db)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      query: 'ピザ',
      limit: 20,
      results: [{
        id: videoRow.id,
        platform: 'youtube',
        externalVideoId: 'pgGrQjYcm5A',
        label: 'ピザで円周率を考える',
        categories: ['数学'],
      }],
    })
    expect(calls).toHaveLength(2)
    expect(calls[0].params).toEqual(['%ピザ%', 20])
  })

  it('binds the query instead of interpolating it, and filters to enabled videos', async () => {
    const { db, calls } = createDbStub()
    await handleSearch(new Request('http://localhost/api/v1/search?q=ピザ'), db)
    const sql = calls[0].sql
    // The raw query text never appears inside the SQL string.
    expect(sql).not.toContain('ピザ')
    expect(sql).toContain('LIKE ?1')
    expect(sql).toContain("ESCAPE '\\'")
    // SPEC 2.4/9: disabled videos must not be returned.
    expect(sql).toContain('v.enabled = 1')
  })

  it('also matches genre names via the categories join', async () => {
    const { db, calls } = createDbStub()
    await handleSearch(new Request('http://localhost/api/v1/search?q=数学'), db)
    expect(calls[0].sql).toContain('categories')
    expect(calls[0].sql).toContain('c.name LIKE ?1')
    expect(calls[0].params[0]).toBe('%数学%')
  })

  it('escapes LIKE wildcards in the query so they match literally', async () => {
    const { db, calls } = createDbStub()
    await handleSearch(new Request('http://localhost/api/v1/search?q=100%25'), db)
    expect(calls[0].params[0]).toBe('%100\\%%')
    const second = createDbStub()
    await handleSearch(new Request('http://localhost/api/v1/search?q=a_b'), second.db)
    expect(second.calls[0].params[0]).toBe('%a\\_b%')
  })

  it('clamps an excessive limit before binding it', async () => {
    const { db, calls } = createDbStub()
    const response = await handleSearch(new Request('http://localhost/api/v1/search?q=x&limit=999'), db)
    const body = await response.json() as { limit: number }
    expect(body.limit).toBe(50)
    expect(calls[0].params[1]).toBe(50)
  })

  it('rejects missing, blank and over-long queries without touching the DB (SPEC 9)', async () => {
    const { db, calls } = createDbStub()
    for (const url of [
      'http://localhost/api/v1/search',
      'http://localhost/api/v1/search?q=%20%20',
      `http://localhost/api/v1/search?q=${'a'.repeat(101)}`,
    ]) {
      const response = await handleSearch(new Request(url), db)
      expect(response.status).toBe(400)
    }
    expect(calls).toHaveLength(0)
  })

  it('rejects non-GET methods', async () => {
    const { db } = createDbStub()
    const response = await handleSearch(new Request('http://localhost/api/v1/search?q=x', { method: 'POST' }), db)
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
  })

  it('is routed by the worker and fails closed when the DB binding is absent', async () => {
    const { db } = createDbStub()
    const ok = await worker.fetch(new Request('http://localhost/api/v1/search?q=ピザ'), { DB: db })
    expect(ok.status).toBe(200)
    const unavailable = await worker.fetch(new Request('http://localhost/api/v1/search?q=ピザ'))
    expect(unavailable.status).toBe(500)
    expect(await unavailable.json()).toEqual({ error: 'Search is unavailable' })
  })
})
