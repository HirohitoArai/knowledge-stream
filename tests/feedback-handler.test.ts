// Feedback handler tests. The D1 stub simulates the videos lookup and the
// feedback INSERT, including the UNIQUE constraint that drives duplicates.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { handleFeedback, hashClientId, resetRateLimit, validateFeedbackBody } from '../worker/feedback/handler'

const videoId = '48dba56f-3271-4bb9-b59e-dca27c7221c0'
const clientId = '11111111-2222-4333-8444-555555555555'

function createDbStub(existingVideoIds: string[] = [videoId]) {
  const inserted = new Set<string>()
  const binds: unknown[][] = []
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          binds.push(params)
          return {
            async first() {
              return sql.includes('FROM videos') && existingVideoIds.includes(String(params[0])) ? { id: params[0] } : null
            },
            async run() {
              if (sql.includes('INSERT INTO feedback')) {
                const key = `${params[1]}|${params[2]}|${params[3]}`
                if (inserted.has(key)) throw new Error('D1_ERROR: UNIQUE constraint failed: feedback.video_id, feedback.client_hash, feedback.type')
                inserted.add(key)
              }
              return { meta: { changes: 1 } }
            },
          }
        },
      }
    },
  }
  return { db: db as unknown as D1Database, inserted, binds }
}

const post = (body: unknown) => new Request('http://localhost/api/v1/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

beforeEach(() => resetRateLimit())

describe('hashClientId', () => {
  it('is a stable one-way hash that never contains the raw client id', async () => {
    const hash = await hashClientId(clientId, 'test-secret')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(clientId)
    expect(await hashClientId(clientId, 'test-secret')).toBe(hash)
    expect(await hashClientId(clientId, 'other-secret')).not.toBe(hash)
  })
})

describe('validateFeedbackBody', () => {
  it('accepts a well-formed body and rejects malformed fields', () => {
    expect(validateFeedbackBody({ videoId, type: 'helpful', clientId }).ok).toBe(true)
    expect(validateFeedbackBody({ videoId, type: 'saved', clientId }).ok).toBe(false)
    expect(validateFeedbackBody({ videoId: 'x', type: 'helpful', clientId }).ok).toBe(false)
    expect(validateFeedbackBody({ videoId, type: 'helpful', clientId: 'not-a-uuid' }).ok).toBe(false)
    expect(validateFeedbackBody(null).ok).toBe(false)
  })
})

describe('POST /api/v1/feedback', () => {
  it('records feedback and stores only the client hash', async () => {
    const { db, inserted, binds } = createDbStub()
    const response = await handleFeedback(post({ videoId, type: 'wrong_category', clientId }), db, 'test-secret')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, duplicate: false })
    expect(inserted.size).toBe(1)
    const insertBind = binds.find(params => typeof params[2] === 'string' && /^[0-9a-f]{64}$/.test(String(params[2])))
    expect(insertBind?.[2]).toBe(await hashClientId(clientId, 'test-secret'))
    expect(JSON.stringify(binds)).not.toContain(clientId)
  })

  it('answers duplicates idempotently instead of recording twice', async () => {
    const { db, inserted } = createDbStub()
    const first = await handleFeedback(post({ videoId, type: 'helpful', clientId }), db, 's')
    expect(await first.json()).toEqual({ ok: true, duplicate: false })
    const second = await handleFeedback(post({ videoId, type: 'helpful', clientId }), db, 's')
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ ok: true, duplicate: true })
    expect(inserted.size).toBe(1)
  })

  it('returns 404 for an unknown video and 400 for invalid bodies', async () => {
    const { db } = createDbStub([])
    const missing = await handleFeedback(post({ videoId, type: 'helpful', clientId }), db, 's')
    expect(missing.status).toBe(404)
    const invalid = await handleFeedback(post({ videoId, type: 'nope', clientId }), db, 's')
    expect(invalid.status).toBe(400)
  })

  it('rate limits after the burst allowance with 429', async () => {
    const { db } = createDbStub()
    let lastStatus = 0
    for (let i = 0; i < 31; i++) {
      // Distinct videos avoid the duplicate path; the stub treats any id in
      // the list as existing, so reuse the same video with distinct types
      // would dedupe — instead vary the client-visible video id list.
      const response = await handleFeedback(post({ videoId, type: i % 2 === 0 ? 'helpful' : 'wrong_category', clientId }), db, 's')
      lastStatus = response.status
    }
    expect(lastStatus).toBe(429)
  })

  it('rejects non-POST methods', async () => {
    const { db } = createDbStub()
    const response = await handleFeedback(new Request('http://localhost/api/v1/feedback'), db, 's')
    expect(response.status).toBe(405)
  })
})
