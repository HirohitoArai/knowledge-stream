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
      const result = { pauseVideo: vi.fn(), playVideo: vi.fn(), mute: vi.fn(), unMute: vi.fn(), getPlayerState: vi.fn(() => 2 as number) }
      created.push(result)
      return result
    })
    useLayoutEffect(() => {
      if (!load) return
      players.set(index, player)
      coordinator.register(index, player)
      return () => { coordinator.unregister(index, player); players.delete(index) }
    }, [index, coordinator, load, player])
    return createElement('div', { className: 'player-wrap' },
      createElement('div', { className: 'player-surface' }),
      createElement('div', { className: 'gesture-layer' }))
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
    // The swipe gesture drives the feed's real scrollTop; follow it when set.
    const feedEl = this.closest('.feed')
    const effectivePosition = feedEl && feedEl.scrollTop !== 0 ? feedEl.scrollTop / 600 : position
    const top = (index - effectivePosition) * 600
    return this.classList.contains('player-surface')
      ? new DOMRect(0, top + 60, 240, 420) : new DOMRect(0, top, 390, 600)
  })
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScroll)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
})

/** Shorts-style swipe on a card: down on its gesture layer, move, up. */
const swipe = (index: number, fromY: number, toY: number) => {
  const card = document.querySelectorAll('.video-card')[index]
  const layer = card.querySelector('.gesture-layer')!
  fireEvent.pointerDown(layer, { pointerId: 7, clientX: 100, clientY: fromY, pointerType: 'touch' })
  fireEvent.pointerMove(card, { pointerId: 7, clientX: 100, clientY: Math.round((fromY + toY) / 2), pointerType: 'touch' })
  fireEvent.pointerUp(card, { pointerId: 7, clientX: 100, clientY: toY, pointerType: 'touch' })
}

it('requests the ready next player synchronously on swipe, without waiting for a scroll event', () => {
  render(<VideoFeed videos={testVideos} />)
  const first = players.get(0)!, next = players.get(1)!
  vi.mocked(first.pauseVideo).mockClear()
  act(() => {
    swipe(0, 500, 100)
    // Assert inside the event turn, before any asynchronous scroll event.
    expect(next.playVideo).toHaveBeenCalledOnce()
  })
  expect(vi.mocked(first.pauseVideo).mock.invocationCallOrder[0])
    .toBeLessThan(vi.mocked(next.playVideo).mock.invocationCallOrder[0])
})

it('does not authorize the target when scrolling fails to make it visible', () => {
  render(<VideoFeed videos={testVideos} />)
  scrollWorks = false
  swipe(0, 500, 100)
  expect(players.get(1)!.playVideo).not.toHaveBeenCalled()
})

it('wraps from the last card back to the first and from the first to the last', () => {
  render(<VideoFeed videos={testVideos} />)
  swipe(0, 100, 500) // down on the first card wraps to the last
  expect(players.get(2)!.playVideo).toHaveBeenCalledOnce()
  expect(screen.getByText('3 / 3')).toBeTruthy()
  swipe(2, 500, 100) // up on the last card wraps to the first
  expect(players.get(0)!.playVideo).toHaveBeenCalledTimes(2) // initial activation + wrap return
  expect(screen.getByText('1 / 3')).toBeTruthy()
})

it('toggles playback when the video surface is tapped', () => {
  render(<VideoFeed videos={testVideos} />)
  const first = players.get(0)!
  first.getPlayerState.mockReturnValue(1)
  vi.mocked(first.pauseVideo).mockClear()
  const layer = document.querySelectorAll('.video-card')[0].querySelector('.gesture-layer')!
  fireEvent.pointerDown(layer, { pointerId: 9, clientX: 100, clientY: 300, pointerType: 'touch' })
  fireEvent.pointerUp(layer, { pointerId: 9, clientX: 100, clientY: 302, pointerType: 'touch' })
  expect(first.pauseVideo).toHaveBeenCalledOnce()
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
    if (forward) swipe(position, 500, 100); else swipe(position, 100, 500)
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
