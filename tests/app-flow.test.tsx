// App flow tests: genre gate -> API feed -> per-video actions -> profile.
// VideoFeed is mocked (the real player is covered by the feed/player
// tests); this file verifies the wiring and the on-device state effects.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { CLIENT_STATE_KEY } from '../src/state/clientState'

vi.mock('../src/VideoFeed', () => ({
  VideoFeed: (props: {
    videos: { id: string; label: string }[]
    onActiveVideo?: (videoId: string) => void
    renderCardExtras?: (video: { id: string; label: string }) => React.ReactNode
  }) => <div>
    {props.videos.map(video => <div key={video.id}>
      <span>{video.label}</span>
      <button onClick={() => props.onActiveVideo?.(video.id)}>activate {video.id}</button>
      {props.renderCardExtras?.(video)}
    </div>)}
  </div>,
}))

const categories = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: '数学' },
  { id: 'a0000000-0000-4000-8000-000000000003', name: '物理' },
]
const feedVideos = [
  { id: '48dba56f-3271-4bb9-b59e-dca27c7221c0', platform: 'youtube', externalVideoId: 'pgGrQjYcm5A', label: 'ピザで円周率を考える', categories: ['数学'] },
  { id: 'c225d68d-a34c-4a70-bc95-d00cc546aec4', platform: 'youtube', externalVideoId: 'Ko02mUWhItA', label: '風洞で観察する雨粒のかたち', categories: ['物理'] },
]
const feedbackCalls: unknown[] = []

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/v1/health')) return Response.json({ ok: true, phase: 1 })
    if (url.endsWith('/api/v1/categories')) return Response.json({ categories })
    if (url.includes('/api/v1/feed?')) return Response.json({ videos: feedVideos })
    if (url.endsWith('/api/v1/feedback')) {
      feedbackCalls.push(JSON.parse(String(init?.body)))
      return Response.json({ ok: true, duplicate: false })
    }
    return new Response('not found', { status: 404 })
  })
}

const storedState = () => JSON.parse(window.localStorage.getItem(CLIENT_STATE_KEY) ?? '{}') as {
  viewed: Record<string, number>; saved: string[]; notInterested: string[]; selectedCategoryIds: string[] | null
}

beforeEach(() => {
  window.localStorage.clear()
  feedbackCalls.length = 0
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => cleanup())

describe('app flow', () => {
  it('gates on genre selection first, then loads the feed from the API', async () => {
    render(<App />)
    expect(await screen.findByText('興味のあるジャンルを選んでください')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '数学' }))
    fireEvent.click(screen.getByRole('button', { name: 'このジャンルで始める' }))
    expect(await screen.findByText('ピザで円周率を考える')).toBeTruthy()
    expect(await screen.findByText('風洞で観察する雨粒のかたち')).toBeTruthy()
    expect(storedState().selectedCategoryIds).toEqual([categories[0].id])
  })

  it('records viewed on activation, saves, sends feedback once, and removes not-interested', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '数学' }))
    fireEvent.click(screen.getByRole('button', { name: 'このジャンルで始める' }))
    await screen.findByText('ピザで円周率を考える')

    fireEvent.click(screen.getByRole('button', { name: `activate ${feedVideos[0].id}` }))
    await waitFor(() => expect(storedState().viewed[feedVideos[0].id]).toBeTypeOf('number'))

    const firstCardActions = screen.getByLabelText('ピザで円周率を考える への操作')
    fireEvent.click(firstCardActions.querySelectorAll('button')[0])
    await waitFor(() => expect(storedState().saved).toEqual([feedVideos[0].id]))
    expect(firstCardActions.textContent).toContain('保存済み')

    fireEvent.click(firstCardActions.querySelectorAll('button')[2])
    await waitFor(() => expect(feedbackCalls).toHaveLength(1))
    expect(feedbackCalls[0]).toMatchObject({ videoId: feedVideos[0].id, type: 'helpful' })
    expect((feedbackCalls[0] as { clientId: string }).clientId).toBeTruthy()
    await waitFor(() => expect(firstCardActions.textContent).toContain('評価を送信しました'))

    const secondCardActions = screen.getByLabelText('風洞で観察する雨粒のかたち への操作')
    fireEvent.click(secondCardActions.querySelectorAll('button')[1])
    await waitFor(() => expect(screen.queryByText('風洞で観察する雨粒のかたち')).toBeNull())
    expect(storedState().notInterested).toEqual([feedVideos[1].id])

    fireEvent.click(screen.getByRole('button', { name: /プロフィール/ }))
    expect(await screen.findByText('保存した動画（1件）')).toBeTruthy()
    expect(screen.getByText('ピザで円周率を考える', { selector: '.search-result-label' })).toBeTruthy()
  })

  it('skips the gate when a genre selection is already stored', async () => {
    window.localStorage.setItem(CLIENT_STATE_KEY, JSON.stringify({
      viewed: {}, saved: [], notInterested: [],
      selectedCategoryIds: [categories[0].id], clientId: '11111111-2222-4333-8444-555555555555', knownVideos: {},
    }))
    render(<App />)
    expect(await screen.findByText('ピザで円周率を考える')).toBeTruthy()
    expect(screen.queryByText('興味のあるジャンルを選んでください')).toBeNull()
  })
})
