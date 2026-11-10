import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { CategoriesResponse, CategoryDto, FeedResponse, FeedbackType, HealthResponse, SearchVideoDto, VideoDto } from '../shared/api'
import { VideoFeed } from './VideoFeed'
import { SearchView } from './SearchView'
import { GenreSelect } from './GenreSelect'
import { ProfileView } from './ProfileView'
import { clearClientStorage, loadClientState, saveClientState } from './state/clientState'
import type { ClientState } from './state/clientState'
import { buildFeedOrder } from './feed/order'
import { startDiagnostics } from './player/diagnostics'

type Tab = 'videos' | 'search' | 'profile'
type LoadStatus = 'loading' | 'ready' | 'error'

const toFeedVideo = (video: VideoDto) => ({
  id: video.id,
  externalVideoId: video.externalVideoId,
  label: video.label,
  categories: video.categories,
})

export default function App() {
  useEffect(startDiagnostics, [])
  // Opt-in comparison for the iPhone slowdown investigation; no saved setting.
  const [preloadAdjacent] = useState(() => new URLSearchParams(window.location.search).get('preload') !== 'off')
  const [apiStatus, setApiStatus] = useState('API 接続中')
  const [tab, setTab] = useState<Tab>('videos')
  const [openRequest, setOpenRequest] = useState<{ externalVideoId: string; nonce: number } | null>(null)

  const [clientState, setClientState] = useState<ClientState>(() => loadClientState())
  const stateRef = useRef(clientState)
  stateRef.current = clientState
  useEffect(() => { saveClientState(clientState) }, [clientState])

  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [categoriesStatus, setCategoriesStatus] = useState<LoadStatus>('loading')
  const [candidates, setCandidates] = useState<VideoDto[]>([])
  const [feedOrder, setFeedOrder] = useState<VideoDto[]>([])
  const [feedStatus, setFeedStatus] = useState<LoadStatus>('loading')
  const [feedAttempt, setFeedAttempt] = useState(0)
  const [feedbackSent, setFeedbackSent] = useState<Record<string, FeedbackType[]>>({})
  const [feedbackNotice, setFeedbackNotice] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8_000)
    let mounted = true
    void fetch('/api/v1/health', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('API unavailable')
      const body: HealthResponse = await response.json()
      if (mounted) setApiStatus(body.ok && body.phase === 1 ? 'API 接続済み' : 'API 応答エラー')
    }).catch(() => { if (mounted) setApiStatus('API 未接続（動画操作は利用可能）') })
      .finally(() => clearTimeout(timeout))
    return () => { mounted = false; clearTimeout(timeout); controller.abort() }
  }, [])

  const loadCategories = useCallback(async () => {
    setCategoriesStatus('loading')
    try {
      const response = await fetch('/api/v1/categories')
      if (!response.ok) throw new Error('categories unavailable')
      const body = await response.json() as CategoriesResponse
      setCategories(body.categories)
      setCategoriesStatus('ready')
    } catch {
      setCategoriesStatus('error')
    }
  }, [])
  useEffect(() => { void loadCategories() }, [loadCategories])

  const selectedCategoryIds = clientState.selectedCategoryIds
  const selectionKey = selectedCategoryIds?.join(',') ?? null

  useEffect(() => {
    if (!selectionKey) return
    const controller = new AbortController()
    setFeedStatus('loading')
    void (async () => {
      try {
        const response = await fetch(`/api/v1/feed?categories=${encodeURIComponent(selectionKey)}`, { signal: controller.signal })
        if (!response.ok) throw new Error('feed unavailable')
        const body = await response.json() as FeedResponse
        if (controller.signal.aborted) return
        setCandidates(body.videos)
        // Cache DTOs so the profile's saved list can render labels later.
        setClientState(previous => {
          const knownVideos = { ...previous.knownVideos }
          for (const video of body.videos) knownVideos[video.id] = video
          return { ...previous, knownVideos }
        })
        // The order is a snapshot: marking videos as viewed while watching
        // must not reshuffle the feed under the user (SPEC section 3's
        // ordering applies when the feed is built).
        const state = stateRef.current
        setFeedOrder(buildFeedOrder(body.videos, new Set(Object.keys(state.viewed)), new Set(state.notInterested)))
        setFeedStatus('ready')
      } catch {
        if (!controller.signal.aborted) setFeedStatus('error')
      }
    })()
    return () => controller.abort()
  }, [selectionKey, feedAttempt])

  const markViewed = useCallback((videoId: string) => {
    setClientState(previous => previous.viewed[videoId]
      ? previous
      : { ...previous, viewed: { ...previous.viewed, [videoId]: Date.now() } })
  }, [])

  const toggleSave = useCallback((videoId: string) => {
    setClientState(previous => ({
      ...previous,
      saved: previous.saved.includes(videoId)
        ? previous.saved.filter(id => id !== videoId)
        : [...previous.saved, videoId],
    }))
  }, [])

  const markNotInterested = useCallback((videoId: string) => {
    setClientState(previous => previous.notInterested.includes(videoId)
      ? previous
      : { ...previous, notInterested: [...previous.notInterested, videoId] })
    // Unlike viewed marking, "not interested" removes the card immediately:
    // that removal is the action the user just asked for.
    setFeedOrder(previous => previous.filter(video => video.id !== videoId))
    setCandidates(previous => previous.filter(video => video.id !== videoId))
  }, [])

  const sendFeedback = useCallback(async (video: VideoDto, type: FeedbackType) => {
    if (feedbackSent[video.id]?.includes(type)) return
    try {
      const response = await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id, type, clientId: stateRef.current.clientId }),
      })
      if (!response.ok) throw new Error('feedback failed')
      const body = await response.json() as { duplicate?: boolean }
      setFeedbackSent(previous => ({ ...previous, [video.id]: [...(previous[video.id] ?? []), type] }))
      setFeedbackNotice(previous => ({ ...previous, [video.id]: body.duplicate ? '送信済みです' : '評価を送信しました' }))
    } catch {
      setFeedbackNotice(previous => ({ ...previous, [video.id]: '評価の送信に失敗しました' }))
    }
  }, [feedbackSent])

  const clearData = useCallback((scope: 'viewed' | 'saved' | 'notInterested' | 'all') => {
    if (scope === 'all') {
      clearClientStorage()
      setClientState(loadClientState())
      setCandidates([])
      setFeedOrder([])
      setTab('videos')
      return
    }
    setClientState(previous => ({
      ...previous,
      viewed: scope === 'viewed' ? {} : previous.viewed,
      saved: scope === 'saved' ? [] : previous.saved,
      notInterested: scope === 'notInterested' ? [] : previous.notInterested,
    }))
  }, [])

  const openVideo = useCallback((video: SearchVideoDto | VideoDto) => {
    setClientState(previous => ({ ...previous, knownVideos: { ...previous.knownVideos, [video.id]: video } }))
    setOpenRequest({ externalVideoId: video.externalVideoId, nonce: Date.now() })
    setTab('videos')
  }, [])

  const renderCardExtras = useCallback((video: VideoDto) => {
    const saved = clientState.saved.includes(video.id)
    const sent = feedbackSent[video.id] ?? []
    return <div className="video-actions" aria-label={`${video.label} への操作`}>
      <button type="button" aria-pressed={saved} onClick={() => toggleSave(video.id)}>{saved ? '保存済み ✓' : '保存'}</button>
      <button type="button" onClick={() => markNotInterested(video.id)}>興味なし</button>
      <button type="button" disabled={sent.includes('helpful')} onClick={() => void sendFeedback(video, 'helpful')}>{sent.includes('helpful') ? '役立った ✓' : '役立った'}</button>
      <button type="button" disabled={sent.includes('wrong_category')} onClick={() => void sendFeedback(video, 'wrong_category')}>分類が違う</button>
      {feedbackNotice[video.id] && <span className="video-action-notice" role="status">{feedbackNotice[video.id]}</span>}
    </div>
  }, [clientState.saved, feedbackSent, feedbackNotice, toggleSave, markNotInterested, sendFeedback])

  const needsGenreSelection = selectedCategoryIds === null

  return <div className="app-shell">
    <header className="app-header"><div><p className="eyebrow">KNOWLEDGE STREAM</p><h1>Knowledge Stream<span> / 知るを、つなぐ。</span></h1></div><span className="api-status">{!preloadAdjacent && '先読みオフ · '}{apiStatus}</span></header>
    {needsGenreSelection
      ? <GenreGate
          categories={categories}
          status={categoriesStatus}
          onRetry={() => void loadCategories()}
          onComplete={ids => setClientState(previous => ({ ...previous, selectedCategoryIds: ids }))}
        />
      : <>
        {tab === 'videos' && (feedStatus === 'loading'
          ? <main className="empty-state" role="status">動画を読み込み中…</main>
          : feedStatus === 'error'
            ? <main className="empty-state">動画を読み込めませんでした。通信状態を確認してください。 <button type="button" onClick={() => setFeedAttempt(attempt => attempt + 1)}>再読み込み</button></main>
            : candidates.length === 0
              ? <main className="empty-state">選択したジャンルにはまだ動画が登録されていません。プロフィールタブでジャンルを変えられます。</main>
              : <VideoFeed
                  videos={feedOrder.map(toFeedVideo)}
                  preloadAdjacent={preloadAdjacent}
                  focusExternalVideoId={openRequest?.externalVideoId}
                  focusNonce={openRequest?.nonce}
                  onActiveVideo={markViewed}
                  renderCardExtras={video => renderCardExtras(feedOrder.find(entry => entry.id === video.id) ?? { ...video, platform: 'youtube' })}
                />)}
        {tab === 'search' && <SearchView onOpenVideo={openVideo} />}
        {tab === 'profile' && <ProfileView
          categories={categories}
          selectedCategoryIds={selectedCategoryIds ?? []}
          onSaveCategories={ids => setClientState(previous => ({ ...previous, selectedCategoryIds: ids }))}
          savedVideos={clientState.saved.map(id => clientState.knownVideos[id]).filter((video): video is VideoDto => Boolean(video))}
          onOpenVideo={openVideo}
          counts={{
            viewed: Object.keys(clientState.viewed).length,
            saved: clientState.saved.length,
            notInterested: clientState.notInterested.length,
          }}
          onClear={clearData}
        />}
        <nav className="bottom-nav" aria-label="メインナビゲーション">
          <button aria-current={tab === 'videos' ? 'page' : undefined} onClick={() => setTab('videos')}>▶ <span>動画</span></button>
          <button aria-current={tab === 'search' ? 'page' : undefined} onClick={() => setTab('search')}>⌕ <span>検索</span></button>
          <button aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setTab('profile')}>◎ <span>プロフィール</span></button>
        </nav>
      </>}
  </div>
}

/** First-run genre selection (SPEC section 2.1). */
function GenreGate({ categories, status, onRetry, onComplete }: {
  categories: CategoryDto[]
  status: LoadStatus
  onRetry: () => void
  onComplete: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) => {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (selected.size > 0) onComplete([...selected])
  }
  return <main className="genre-gate" aria-label="ジャンル選択">
    <h2>興味のあるジャンルを選んでください</h2>
    <p className="profile-note">選んだジャンルの動画だけがフィードに表示されます。あとからプロフィールタブで変更できます。</p>
    {status === 'loading' && <p role="status">ジャンルを読み込み中…</p>}
    {status === 'error' && <p>ジャンルを読み込めませんでした。 <button type="button" onClick={onRetry}>再読み込み</button></p>}
    {status === 'ready' && (categories.length === 0
      ? <p>選択できるジャンルがまだ登録されていません。管理者に連絡してください。</p>
      : <form onSubmit={submit}>
          <GenreSelect categories={categories} selected={selected} onToggle={toggle} />
          <button type="submit" className="primary-button" disabled={selected.size === 0}>このジャンルで始める</button>
          {selected.size === 0 && <p className="profile-note">少なくとも1つ選んでください。</p>}
        </form>)}
  </main>
}
