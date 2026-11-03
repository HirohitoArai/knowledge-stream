import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SearchResponse, SearchVideoDto } from '../shared/api'

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; response: SearchResponse }

/**
 * Search tab (SPEC sections 2.2 and 2.4). Partial match runs on the server
 * via GET /api/v1/search over registered videos only; this view never
 * filters the loaded feed on the device. Tapping a result asks the parent
 * to open that video in the video tab. No genre filtering UI: section 2.4
 * puts filtering out of scope.
 */
export function SearchView({ onOpenVideo }: { onOpenVideo: (video: SearchVideoDto) => void }) {
  const [input, setInput] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })

  const runSearch = async (event: FormEvent) => {
    event.preventDefault()
    const query = input.trim()
    if (!query || state.status === 'loading') return
    setState({ status: 'loading' })
    try {
      const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`)
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = body && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : '検索に失敗しました'
        setState({ status: 'error', message })
        return
      }
      setState({ status: 'done', response: body as SearchResponse })
    } catch {
      setState({ status: 'error', message: '検索に失敗しました。通信状態を確認してください。' })
    }
  }

  return <main className="search-view" aria-label="検索">
    <form className="search-form" onSubmit={runSearch} role="search">
      <label className="search-label" htmlFor="search-input">登録済み動画を検索（部分一致）</label>
      <div className="search-row">
        <input
          id="search-input"
          type="search"
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder="ラベル・キーワード・ジャンル名"
          maxLength={100}
          autoComplete="off"
        />
        <button type="submit" disabled={!input.trim() || state.status === 'loading'}>検索</button>
      </div>
      <p className="search-note">対象はKnowledge Streamに登録された動画のみです。YouTube全体の検索ではありません。</p>
    </form>
    {state.status === 'loading' && <p className="search-status" role="status">検索中…</p>}
    {state.status === 'error' && <p className="search-status" role="alert">{state.message}</p>}
    {state.status === 'done' && (state.response.results.length === 0
      ? <p className="search-status">「{state.response.query}」に一致する動画は登録されていません。</p>
      : <ul className="search-results">
          {state.response.results.map(video => <li key={video.id}>
            <button type="button" className="search-result" onClick={() => onOpenVideo(video)}>
              <span className="search-result-label">{video.label}</span>
              {video.categories.length > 0 && <span className="search-result-categories">{video.categories.join(' / ')}</span>}
            </button>
          </li>)}
        </ul>)}
  </main>
}
