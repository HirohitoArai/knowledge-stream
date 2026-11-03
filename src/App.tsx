import { useEffect, useState } from 'react'
import type { HealthResponse, SearchVideoDto } from '../shared/api'
import { testVideos } from './videos'
import { VideoFeed } from './VideoFeed'
import { SearchView } from './SearchView'
import { startDiagnostics } from './player/diagnostics'

type Tab = 'videos' | 'search' | 'profile'

export default function App() {
  useEffect(startDiagnostics, [])
  // Opt-in comparison for the iPhone slowdown investigation; no saved setting.
  const [preloadAdjacent] = useState(() => new URLSearchParams(window.location.search).get('preload') !== 'off')
  const [apiStatus, setApiStatus] = useState('API 接続中')
  const [tab, setTab] = useState<Tab>('videos')
  // A search result tap asks the feed to open that video (matched by the
  // YouTube external id). The nonce retriggers the request for repeat taps.
  const [openRequest, setOpenRequest] = useState<{ externalVideoId: string; nonce: number } | null>(null)
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

  const openVideo = (video: SearchVideoDto) => {
    setOpenRequest({ externalVideoId: video.externalVideoId, nonce: Date.now() })
    setTab('videos')
  }

  return <div className="app-shell">
    <header className="app-header"><div><p className="eyebrow">SHORTS SPIKE · PHASE 1.5</p><h1>Knowledge Stream<span> / 知るを、つなぐ。</span></h1></div><span className="api-status">{!preloadAdjacent && '先読みオフ · '}{apiStatus}</span></header>
    {tab === 'videos' && <VideoFeed videos={testVideos} preloadAdjacent={preloadAdjacent} focusExternalVideoId={openRequest?.externalVideoId} focusNonce={openRequest?.nonce} />}
    {tab === 'search' && <SearchView onOpenVideo={openVideo} />}
    {tab === 'profile' && <main className="profile-placeholder" aria-label="プロフィール（設定）">
      <h2>プロフィール（設定）</h2>
      <p>ジャンル選択・保存・端末内データ管理（SPEC 2.5）は今後の実装です。このタブは配置のみで、機能はまだありません。</p>
    </main>}
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <button aria-current={tab === 'videos' ? 'page' : undefined} onClick={() => setTab('videos')}>▶ <span>動画</span></button>
      <button aria-current={tab === 'search' ? 'page' : undefined} onClick={() => setTab('search')}>⌕ <span>検索</span></button>
      <button aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setTab('profile')}>◎ <span>プロフィール</span></button>
    </nav>
  </div>
}
