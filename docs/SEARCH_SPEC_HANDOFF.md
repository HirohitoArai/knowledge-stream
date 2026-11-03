# 検索機能（SPEC §2.4準拠）引き継ぎ — feature/search-spec

対象ブランチ: `feature/search-spec`（ベース: `feature/phase-1-player-spike` の 284121c）
作成: 2026-11-03

## 最初に：どのブランチが正か

- **本ブランチ `feature/search-spec` が正**です。検索を SPEC §2.4 のとおりサーバー側で実装しました。
- `feature/search-skeleton` は**破棄案**です。あちらは「Discord #やることリスト 2026-11-02 に本人の決定があった」という記録を前提に作られましたが、2026-11-03 に Discord 原文を再確認した結果、**そのような投稿は存在しませんでした**（#やることリスト の投稿は 2026-09-25 の Luke の分のみ）。skeleton の「見出し下の検索窓」「ジャンルチップ」「端末側フィルタ filterFeedVideos」は根拠のない設計なので、取り込まないでください。ブランチ自体は経緯の記録として残してあります。
- 本実装の根拠は2つだけです。
  1. `docs/SPEC.md` §2.4（対象は管理者が登録した有効な動画のみ、初期は部分一致、対象は独自 label・search_keywords・ジャンル名、サーバー側で検索文字列と件数上限を検証、SQL はバインド値、LIKE 特殊文字と D1 のパターン長制限に注意）
  2. Luke の 2026-09-25 #やることリスト投稿:「検索はまずは部分一致で」「画面の下には常にXのようなツールバーを置いておき、動画、検索、プロフィール(設定)にする」

## 実装したもの

### D1 基盤（コミット: feat(d1)）
- `wrangler.jsonc` に D1 バインディング `DB`（database_name: `knowledge-stream`）を追加。`database_id` はローカル開発用のプレースホルダ（全ゼロ UUID）。
- `migrations/0001_search_schema.sql`: SPEC §7 のデータモデルどおり `videos` / `categories` / `video_categories` を作成。`feedback` は今回の検索範囲外のため作っていません。
- `seeds/0001_local_sample_videos.sql`: ローカル開発専用。`src/videos.ts` の固定サンプル3本を、管理者登録と同じ形（独自 label・search_keywords・ジャンル付き）で投入します。動画 id は `src/videos.ts` の UUID を再利用し、フィードと検索結果が同じ動画を指すようにしています。4本目は `enabled = 0` の検証用フィクスチャ（検索に出ないことの確認用、外部IDはダミー）。

### 検索 API（コミット: feat(search-api)）
- `GET /api/v1/search?q=...&limit=...`（Worker、`worker/search/handler.ts`）。
- 対象は `enabled = 1` の登録動画のみ。部分一致の対象は `label`、`search_keywords`、ジャンル名（`categories.name`、有効なジャンルのみ）。
- サーバー側検証（`worker/search/validation.ts`、純粋関数）:
  - `q`: 必須。前後の空白を除去し、空は 400。最大100文字（超過は400）。根拠: 検索対象は管理者が入力する短いラベル・キーワード・ジャンル名なので100文字で十分に余裕があり、生成される LIKE パターン（前後に `%` を付けても102文字程度）が D1 の LIKE パターン長制限に十分収まります。
  - `limit`: デフォルト20、上限50。欠落・数値でない場合はデフォルト、範囲外はクランプ（無制限な結果返却を防ぐため）。
- SQL は `worker/repositories/VideoRepository.ts` に集中。全てバインド値で、`%` `_` `\` は `ESCAPE '\'` 前提でエスケープ済みのパターンを渡します（ユーザー入力がワイルドカードとして効くことはありません）。
- レスポンスは `shared/api.ts` の共有 DTO（`SearchResponse` / `SearchVideoDto`）のみ。D1 の行はそのまま返しません。結果には動画を開くための内部 id・platform・external_video_id・label・ジャンル名を含みます。
- D1 バインディングが無い環境では 500 の JSON エラーを返し、SPA へフォールスルーしません。

### フロントエンド（コミット: feat(search-ui)）
- 下部3タブ「動画」「検索」「プロフィール（設定）」はベース既存のものをそのまま使い、「検索」を活性化しました（SPEC §2.2 / Luke のメモ）。
- `src/SearchView.tsx`: 検索タブに検索窓と結果リスト。検索はサーバー API に問い合わせます（端末側でフィードを絞る方式ではありません）。
- 結果をタップすると動画タブへ切り替え、`external_video_id` でフィード内の該当動画へスクロールします（`VideoFeed` の `focusExternalVideoId` / `focusNonce` props）。フィードに無い動画の場合はタブだけ切り替わります（下記「未確認・未解決」参照）。
- プロフィールタブはプレースホルダのみ（SPEC §2.5 の機能は未実装）。
- ジャンル絞り込み UI は作っていません（§2.4 で対象外）。

### テスト（コミット: test(search)）
- 検証ロジックと LIKE エスケープの純粋関数テスト: `tests/search-validation.test.ts`
- 検索ハンドラのテスト（DB スタブでバインド使用・enabled 絞り込み・ジャンル名一致・limit クランプ・不正入力の 400 を確認）: `tests/search-handler.test.ts`
- SearchView のテスト（結果表示・空状態・タップで動画を開く）: `tests/search-view.test.tsx`

## 検証結果（2026-11-03、ローカル）

- `pnpm typecheck`: 成功
- `pnpm build`: 成功
- `pnpm test`: **70件全通過**（既存52件＋新規18件）
- ローカル動作確認: `wrangler d1 migrations apply --local` と seed 適用後、ビルド成果物（`pnpm preview`、workerd）で `/api/v1/search` を実打し、全項目想定どおりでした。
  - ラベル部分一致（q=ピザ → 「ピザで円周率を考える」1件、ジャンル「数学」付き）
  - キーワード一致（q=キログラム → search_keywords 経由で1件）
  - ジャンル名一致（q=物理 → 1件）
  - `q=%` / `q=_`: ワイルドカードとして効かず0件（リテラル扱い）
  - 無効動画の除外（q=無効 → enabled=0 のフィクスチャは0件）
  - q 欠落 → 400、101文字 → 400
  - `limit=999` → 50 にクランプ、`limit=1` → 1件のみ
  - POST → 405

## 導入手順

```sh
git checkout feature/search-spec
pnpm install --frozen-lockfile
# ローカル D1 へ migration と seed を適用
pnpm exec wrangler d1 migrations apply knowledge-stream --local
pnpm exec wrangler d1 execute knowledge-stream --local --file=seeds/0001_local_sample_videos.sql
pnpm dev        # または pnpm build && pnpm preview
# 確認: curl 'http://localhost:4173/api/v1/search?q=ピザ'（preview の場合）
```

実環境（staging / production）に使う場合は、環境ごとに D1 を作成し、`wrangler.jsonc` の `database_id` をその環境の id に差し替えてください（SPEC §8: ローカルから本番 DB を直接操作しない）。seed はローカル専用です。本番へのデプロイはこのブランチでは行っていません。

## 未確認・未解決事項

- **実機での見た目・操作感は未確認**です。検索タブの表示、結果タップから動画タブで開くまでの動きは iPhone Safari 実機で確認してください。プレーヤー自体は Phase 1.5 で実機確認済みの無変更コードで、今回の変更はフィードへのスクロール指示の追加のみです。
- **フィードはまだ固定3本（`src/videos.ts`）**です。検索対象は D1 全体なので、フィード API（§7 の `GET /api/v1/feed`）が実装されるまでは、検索でヒットしてもフィードに無い動画は開けません。seed はフィードと同じ3本なので、ローカル確認の範囲では一致します。
- `availability_status` が `unavailable` の動画の扱い: §2.4 の「有効な動画」を最小解釈し、検索条件は `enabled = 1` のみとしました。可用性まで絞るかは未決定です。
- LIKE の大文字小文字: SQLite の LIKE は ASCII のみ大小無視です。日本語ラベル中心のため実用上の問題は想定していませんが、仕様としての明記はありません。
- 検索結果の並び順は `created_at` 昇順（登録順）です。関連度順などの指定は SPEC に無く、決めていません。
- 管理画面・管理 API（§6）、フィード API、評価（§5）は本ブランチの範囲外で未実装のままです。
