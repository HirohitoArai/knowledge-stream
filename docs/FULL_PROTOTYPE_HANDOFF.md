# 主要機能の実装 引き継ぎ — feature/full-prototype

対象ブランチ: `feature/full-prototype`（ベース: `feature/search-spec` の af3342a）
作成: 2026-11-10

## 位置づけ

- 本ブランチは `feature/search-spec`（検索のSPEC §2.4準拠実装）の上に、残りの主要機能をすべて実装したものです。根拠は `docs/SPEC.md` v0.2 と Luke の 2026-09-25 の投稿のみです。
- `feature/search-skeleton` は破棄案のままです。取り込まないでください（経緯は `docs/SEARCH_SPEC_HANDOFF.md` 参照）。
- **実環境へのデプロイはしていません。** Cloudflare のアカウント操作、実 D1 の作成、Access アプリケーションの作成、シークレット登録は未実施です（いずれも所有者の操作が必要）。

## SPEC 完成条件（§1）との対応

| # | 条件 | 状態 |
| --- | --- | --- |
| 1 | 初回ジャンル複数選択→フィード、以降は直接フィード | 実装済み（GenreGate＋端末保存） |
| 2 | 選択ジャンル（OR）の有効動画のみ表示 | 実装済み（`GET /api/v1/feed`、enabled のみ） |
| 3 | active 化で視聴済み、未視聴優先、各集合シャッフル、視聴済みのみで次周期 | 実装済み（`buildFeedOrder`、並びは取得時スナップショット） |
| 4 | 保存・興味なしは端末内、評価2種は匿名でサーバー保存 | 実装済み |
| 5 | 検索は登録済み有効動画のみ・部分一致（label/keywords/ジャンル名） | search-spec で実装済み |
| 6 | 管理画面で動画・ジャンルの CRUD、重複防止 | 実装済み（/admin、管理API、409） |
| 7 | 管理画面・管理API は Access なしでは使えない | 実装済み（JWT 全検証・fail-closed。実 Access での確認は未実施） |
| 8 | プレーヤー操作・公式UI を独自UIで覆わない | Phase 1.5 から継続。評価ボタンは iframe の外（プレーヤーの下） |
| 9 | 埋め込み不可・削除等の案内と前後移動 | Phase 1.5 で実装済み（プレーヤーのエラー処理は無変更） |

## コミット構成

ベース（af3342a）からの追加分。関心ごとに分かれているので、不要な部分はそのコミットだけ revert できます。

1. `feat(api)` — カテゴリ/フィード/評価API、feedback マイグレーション、repository 層
2. `feat(admin-api)` — Access 検証、管理 CRUD API、YouTube URL 正規化の shared 化
3. `feat(client)` — 端末内状態ストアとフィード並び順の純粋関数
4. `feat(feed-ui)` — ジャンルゲート、フィードのAPI接続、動画ごと操作、プロフィールタブ
5. `feat(admin-ui)` — /admin 管理コンソール
6. `docs` — 本書、PRIVACY.md、README 更新

## 実装メモ（判断した点）

- **フィード並びのスナップショット**: 視聴済み記録は即時に保存しますが、表示中の並びは取得時点で固定します。再生中に並び替えると見ている動画が動いてしまうためです。次にフィードを取得（ジャンル変更・再読み込み）したときに §3 の並びが再計算されます。
- **評価の頻度制限**: SPEC §5/§9 の「上限・429」を、Worker アイソレート内メモリのバースト制限（同一匿名ハッシュから10分30回）で実装しました。アイソレートをまたぐ全体制限ではありません。本番で厳密な制限が必要なら D1 やレート制限製品での実装に置き換えてください。
- **`FEEDBACK_SECRET` 未設定時**: ローカル開発用の固定文字列で HMAC します。ステージング/本番では必ずシークレットを設定してください（未設定でも生IDは保存されません）。
- **管理APIのローカル確認**: `.dev.vars` に `ADMIN_DEV_BYPASS=true` を書くと Access なしで管理APIが使えます。**本番・ステージングでは絶対に設定しないでください。** Access を使う場合は Worker の変数に `ACCESS_TEAM_DOMAIN` と `ACCESS_AUD` を設定します。
- **検索結果・保存リストから開く動画**: 現在のジャンル選択のフィードに含まれる動画だけが開けます（search-spec から継続する制約）。フィード外の動画はタブが切り替わるだけです。
- **seed のジャンルは3つ**（数学・ものづくり・物理）です。ジャンル追加は管理画面からできます。

## ローカル確認手順

```sh
git checkout feature/full-prototype
pnpm install --frozen-lockfile
pnpm exec wrangler d1 migrations apply knowledge-stream --local
pnpm exec wrangler d1 execute knowledge-stream --local --file=seeds/0001_local_sample_videos.sql
# 管理画面をローカルで使う場合のみ（.dev.vars は Git 管理外）
printf 'ADMIN_DEV_BYPASS=true\nFEEDBACK_SECRET=local-dev-secret\n' > .dev.vars
pnpm build && pnpm preview
# アプリ: http://localhost:4173/  管理: http://localhost:4173/admin
```

API の実打例:

```sh
curl 'http://localhost:4173/api/v1/categories'
curl 'http://localhost:4173/api/v1/feed?categories=<ジャンルUUID>'
curl -X POST 'http://localhost:4173/api/v1/feedback' \
  -H 'Content-Type: application/json' \
  -d '{"videoId":"<動画UUID>","type":"helpful","clientId":"<匿名UUID>"}'
curl 'http://localhost:4173/api/v1/admin/videos'   # バイパスなしでは 401/403
```

## 検証結果（2026-11-10、ローカル）

- `pnpm typecheck`（app / worker / node）: 成功
- `pnpm test`: **112件全通過**（ベース70件＋新規42件）
- `pnpm build`: 成功
- ローカル D1（migration 0001＋0002 と seed 適用済み）＋ workerd での実打確認:
  - categories: 有効ジャンル3件を返却
  - feed: 1ジャンルで1件、2ジャンル（OR）で2件、パラメータなしで400、無効化した動画は除外
  - search: 従来どおり動作（回帰なし）
  - feedback: 初回 `duplicate:false`、同一内容の再送で `duplicate:true`、不正な種類で400、未知の動画で404。DBには生の匿名IDではなく64桁のHMACハッシュのみ保存されることを直接確認
  - 管理API: バイパス有効時は一覧・登録（201）・重複（409）・無効化PATCH・削除（200）・再削除（404）・評価レポート取得まで一連を確認。バイパスなし・Access未設定では **403（Admin access is not configured）で fail-closed**
  - 画面フロー（jsdom で実ビルド＋実サーバーを操作）: 初回ゲート→ジャンル2つ選択→フィード2件（未選択ジャンルは出ない）→保存切替→評価送信（実POST）→興味なしでカード消去→LocalStorage の保存内容→プロフィールの保存リスト・プライバシー要約、**17項目全通過**。管理画面も実サーバー相手に一覧・評価レポート表示を確認
  - jsdom 実行時の注意: ハーネス側で AbortSignal を渡すと Node fetch が拒否する問題があり、確認スクリプト側で信号を取り除いている（アプリ側の問題ではない。前回 search-spec 確認時の知見と同じ）

## 未確認事項

- **実機（iPhone Safari）での見た目・操作感は未確認**です。ジャンルゲート、動画下の操作ボタン、管理画面の表示は実機で確認してください。プレーヤー本体は Phase 1.5 で実機確認済みのコードで、今回の変更は周辺のみです。
- **実 Cloudflare Access との結合は未確認**です（JWT 検証はテスト内で生成した本物の RS256 鍵で検証済み）。Access アプリケーション作成後に、ログイン必須であることと正規管理者が使えることを実環境で確認してください。
- D1 の実 SQL 実行はローカル D1（wrangler）で確認しています。実環境 D1 は未作成です。
- 「連続利用で重くなる」問題の根本解消は引き続き未確認です（Phase 1.5 の記録参照）。本ブランチはプレーヤーには触れていません。

## 本番化に残る所有者作業

1. 環境ごとに D1 を作成し、`wrangler.jsonc` の `database_id` を差し替える
2. `FEEDBACK_SECRET` をシークレット登録する
3. Cloudflare Access で /admin と /api/v1/admin/* を保護し、`ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` を設定する
4. マイグレーションを実環境へ適用し、管理画面から初期コンテンツを登録する
5. D1 の定期エクスポート（バックアップ）運用を決める（docs/PRIVACY.md 参照）

## 追補(2026-11-10):スワイプ操作への変更(本人の実機フィードバック)
- 「次の再生ができない。前後ボタンでなく YouTube Shorts のようにスワイプで移動したい」という本人の指摘で、前後ボタンを撤去し、スワイプ主体に変更した。
- 原因の理解:YouTube の iframe はクロスオリジンでタッチジェスチャーを飲み込むため、動画の上でのスワイプがフィードのスクロールにならない(特に Android Chrome)。従来のスナップスクロールは動画の外側でしか効かなかった。
- 実装:プレーヤー表面に透明なジェスチャー層(タッチ/ペンのみ、マウスでは無効)を重ね、ポインターイベントで縦スワイプを検出してフィードを指に追従させ、離すと前後1本へ移動する。タップは公式 API 経由の再生/一時停止トグルとして処理する。キーボードの ↑/↓ でも移動できる。
- 代償(明記):タッチでは YouTube プレーヤー内のボタン類(共有・全画面・シークバー等)に触れられない。再生/一時停止はタップで代替し、ステータス行の「再生する」ボタンと「YouTubeで見る」リンクは残してある。SPEC の「公式 UI を覆わない」原則との緊張があるため、この判断は本人指示によるものとして記録する(Luke との協議事項)。
- 検証:テスト114件全通過(スワイプで次を同期的に再生要求すること、スクロール失敗時に再生を許可しないこと、タップトグル、100回遷移の保持範囲を含む)。実機でのスワイプ感触は未確認。
- 自動再生について(2026-11-10 追記):本人がデモで「自動で再生開始してくれない」と指摘。原因は音声付き自動再生がブラウザポリシーで拒否されることで、現行は Phase 1.5 方針どおり「再生する」ボタン開始になる。ミュート自動再生＋タップで音声ONへの変更を提示したが、本人が「ミュートはいらない」と却下。現行方針(音声付き開始、拒否時はボタン開始)を維持する。
