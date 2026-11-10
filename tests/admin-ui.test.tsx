// Admin UI smoke tests: list rendering from the admin APIs, the create
// flow posting a normalized registration, and the fail-closed guidance
// when Access rejects the request.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminApp from '../src/admin/AdminApp'

const videos = [{
  id: '48dba56f-3271-4bb9-b59e-dca27c7221c0', platform: 'youtube', externalVideoId: 'pgGrQjYcm5A',
  label: 'ピザで円周率を考える', searchKeywords: '円周率', enabled: true, availabilityStatus: 'active',
  categories: ['数学'], categoryIds: ['a0000000-0000-4000-8000-000000000001'],
}]
const categories = [{ id: 'a0000000-0000-4000-8000-000000000001', name: '数学', enabled: true }]
const posts: { url: string; body: unknown }[] = []

function mockFetch(denied = false) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (denied && url.includes('/api/v1/admin/')) return Response.json({ error: 'Missing Cloudflare Access token' }, { status: 401 })
    if (url.endsWith('/api/v1/admin/videos') && (!init?.method || init.method === 'GET')) return Response.json({ videos })
    if (url.endsWith('/api/v1/admin/categories')) return Response.json({ categories })
    if (url.endsWith('/api/v1/admin/feedback')) return Response.json({ feedback: [] })
    if (url.endsWith('/api/v1/admin/videos') && init?.method === 'POST') {
      posts.push({ url, body: JSON.parse(String(init.body)) })
      return Response.json({ id: 'new-id' }, { status: 201 })
    }
    return new Response('not found', { status: 404 })
  })
}

beforeEach(() => { posts.length = 0 })
afterEach(() => cleanup())

describe('admin UI', () => {
  it('lists registered videos and categories from the admin APIs', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<AdminApp />)
    expect(await screen.findByText('登録動画（1件）')).toBeTruthy()
    expect(screen.getAllByText('ピザで円周率を考える').length).toBeGreaterThan(0)
    expect(screen.getByText('ジャンル管理')).toBeTruthy()
    expect(screen.getByText('評価はまだありません。')).toBeTruthy()
  })

  it('registers a video from a pasted URL with the selected genres', async () => {
    vi.stubGlobal('fetch', mockFetch())
    render(<AdminApp />)
    await screen.findByText('登録動画（1件）')
    const sourceInput = screen.getByPlaceholderText('https://www.youtube.com/shorts/…')
    fireEvent.change(sourceInput, { target: { value: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' } })
    expect(await screen.findByText('動画ID: dQw4w9WgXcQ')).toBeTruthy()
    const labelInput = document.querySelectorAll('.admin-form input')[1] as HTMLInputElement
    fireEvent.change(labelInput, { target: { value: 'テスト用ラベル' } })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body).toMatchObject({ source: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', label: 'テスト用ラベル' })
  })

  it('shows guidance instead of data when Access rejects the request', async () => {
    vi.stubGlobal('fetch', mockFetch(true))
    render(<AdminApp />)
    expect(await screen.findByText('管理画面を表示できません')).toBeTruthy()
    expect(screen.getByText(/ADMIN_DEV_BYPASS/)).toBeTruthy()
    expect(screen.queryByText('登録動画（1件）')).toBeNull()
  })
})
