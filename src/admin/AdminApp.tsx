import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { extractYouTubeVideoId } from '../../shared/youtubeUrl'

/**
 * Admin console at /admin (SPEC section 6). All data comes from the
 * Access-verified /api/v1/admin/* APIs; this UI holds no credentials and
 * gains nothing if Cloudflare Access is not in front of it — a 401/403
 * simply renders the guidance below.
 */

interface AdminVideo {
  id: string
  platform: string
  externalVideoId: string
  label: string
  searchKeywords: string
  enabled: boolean
  availabilityStatus: string
  categories: string[]
  categoryIds: string[]
}

interface AdminCategory {
  id: string
  name: string
  enabled: boolean
}

interface FeedbackEntry {
  id: string
  videoId: string
  videoLabel: string
  type: string
  createdAt: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'denied'; message: string }
  | { status: 'ready'; videos: AdminVideo[]; categories: AdminCategory[]; feedback: FeedbackEntry[] }

const api = async (path: string, init?: RequestInit): Promise<Response> =>
  fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })

export default function AdminApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [notice, setNotice] = useState('')

  const reload = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const [videosRes, categoriesRes, feedbackRes] = await Promise.all([
        api('/api/v1/admin/videos'),
        api('/api/v1/admin/categories'),
        api('/api/v1/admin/feedback'),
      ])
      if (videosRes.status === 401 || videosRes.status === 403) {
        const body = await videosRes.json().catch(() => null) as { error?: string } | null
        setState({ status: 'denied', message: body?.error ?? 'アクセスが拒否されました' })
        return
      }
      if (!videosRes.ok || !categoriesRes.ok || !feedbackRes.ok) throw new Error('load failed')
      setState({
        status: 'ready',
        videos: (await videosRes.json() as { videos: AdminVideo[] }).videos,
        categories: (await categoriesRes.json() as { categories: AdminCategory[] }).categories,
        feedback: (await feedbackRes.json() as { feedback: FeedbackEntry[] }).feedback,
      })
    } catch {
      setState({ status: 'denied', message: '管理APIに接続できませんでした' })
    }
  }, [])
  useEffect(() => { void reload() }, [reload])

  const act = async (action: () => Promise<Response>, success: string) => {
    const response = await action()
    if (response.ok) {
      setNotice(success)
      await reload()
    } else {
      const body = await response.json().catch(() => null) as { error?: string } | null
      setNotice(`失敗: ${body?.error ?? response.status}`)
    }
  }

  return <div className="admin-shell">
    <header className="admin-header">
      <h1>Knowledge Stream 管理</h1>
      <a href="/">← アプリに戻る</a>
    </header>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {state.status === 'loading' && <p role="status">読み込み中…</p>}
    {state.status === 'denied' && <main className="admin-denied">
      <h2>管理画面を表示できません</h2>
      <p>{state.message}</p>
      <p>
        この画面は Cloudflare Access で保護された管理APIを使います。Access のログインが済んでいない、
        またはこの環境に Access が設定されていない場合は表示できません。
        ローカル開発では <code>.dev.vars</code> に <code>ADMIN_DEV_BYPASS=true</code> を設定すると確認できます（本番では絶対に設定しないでください）。
      </p>
      <button type="button" onClick={() => void reload()}>再読み込み</button>
    </main>}
    {state.status === 'ready' && <>
      <VideoCreateForm
        categories={state.categories}
        onCreate={async input => {
          await act(() => api('/api/v1/admin/videos', { method: 'POST', body: JSON.stringify(input) }), '動画を登録しました')
        }}
      />
      <section aria-label="登録動画">
        <h2>登録動画（{state.videos.length}件）</h2>
        <ul className="admin-list">
          {state.videos.map(video => <li key={video.id} className="admin-item">
            <div className="admin-item-main">
              <strong>{video.label}</strong>
              <span className="admin-meta">
                {video.externalVideoId} · {video.categories.join(' / ') || 'ジャンルなし'} · {video.enabled ? '有効' : '無効'} · {video.availabilityStatus}
              </span>
            </div>
            <div className="admin-item-actions">
              <button type="button" onClick={() => void act(() => api(`/api/v1/admin/videos/${video.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !video.enabled }) }), video.enabled ? '無効化しました' : '有効化しました')}>
                {video.enabled ? '無効化' : '有効化'}
              </button>
              <button type="button" onClick={() => { if (window.confirm(`「${video.label}」を削除しますか？`)) void act(() => api(`/api/v1/admin/videos/${video.id}`, { method: 'DELETE' }), '削除しました') }}>
                削除
              </button>
            </div>
            <VideoEditForm video={video} categories={state.categories} onSave={async patch => {
              await act(() => api(`/api/v1/admin/videos/${video.id}`, { method: 'PATCH', body: JSON.stringify(patch) }), '保存しました')
            }} />
          </li>)}
        </ul>
      </section>
      <CategoryManager
        categories={state.categories}
        onCreate={async name => { await act(() => api('/api/v1/admin/categories', { method: 'POST', body: JSON.stringify({ name }) }), 'ジャンルを追加しました') }}
        onToggle={async category => { await act(() => api(`/api/v1/admin/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !category.enabled }) }), '変更しました') }}
        onDelete={async category => { await act(() => api(`/api/v1/admin/categories/${category.id}`, { method: 'DELETE' }), 'ジャンルを削除しました') }}
      />
      <section aria-label="評価レポート">
        <h2>評価レポート（新しい順・最大100件）</h2>
        {state.feedback.length === 0
          ? <p className="admin-meta">評価はまだありません。</p>
          : <ul className="admin-list">
              {state.feedback.map(entry => <li key={entry.id} className="admin-item">
                <span>{entry.type === 'wrong_category' ? '分類が違う' : '役立った'}</span>
                <span className="admin-item-main"><strong>{entry.videoLabel}</strong><span className="admin-meta">{entry.createdAt}</span></span>
              </li>)}
            </ul>}
      </section>
    </>}
  </div>
}

function VideoCreateForm({ categories, onCreate }: {
  categories: AdminCategory[]
  onCreate: (input: { source: string; label: string; searchKeywords: string; categoryIds: string[] }) => Promise<void>
}) {
  const [source, setSource] = useState('')
  const [label, setLabel] = useState('')
  const [keywords, setKeywords] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const previewId = source.trim() ? extractYouTubeVideoId(source) : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!previewId || !label.trim()) return
    void onCreate({ source, label, searchKeywords: keywords, categoryIds }).then(() => {
      setSource(''); setLabel(''); setKeywords(''); setCategoryIds([])
    })
  }

  return <section aria-label="動画登録">
    <h2>動画を登録</h2>
    <form className="admin-form" onSubmit={submit}>
      <label>YouTube URL または動画ID
        <input value={source} onChange={event => setSource(event.target.value)} placeholder="https://www.youtube.com/shorts/…" required />
      </label>
      {source.trim() && <p className="admin-meta">{previewId ? `動画ID: ${previewId}` : '対応していないURLです'}</p>}
      <label>独自ラベル（公式タイトルではなく、内容を表す短い説明）
        <input value={label} onChange={event => setLabel(event.target.value)} maxLength={200} required />
      </label>
      <label>検索キーワード（任意・スペース区切り）
        <input value={keywords} onChange={event => setKeywords(event.target.value)} maxLength={500} />
      </label>
      <CategoryCheckboxes categories={categories} selected={categoryIds} onChange={setCategoryIds} />
      <button type="submit" className="primary-button" disabled={!previewId || !label.trim()}>登録する</button>
    </form>
  </section>
}

function VideoEditForm({ video, categories, onSave }: {
  video: AdminVideo
  categories: AdminCategory[]
  onSave: (patch: { label: string; searchKeywords: string; categoryIds: string[]; availabilityStatus: string }) => Promise<void>
}) {
  const [label, setLabel] = useState(video.label)
  const [keywords, setKeywords] = useState(video.searchKeywords)
  const [categoryIds, setCategoryIds] = useState(video.categoryIds)
  const [availability, setAvailability] = useState(video.availabilityStatus)
  return <form className="admin-edit" onSubmit={event => {
    event.preventDefault()
    void onSave({ label, searchKeywords: keywords, categoryIds, availabilityStatus: availability })
  }}>
    <label>ラベル<input value={label} onChange={event => setLabel(event.target.value)} maxLength={200} /></label>
    <label>キーワード<input value={keywords} onChange={event => setKeywords(event.target.value)} maxLength={500} /></label>
    <label>可用性
      <select value={availability} onChange={event => setAvailability(event.target.value)}>
        <option value="active">active</option>
        <option value="unavailable">unavailable</option>
        <option value="private">private</option>
        <option value="deleted">deleted</option>
      </select>
    </label>
    <CategoryCheckboxes categories={categories} selected={categoryIds} onChange={setCategoryIds} />
    <button type="submit">変更を保存</button>
  </form>
}

function CategoryCheckboxes({ categories, selected, onChange }: {
  categories: AdminCategory[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return <fieldset className="admin-categories">
    <legend>ジャンル（複数可）</legend>
    {categories.map(category => <label key={category.id} className="admin-check">
      <input
        type="checkbox"
        checked={selected.includes(category.id)}
        onChange={event => onChange(event.target.checked ? [...selected, category.id] : selected.filter(id => id !== category.id))}
      />
      {category.name}{!category.enabled && '（無効）'}
    </label>)}
  </fieldset>
}

function CategoryManager({ categories, onCreate, onToggle, onDelete }: {
  categories: AdminCategory[]
  onCreate: (name: string) => Promise<void>
  onToggle: (category: AdminCategory) => Promise<void>
  onDelete: (category: AdminCategory) => Promise<void>
}) {
  const [name, setName] = useState('')
  return <section aria-label="ジャンル管理">
    <h2>ジャンル管理</h2>
    <form className="admin-form" onSubmit={event => {
      event.preventDefault()
      if (name.trim()) void onCreate(name.trim()).then(() => setName(''))
    }}>
      <label>新しいジャンル名<input value={name} onChange={event => setName(event.target.value)} maxLength={50} /></label>
      <button type="submit" disabled={!name.trim()}>追加</button>
    </form>
    <ul className="admin-list">
      {categories.map(category => <li key={category.id} className="admin-item">
        <span className="admin-item-main"><strong>{category.name}</strong><span className="admin-meta">{category.enabled ? '有効' : '無効'}</span></span>
        <span className="admin-item-actions">
          <button type="button" onClick={() => void onToggle(category)}>{category.enabled ? '無効化' : '有効化'}</button>
          <button type="button" onClick={() => { if (window.confirm(`ジャンル「${category.name}」を削除しますか？`)) void onDelete(category) }}>削除</button>
        </span>
      </li>)}
    </ul>
  </section>
}
