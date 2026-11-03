import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SearchView } from '../src/SearchView'
import type { SearchResponse } from '../shared/api'

const responseBody: SearchResponse = {
  query: 'ピザ',
  limit: 20,
  results: [{
    id: '48dba56f-3271-4bb9-b59e-dca27c7221c0',
    platform: 'youtube',
    externalVideoId: 'pgGrQjYcm5A',
    label: 'ピザで円周率を考える',
    categories: ['数学'],
  }],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function submitSearch(container: HTMLElement, query: string) {
  fireEvent.change(screen.getByLabelText(/登録済み動画を検索/), { target: { value: query } })
  fireEvent.submit(container.querySelector('form')!)
}

it('queries the server search API and opens the tapped result in the video tab', async () => {
  const fetchMock = stubFetch(responseBody)
  const onOpenVideo = vi.fn()
  const { container } = render(<SearchView onOpenVideo={onOpenVideo} />)
  await submitSearch(container, 'ピザ')
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/search?q=%E3%83%94%E3%82%B6')
  const result = await screen.findByRole('button', { name: /ピザで円周率を考える/ })
  expect(result.textContent).toContain('数学')
  fireEvent.click(result)
  expect(onOpenVideo).toHaveBeenCalledWith(responseBody.results[0])
})

it('shows an empty state when nothing matches', async () => {
  stubFetch({ query: 'zzz', limit: 20, results: [] })
  const { container } = render(<SearchView onOpenVideo={vi.fn()} />)
  await submitSearch(container, 'zzz')
  expect(await screen.findByText(/一致する動画は登録されていません/)).toBeTruthy()
})

it('shows the server validation error instead of results', async () => {
  stubFetch({ error: 'Query parameter "q" must be at most 100 characters' }, false)
  const { container } = render(<SearchView onOpenVideo={vi.fn()} />)
  await submitSearch(container, 'x')
  expect(await screen.findByRole('alert')).toBeTruthy()
})
