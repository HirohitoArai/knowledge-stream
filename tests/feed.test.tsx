import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VideoFeed } from '../src/VideoFeed'
import { testVideos } from '../src/videos'
import type { PlaybackCoordinator, PlayerControl } from '../src/player/PlaybackCoordinator'

const players = vi.hoisted(() => new Map<number, PlayerControl>())
const created = vi.hoisted(() => [] as PlayerControl[])
vi.mock('../src/player/YouTubePlayer', async () => {
  const { createElement, useLayoutEffect, useState } = await import('react')
  return { YouTubePlayer: ({ index, coordinator, load }: { index: number; coordinator: PlaybackCoordinator; load: boolean }) => {
    const [player] = useState(() => {
      const result = { pauseVideo: vi.fn(), playVideo: vi.fn(), mute: vi.fn(), unMute: vi.fn() }
      created.push(result)
      return result
    })
    useLayoutEffect(() => {
      if (!load) return
      players.set(index, player)
      coordinator.register(index, player)
      return () => { coordinator.unregister(index, player); players.delete(index) }
    }, [index, coordinator, load, player])
    return createElement('div', { className: 'player-surface' })
  } }
})

let position = 0
let scrollWorks = true
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
beforeEach(() => {
  players.clear(); created.length = 0; position = 0; scrollWorks = true
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      if (scrollWorks) { position = (options.top ?? 0) / 600; this.scrollTop = options.top ?? 0 }
    }),
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('feed')) return new DOMRect(0, 0, 390, 600)
    const card = this.closest('.video-card')!
    const index = Array.from(card.parentElement!.children).indexOf(card)
    const top = (index - position) * 600
    return this.classList.contains('player-surface')
      ? new DOMRect(0, top + 60, 240, 420) : new DOMRect(0, top, 390, 600)
  })
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScroll)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
})

it('requests the ready next player synchronously without waiting for a scroll event', () => {
  render(<VideoFeed videos={testVideos} />)
  const first = players.get(0)!, next = players.get(1)!
  vi.mocked(first.pauseVideo).mockClear()
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: '次へ ↓' }))
    // Assert inside the event turn, before any asynchronous scroll event.
    expect(next.playVideo).toHaveBeenCalledOnce()
  })
  expect(vi.mocked(first.pauseVideo).mock.invocationCallOrder[0])
    .toBeLessThan(vi.mocked(next.playVideo).mock.invocationCallOrder[0])
})

it('does not authorize the target when scrolling fails to make it visible', () => {
  render(<VideoFeed videos={testVideos} />)
  scrollWorks = false
  fireEvent.click(screen.getByRole('button', { name: '次へ ↓' }))
  expect(players.get(1)!.playVideo).not.toHaveBeenCalled()
})

it('loads the card in the feed even when viewport clipping prevents autoplay', () => {
  render(<VideoFeed videos={testVideos} preloadAdjacent={false} />)
  vi.stubGlobal('innerHeight', 250)
  position = 2
  fireEvent.scroll(screen.getByRole('main', { name: '動画フィード' }))
  expect([...players.keys()]).toEqual([2])
  expect(players.get(2)!.playVideo).not.toHaveBeenCalled()
  expect(screen.getByText('3 / 3')).toBeTruthy()
  vi.stubGlobal('innerHeight', 800)
  fireEvent.resize(window)
  expect(players.get(2)!.playVideo).toHaveBeenCalledOnce()
})

it('loads the nearest card during an unsettled scroll without authorizing playback', () => {
  render(<VideoFeed videos={testVideos} preloadAdjacent={false} />)
  position = 1.6 // Neither card meets the 65% autoplay threshold.
  fireEvent.scroll(screen.getByRole('main', { name: '動画フィード' }))
  expect([...players.keys()]).toEqual([2])
  expect(players.get(2)!.playVideo).not.toHaveBeenCalled()
  position = 2
  fireEvent.scroll(screen.getByRole('main', { name: '動画フィード' }))
  expect(players.get(2)!.playVideo).toHaveBeenCalledOnce()
})

it.each([true, false])('bounds mounted players over 100 transitions (preload=%s) and releases them on unmount', preloadAdjacent => {
  const view = render(<VideoFeed videos={testVideos} preloadAdjacent={preloadAdjacent} />)
  const retired: PlayerControl[] = []
  for (let step = 0; step < 100; step++) {
    const previous = players.get(position)!
    vi.mocked(previous.pauseVideo).mockClear()
    const forward = step % 4 < 2
    fireEvent.click(screen.getByRole('button', { name: forward ? '次へ ↓' : '↑ 前へ' }))
    expect(previous.pauseVideo).toHaveBeenCalled()
    const expected = preloadAdjacent
      ? [0, 1, 2].filter(index => Math.abs(index - position) <= 1) : [position]
    expect([...players.keys()].sort()).toEqual(expected)
    if (!preloadAdjacent) {
      retired.push(previous)
      expect(players.get(position)!.playVideo).toHaveBeenCalledOnce()
    }
  }
  // Each retired player was started exactly once, never restarted by later navigation.
  for (const player of retired) expect(player.playVideo).toHaveBeenCalledOnce()
  if (preloadAdjacent) expect(created).toHaveLength(3)
  view.unmount()
  expect(players.size).toBe(0)
})
