import { useState } from 'react'
import type { CategoryDto, VideoDto } from '../shared/api'
import { GenreSelect } from './GenreSelect'

/**
 * Profile (settings) tab (SPEC section 2.5): change genres, review saved
 * videos, and delete on-device data. Server-side feedback is anonymous and
 * cannot be deleted from here; the UI says so instead of implying it can.
 */
export function ProfileView({
  categories,
  selectedCategoryIds,
  onSaveCategories,
  savedVideos,
  onOpenVideo,
  counts,
  onClear,
}: {
  categories: CategoryDto[]
  selectedCategoryIds: string[]
  onSaveCategories: (ids: string[]) => void
  savedVideos: VideoDto[]
  onOpenVideo: (video: VideoDto) => void
  counts: { viewed: number; saved: number; notInterested: number }
  onClear: (scope: 'viewed' | 'saved' | 'notInterested' | 'all') => void
}) {
  const [draft, setDraft] = useState<ReadonlySet<string> | null>(null)
  const selection = draft ?? new Set(selectedCategoryIds)
  const dirty = draft !== null

  const toggle = (id: string) => {
    const next = new Set(selection)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDraft(next)
  }

  const confirmClear = (scope: 'viewed' | 'saved' | 'notInterested' | 'all', label: string) => {
    if (window.confirm(`${label}をこの端末から削除します。よろしいですか？`)) onClear(scope)
  }

  return <main className="profile-view" aria-label="プロフィール（設定）">
    <section>
      <h2>ジャンル設定</h2>
      <p className="profile-note">選んだジャンルの動画がフィードに表示されます（複数選択可）。</p>
      {categories.length === 0
        ? <p className="profile-note">ジャンルを読み込めませんでした。</p>
        : <>
          <GenreSelect categories={categories} selected={selection} onToggle={toggle} />
          <button
            type="button"
            className="primary-button"
            disabled={!dirty || selection.size === 0}
            onClick={() => { onSaveCategories([...selection]); setDraft(null) }}
          >
            ジャンルを保存する
          </button>
          {selection.size === 0 && <p className="profile-note">少なくとも1つ選んでください。</p>}
        </>}
    </section>

    <section>
      <h2>保存した動画（{savedVideos.length}件）</h2>
      {savedVideos.length === 0
        ? <p className="profile-note">保存した動画はまだありません。動画カードの「保存」から追加できます。</p>
        : <ul className="saved-list">
            {savedVideos.map(video => <li key={video.id}>
              <button type="button" className="search-result" onClick={() => onOpenVideo(video)}>
                <span className="search-result-label">{video.label}</span>
                {video.categories.length > 0 && <span className="search-result-categories">{video.categories.join(' / ')}</span>}
              </button>
            </li>)}
          </ul>}
    </section>

    <section>
      <h2>端末内データ</h2>
      <p className="profile-note">
        視聴済み {counts.viewed} 件 / 保存 {counts.saved} 件 / 興味なし {counts.notInterested} 件はこの端末の中だけに保存されています。
        サーバーへ送った匿名の評価（役立った／分類が違う）は端末と結びつかない形で保存されるため、ここからは削除できません。
      </p>
      <div className="danger-zone">
        <button type="button" onClick={() => confirmClear('viewed', '視聴履歴')}>視聴履歴を削除</button>
        <button type="button" onClick={() => confirmClear('saved', '保存リスト')}>保存リストを削除</button>
        <button type="button" onClick={() => confirmClear('notInterested', '興味なしリスト')}>興味なしを削除</button>
        <button type="button" onClick={() => confirmClear('all', '端末内データすべて（ジャンル選択を含む）')}>すべて削除</button>
      </div>
    </section>

    <section>
      <h2>プライバシーと使い方</h2>
      <p className="profile-note">
        アカウント登録はありません。視聴・保存・興味なし・ジャンル選択はこの端末にのみ保存され、サーバーへは送られません。
        「役立った」「分類が違う」を押したときだけ、動画IDと評価の種類、端末を識別できない形に変換した匿名IDがサーバーへ送られます。
        動画の再生はYouTubeの公式プレーヤー経由で、再生に伴う通信はYouTube（Google）のプライバシーポリシーに従います。
        詳しくはリポジトリの docs/PRIVACY.md を参照してください。
      </p>
    </section>
  </main>
}
