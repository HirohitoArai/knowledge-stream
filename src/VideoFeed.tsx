import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { PlaybackCoordinator } from './player/PlaybackCoordinator'
import { inMountWindow, retainedPlayers, selectActive, visibleRatio } from './player/visibility'
import { YouTubePlayer } from './player/YouTubePlayer'
import type { TestVideo } from './videos'
import { countPlayerWork } from './player/diagnostics'

export function VideoFeed({ videos, preloadAdjacent = true, focusExternalVideoId, focusNonce, onActiveVideo, renderCardExtras }: {
  videos: TestVideo[]
  preloadAdjacent?: boolean
  /** When set (with a fresh focusNonce), scroll the feed to this video. */
  focusExternalVideoId?: string
  focusNonce?: number
  /** Called with the internal id when the active (playing) video changes. */
  onActiveVideo?: (videoId: string) => void
  /** Extra per-video UI (save / not interested / feedback) under the player. */
  renderCardExtras?: (video: TestVideo) => ReactNode
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const measureNow = useRef<(() => void) | null>(null)
  const [coordinator] = useState(() => new PlaybackCoordinator())
  const [active, setActive] = useState<number | null>(null)
  const [center, setCenter] = useState(0)
  const [previousPlayers, setPreviousPlayers] = useState<number[]>([])
  const mounted = retainedPlayers(center, videos.length, previousPlayers, preloadAdjacent)
  useEffect(() => {
    setPreviousPlayers(previous => retainedPlayers(center, videos.length, previous, preloadAdjacent))
  }, [center, videos.length, preloadAdjacent])

  useEffect(() => {
    const root = viewport.current
    if (!root) return
    const measure = () => {
      countPlayerWork('measure')
      const bounds = root.getBoundingClientRect()
      // Intersection includes viewport clipping (small screens/zoom/URL bar changes).
      const clipped = new DOMRect(Math.max(0, bounds.left), Math.max(0, bounds.top),
        Math.max(0, Math.min(innerWidth, bounds.right) - Math.max(0, bounds.left)),
        Math.max(0, Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.top)))
      const cards = Array.from(root.querySelectorAll<HTMLElement>('.video-card'))
      const samples = cards.map((card, index) => {
        const rect = card.getBoundingClientRect()
        return {
          index, cardRatio: visibleRatio(rect, clipped),
          // Loading follows the feed position, even if the browser clips the card.
          loadRatio: visibleRatio(rect, bounds),
          playerRatio: visibleRatio(card.querySelector('.player-surface')!.getBoundingClientRect(), clipped),
        }
      })
      const next = selectActive(samples)
      const visible = document.visibilityState === 'visible'
      if (!visible) coordinator.setVisible(false)
      coordinator.setActive(next)
      coordinator.setVisible(visible)
      setActive(next)
      setCenter(previous => samples.reduce((best, sample) =>
        sample.loadRatio > (samples[best]?.loadRatio ?? 0) ? sample.index : best, previous))
    }
    // Synchronous scroll measurement stops the old video before the next React render.
    measureNow.current = measure
    root.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    document.addEventListener('visibilitychange', measure)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => {
      measureNow.current = null
      root.removeEventListener('scroll', measure)
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
      document.removeEventListener('visibilitychange', measure)
      observer.disconnect()
      coordinator.setActive(null)
    }
  }, [coordinator, videos])

  const navigate = (index: number) => {
    const root = viewport.current
    const card = root?.children[index] as HTMLElement | undefined
    if (!root || !card) return
    // Pause immediately; measured visibility, not the button, authorizes playback.
    coordinator.setActive(null)
    // Move only the feed, not the outer page/URL bar as scrollIntoView can do.
    root.scrollTo({ top: root.scrollTop + card.getBoundingClientRect().top - root.getBoundingClientRect().top, behavior: 'instant' })
    // Keep the request inside the click gesture for a ready adjacent player.
    // Visibility still gates playback; Safari/YouTube may still reject sound-on autoplay.
    measureNow.current?.()
  }

  // Shorts-style navigation: a vertical swipe on the video moves one card,
  // and a tap on the video toggles play/pause through the coordinator. The
  // cross-origin YouTube iframe swallows touch gestures, so YouTubePlayer
  // renders a transparent gesture layer over it and these events bubble up
  // from that layer (or from the card itself outside the player).
  const gesture = useRef<{
    pointerId: number; index: number; startX: number; startY: number
    startScrollTop: number; mode: 'pending' | 'scroll' | 'ignore'; startedAt: number
  } | null>(null)

  const onCardPointerDown = (event: ReactPointerEvent<HTMLElement>, index: number) => {
    if (gesture.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    gesture.current = {
      pointerId: event.pointerId, index,
      startX: event.clientX, startY: event.clientY,
      startScrollTop: viewport.current?.scrollTop ?? 0,
      mode: 'pending', startedAt: performance.now(),
    }
    const target = event.target as HTMLElement
    if (target.classList.contains('gesture-layer')) {
      try { target.setPointerCapture(event.pointerId) } catch { /* best effort */ }
    }
  }

  const onCardPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current
    const root = viewport.current
    if (!current || !root || event.pointerId !== current.pointerId) return
    const dy = event.clientY - current.startY
    const dx = event.clientX - current.startX
    if (current.mode === 'pending') {
      if (Math.abs(dy) < 10) return
      if (Math.abs(dy) <= Math.abs(dx)) { current.mode = 'ignore'; return }
      current.mode = 'scroll'
      // Snap would fight the finger while it drags the feed.
      root.style.scrollSnapType = 'none'
    }
    if (current.mode === 'scroll') root.scrollTop = current.startScrollTop - dy
  }

  const endGesture = (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = gesture.current
    if (!current || event.pointerId !== current.pointerId) return
    gesture.current = null
    const root = viewport.current
    if (root) root.style.scrollSnapType = ''
    if (cancelled) return
    const dy = event.clientY - current.startY
    if (current.mode === 'scroll') {
      const step = dy <= -48 ? 1 : dy >= 48 ? -1 : 0
      // The feed has no end: past the last card wraps to the first and back.
      const target = ((current.index + step) % videos.length + videos.length) % videos.length
      navigate(target)
    } else if (current.mode === 'pending'
      && performance.now() - current.startedAt < 600
      && (event.target as HTMLElement).classList.contains('gesture-layer')) {
      coordinator.toggle(current.index)
    }
  }

  // Desktop wheel at the feed edges: native scrolling stops at the first /
  // last card, so wrap around from the wheel handler (with a short lock so
  // one wheel gesture wraps once).
  const wheelLock = useRef(0)
  const onFeedWheel = (event: React.WheelEvent<HTMLElement>) => {
    const root = viewport.current
    if (!root || videos.length < 2) return
    const now = performance.now()
    if (now - wheelLock.current < 600) return
    const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2
    const atTop = root.scrollTop <= 0
    if (atBottom && event.deltaY > 0) { wheelLock.current = now; navigate(0) }
    else if (atTop && event.deltaY < 0) { wheelLock.current = now; navigate(videos.length - 1) }
  }

  const onFeedKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault(); navigate((center + 1) % videos.length)
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault(); navigate((center - 1 + videos.length) % videos.length)
    }
  }

  // Report activations upward (SPEC section 3: a video counts as viewed
  // when it becomes the active one). Playback authority stays here; this is
  // only a notification, keyed by internal id.
  const lastReportedActive = useRef<string | null>(null)
  useEffect(() => {
    if (active === null || !onActiveVideo) return
    const videoId = videos[active]?.id
    if (!videoId || lastReportedActive.current === videoId) return
    lastReportedActive.current = videoId
    onActiveVideo(videoId)
  }, [active, videos, onActiveVideo])

  // Search results open a video here by its YouTube external id. A video that
  // is not part of this feed list simply leaves the feed where it is.
  const handledFocusNonce = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!focusExternalVideoId || focusNonce === undefined) return
    if (handledFocusNonce.current === focusNonce) return
    handledFocusNonce.current = focusNonce
    const index = videos.findIndex(video => video.externalVideoId === focusExternalVideoId)
    if (index >= 0) navigate(index)
    // navigate is recreated per render; the nonce guard above is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusExternalVideoId, focusNonce, videos])

  if (!videos.length) return <main className="empty-state">表示できる動画がありません。ジャンル選択や登録動画を確認してください。</main>

  return <>
    <main className="feed" ref={viewport} aria-label="動画フィード" tabIndex={0} onKeyDown={onFeedKeyDown} onWheel={onFeedWheel}>
      {videos.map((video, index) => <article key={video.id} className="video-card" aria-label={`${index + 1}本目: ${video.label}`} data-active={active === index}
        onPointerDown={event => onCardPointerDown(event, index)}
        onPointerMove={onCardPointerMove}
        onPointerUp={event => endGesture(event, false)}
        onPointerCancel={event => endGesture(event, true)}>
        <div className="video-meta">
          <span className="eyebrow">{video.categories.length > 0 ? video.categories.join(' / ') : 'ジャンル未設定'} <span> / {String(index + 1).padStart(2, '0')} · 独自ラベル</span></span>
          <h2>{video.label}</h2>
        </div>
        <div className="player-slot">
          {mounted.includes(index)
            ? <YouTubePlayer video={video} index={index} coordinator={coordinator} load={preloadAdjacent ? inMountWindow(index, center) : index === center} />
            : <><div className="player-surface placeholder">近づくとプレーヤーを読み込みます</div><div className="player-status" /></>}
        </div>
        {renderCardExtras?.(video)}
      </article>)}
    </main>
    <section className="feed-controls" aria-label="現在の動画">
      <div>
        <div className="current-video"><span aria-live="polite">{center + 1} / {videos.length}</span>
          <a className="youtube-link" href={`https://www.youtube.com/watch?v=${videos[center].externalVideoId}`} target="_blank" rel="noreferrer">{videos[center].label} ↗</a></div>
      </div>
    </section>
  </>
}
