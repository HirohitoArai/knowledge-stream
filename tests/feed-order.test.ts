// Feed ordering tests (SPEC section 3). The shuffle randomness is injected
// so ordering rules are asserted exactly, not statistically.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { VideoDto } from '../shared/api'
import { buildFeedOrder } from '../src/feed/order'

const video = (id: string): VideoDto => ({
  id, platform: 'youtube', externalVideoId: `ext-${id}`, label: `label-${id}`, categories: [],
})
const videos = ['a', 'b', 'c', 'd'].map(video)
// random() = 0 rotates deterministically under Fisher-Yates.
const zero = () => 0

describe('buildFeedOrder', () => {
  it('excludes not-interested videos entirely', () => {
    const ordered = buildFeedOrder(videos, new Set(), new Set(['b']), zero)
    expect(ordered.map(entry => entry.id)).not.toContain('b')
    expect(ordered).toHaveLength(3)
  })

  it('puts unwatched videos before watched ones', () => {
    const ordered = buildFeedOrder(videos, new Set(['a', 'c']), new Set(), zero)
    const ids = ordered.map(entry => entry.id)
    expect(new Set(ids.slice(0, 2))).toEqual(new Set(['b', 'd']))
    expect(new Set(ids.slice(2))).toEqual(new Set(['a', 'c']))
  })

  it('keeps every candidate exactly once', () => {
    const ordered = buildFeedOrder(videos, new Set(['a']), new Set(), Math.random)
    expect([...ordered.map(entry => entry.id)].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('forms a full cycle from watched videos when nothing is unwatched', () => {
    const ordered = buildFeedOrder(videos, new Set(['a', 'b', 'c', 'd']), new Set(), zero)
    expect(ordered).toHaveLength(4)
  })

  it('does not mutate the candidate list', () => {
    const input = [...videos]
    buildFeedOrder(input, new Set(), new Set(), zero)
    expect(input).toEqual(videos)
  })
})
