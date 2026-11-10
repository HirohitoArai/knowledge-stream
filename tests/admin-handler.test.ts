// Admin handler tests. A small in-memory fake D1 interprets the exact
// statements the repositories issue (positional binds included), so CRUD,
// duplicate and not-found behaviour are exercised end to end at the
// handler level. Real-D1 SQL execution is covered by the local runtime
// check with wrangler (see docs/FULL_PROTOTYPE_HANDOFF.md).
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handleAdmin } from '../worker/admin/handler'

interface Row { [key: string]: unknown }

function createFakeD1() {
  const tables: Record<string, Row[]> = { videos: [], categories: [], video_categories: [], feedback: [] }

  const applyUpdate = (table: Row[], sql: string, params: unknown[]) => {
    const assignments = [...sql.matchAll(/(\w+) = \?(\d+)/g)].map(match => ({ column: match[1], param: Number(match[2]) }))
    const idParam = assignments.pop()
    if (!idParam) return { meta: { changes: 0 } }
    const row = table.find(candidate => candidate.id === params[idParam.param - 1])
    if (!row) return { meta: { changes: 0 } }
    for (const { column, param } of assignments) row[column] = params[param - 1]
    return { meta: { changes: 1 } }
  }

  const prepare = (sql: string) => {
    const statement = {
      bind(...params: unknown[]) {
        return {
        async all() {
          if (sql.includes('FROM categories') && sql.includes('SELECT id, name, enabled')) {
            const rows = tables.categories.filter(row => !sql.includes('WHERE enabled = 1') || row.enabled === 1)
            return { results: rows.map(({ id, name, enabled }) => ({ id, name, enabled })) }
          }
          if (sql.includes('FROM videos') && sql.includes('ORDER BY created_at')) {
            return { results: tables.videos }
          }
          if (sql.includes('video_id AS video_id')) {
            return {
              results: tables.video_categories.map(link => ({
                video_id: link.video_id,
                category_id: link.category_id,
                name: tables.categories.find(category => category.id === link.category_id)?.name ?? '',
              })),
            }
          }
          if (sql.includes('FROM feedback')) {
            return {
              results: tables.feedback.map(entry => ({
                id: entry.id, video_id: entry.video_id, type: entry.type, created_at: entry.created_at,
                label: tables.videos.find(video => video.id === entry.video_id)?.label ?? '',
              })),
            }
          }
          throw new Error(`Unexpected SELECT in fake D1: ${sql}`)
        },
        async run() {
          const insert = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/s)
          if (insert) {
            const [, table, columnsPart, valuesPart] = insert
            const columns = columnsPart.split(',').map(part => part.trim())
            const valueRefs = valuesPart.split(',').map(part => part.trim())
            const row: Row = {}
            columns.forEach((column, index) => {
              const ref = valueRefs[index]
              row[column] = ref.startsWith('?') ? params[Number(ref.slice(1)) - 1] : ref.replaceAll("'", '')
            })
            if (table === 'videos' && tables.videos.some(video => video.platform === row.platform && video.external_video_id === row.external_video_id)) {
              throw new Error('D1_ERROR: UNIQUE constraint failed: videos.platform, videos.external_video_id')
            }
            tables[table].push(row)
            return { meta: { changes: 1 } }
          }
          if (sql.startsWith('UPDATE videos')) return applyUpdate(tables.videos, sql, params)
          if (sql.startsWith('UPDATE categories')) return applyUpdate(tables.categories, sql, params)
          const deletion = sql.match(/DELETE FROM (\w+) WHERE (\w+) = \?1/)
          if (deletion) {
            const [, table, column] = deletion
            const before = tables[table].length
            tables[table] = tables[table].filter(row => row[column] !== params[0])
            return { meta: { changes: before - tables[table].length } }
          }
          throw new Error(`Unexpected statement in fake D1: ${sql}`)
        },
        }
      },
    }
    // Unbound calls (prepare(...).all()) delegate with no parameters.
    return {
      ...statement,
      all: () => statement.bind().all(),
      run: () => statement.bind().run(),
    }
  }
  return { db: { prepare } as unknown as D1Database, tables }
}

const jsonRequest = (path: string, method: string, body?: unknown) => new Request(`http://localhost${path}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('admin videos', () => {
  it('creates a video from a pasted Shorts URL, lists it, patches and deletes it', async () => {
    const { db, tables } = createFakeD1()
    const created = await handleAdmin(jsonRequest('/api/v1/admin/videos', 'POST', {
      source: 'https://www.youtube.com/shorts/pgGrQjYcm5A',
      label: 'ピザで円周率を考える',
      searchKeywords: '円周率',
      categoryIds: [],
    }), db)
    expect(created.status).toBe(201)
    const { id } = await created.json() as { id: string }
    expect(tables.videos[0]).toMatchObject({ external_video_id: 'pgGrQjYcm5A', platform: 'youtube', enabled: 1 })

    const list = await handleAdmin(jsonRequest('/api/v1/admin/videos', 'GET'), db)
    const listed = await list.json() as { videos: { id: string; label: string }[] }
    expect(listed.videos).toHaveLength(1)
    expect(listed.videos[0].id).toBe(id)

    const patched = await handleAdmin(jsonRequest(`/api/v1/admin/videos/${id}`, 'PATCH', { label: '新しいラベル', enabled: false }), db)
    expect(patched.status).toBe(200)
    expect(tables.videos[0]).toMatchObject({ label: '新しいラベル', enabled: 0 })

    const deleted = await handleAdmin(jsonRequest(`/api/v1/admin/videos/${id}`, 'DELETE'), db)
    expect(deleted.status).toBe(200)
    expect(tables.videos).toHaveLength(0)
  })

  it('rejects duplicate registration with 409 and bad sources with 400', async () => {
    const { db } = createFakeD1()
    const body = { source: 'pgGrQjYcm5A', label: '一つ目' }
    expect((await handleAdmin(jsonRequest('/api/v1/admin/videos', 'POST', body), db)).status).toBe(201)
    expect((await handleAdmin(jsonRequest('/api/v1/admin/videos', 'POST', body), db)).status).toBe(409)
    const bad = await handleAdmin(jsonRequest('/api/v1/admin/videos', 'POST', { source: 'https://example.com/watch', label: 'x' }), db)
    expect(bad.status).toBe(400)
    const noLabel = await handleAdmin(jsonRequest('/api/v1/admin/videos', 'POST', { source: 'pgGrQjYcm5A', label: ' ' }), db)
    expect(noLabel.status).toBe(400)
  })

  it('returns 404 for unknown video ids on patch and delete', async () => {
    const { db } = createFakeD1()
    const missing = '99999999-8888-4777-8666-555555555555'
    expect((await handleAdmin(jsonRequest(`/api/v1/admin/videos/${missing}`, 'PATCH', { label: 'x' }), db)).status).toBe(404)
    expect((await handleAdmin(jsonRequest(`/api/v1/admin/videos/${missing}`, 'DELETE'), db)).status).toBe(404)
  })
})

describe('admin categories', () => {
  it('creates, renames, disables and deletes a genre', async () => {
    const { db, tables } = createFakeD1()
    const created = await handleAdmin(jsonRequest('/api/v1/admin/categories', 'POST', { name: '数学' }), db)
    expect(created.status).toBe(201)
    const { id } = await created.json() as { id: string }
    expect(tables.categories[0]).toMatchObject({ name: '数学', enabled: 1 })

    const patched = await handleAdmin(jsonRequest(`/api/v1/admin/categories/${id}`, 'PATCH', { name: '数学・統計', enabled: false }), db)
    expect(patched.status).toBe(200)
    expect(tables.categories[0]).toMatchObject({ name: '数学・統計', enabled: 0 })

    expect((await handleAdmin(jsonRequest(`/api/v1/admin/categories/${id}`, 'DELETE'), db)).status).toBe(200)
    expect(tables.categories).toHaveLength(0)
  })
})

describe('admin misc', () => {
  it('rejects wrong methods and unknown admin paths', async () => {
    const { db } = createFakeD1()
    expect((await handleAdmin(jsonRequest('/api/v1/admin/videos', 'DELETE'), db)).status).toBe(405)
    expect((await handleAdmin(jsonRequest('/api/v1/admin/nope', 'GET'), db)).status).toBe(404)
  })
})
