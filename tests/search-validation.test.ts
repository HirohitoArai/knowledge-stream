import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  escapeLikePattern,
  parseLimit,
  toContainsPattern,
  validateQuery,
} from '../worker/search/validation'

describe('validateQuery', () => {
  it('rejects a missing or blank query', () => {
    expect(validateQuery(null).ok).toBe(false)
    expect(validateQuery('').ok).toBe(false)
    expect(validateQuery('   ').ok).toBe(false)
  })

  it('trims surrounding whitespace', () => {
    expect(validateQuery('  ピザ  ')).toEqual({ ok: true, query: 'ピザ' })
  })

  it('accepts exactly the maximum length and rejects longer input (SPEC 9)', () => {
    expect(validateQuery('あ'.repeat(MAX_QUERY_LENGTH)).ok).toBe(true)
    const tooLong = validateQuery('あ'.repeat(MAX_QUERY_LENGTH + 1))
    expect(tooLong.ok).toBe(false)
  })
})

describe('parseLimit', () => {
  it('defaults when missing or not a number', () => {
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT)
    expect(parseLimit('abc')).toBe(DEFAULT_LIMIT)
    expect(parseLimit('')).toBe(DEFAULT_LIMIT)
  })

  it('clamps into [1, MAX_LIMIT]', () => {
    expect(parseLimit('5')).toBe(5)
    expect(parseLimit('0')).toBe(1)
    expect(parseLimit('-3')).toBe(1)
    expect(parseLimit('999')).toBe(MAX_LIMIT)
    expect(parseLimit('3.9')).toBe(3)
  })
})

describe('LIKE escaping', () => {
  it('escapes %, _ and the escape character itself', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%')
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
    expect(escapeLikePattern('ピザ')).toBe('ピザ')
  })

  it('builds a contains-pattern from the escaped query', () => {
    expect(toContainsPattern('ピザ')).toBe('%ピザ%')
    expect(toContainsPattern('50%_')).toBe('%50\\%\\_%')
  })
})
