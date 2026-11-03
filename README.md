# Knowledge Stream

技術・科学・ものづくり系の短尺動画を、選んだジャンルに応じて縦型フィードで発見・視聴するモバイル優先Webプロトタイプ。

**完成目標: 2026-10-20**

## 現在の状態

2026-11-01更新: Phase 1/1.5のShorts 3本による検証を継続しています。PCでも重くなるとの報告を受け、最大3個のiframeを再利用し、現在±1の範囲外の動画は停止・読み込み中止する方式へ変更しました。スマホはヘッダーと通常の状態欄を画面から省き、動画をほぼ画面全高へ拡大。独自の音声オン/オフボタンは削除しました。

利用者の希望により、開始・切り替え・明示的な再生要求では毎回音声オンを要求します。ブラウザーが拒否した場合の手動再生は残します。標準UIで再生中にミュートしても、次の再生要求では音声オンへ戻ります。

型チェック・build・52テスト成功。PCの12回往復後も生成数は3個のまま、戻った動画の再生を確認。**再生成の削減は確認済みですが、PC/iPhoneで報告された長時間の重さの完全解消、iPhoneの最新表示、初回からの音声付き自動再生は保証・確認していません。** [変更と検証記録](docs/PHASE1_5_SHORTS.md)を参照してください。

固定の3動画を公式YouTube IFrame Player APIで表示します。プロフィールはプレースホルダのみ。管理画面、評価・フィードAPI、履歴保存、ジャンル選択は実装していません。本番デプロイ・Cloudflareアカウント操作・秘密情報の登録は実施していません。

### 検索機能（SPEC §2.4準拠）を追加 — feature/search-spec（2026-11-03）

`feature/search-spec`ブランチで、検索をSPEC §2.4のとおりサーバー側で実装しました。根拠はSPEC §2.4と、Lukeの2026-09-25の#やることリスト投稿（「検索はまずは部分一致で」、下部ツールバーに動画・検索・プロフィール）のみです。D1（`migrations/`のGit管理マイグレーション＋ローカル用seed）、`GET /api/v1/search`（有効な登録動画のみを対象に、独自label・search_keywords・ジャンル名へ部分一致。サーバー側で検証し、SQLはバインド値＋LIKEエスケープ）、検索タブの有効化と結果タップで動画タブを開く接続までを含みます。型チェック・build・70テスト成功、ローカルD1＋workerdでの実打確認済み。実機での見た目は未確認です。詳細と導入手順は[引き継ぎ文書](docs/SEARCH_SPEC_HANDOFF.md)を参照してください。

なお `feature/search-skeleton` は、実在しなかった「2026-11-02の決定」を前提に作った破棄案です（端末側フィルタ方式）。取り込まないでください。

## ローカル起動

### 連続利用で重くなる症状の比較（2026-10-24）

通常URLは最大3個のiframeを再利用し、現在±1本だけをロード対象にします。`/?preload=off` を付けたURLでは、比較検証用に現在の1本だけを保持します。PCでは上部に「先読みオフ」と表示され（スマホではヘッダー非表示）、URLから指定を外すと通常動作へ戻ります。端末へ設定は保存しません。両方の検証タブを同時に残さず、同じ操作・同程度の時間で比較してください。先読みオフでは移動後にロードするため、再生待ちが増える場合があります。

利用者から「最初は軽いが、やがてサイト全体が重い。YouTube側はそれほど重くない」との追加報告あり。原因とこの比較モードのiPhone上での効果は未確認です。PCでは通常/比較それぞれ20回移動してiframe数が2〜3個/1個に収まることを確認。型チェック・build・47テスト成功。詳細は[検証記録](docs/PHASE1_5_SHORTS.md)を参照してください。

### コマンド

Node.js 22.12以上（検証: 24.19.0）、pnpm 11.25.0を利用します。`pnpm-lock.yaml`をコミットしています。

```sh
pnpm install --frozen-lockfile
pnpm dev
# http://localhost:5173
pnpm typecheck
pnpm test
pnpm build
pnpm preview
# http://localhost:4173
pnpm preview:lan
# 同じWi-FiのiPhoneから http://<PCのWi-Fi IPv4>:4174
```

Cloudflareへのログイン・APIキーなしで起動できます（検索機能の確認には下記のローカルD1へのmigration/seed適用が必要です）。`pnpm dev` / `pnpm preview` はローカルworkerdを使用します。`pnpm-workspace.yaml`は公式ツールチェーンのesbuild/workerdのインストールスクリプトだけ許可しています。デプロイ用スクリプトは追加していません。

書き込み制限のある環境では、Wranglerのログを作業フォルダ内へ向けてください（PowerShell）:

```powershell
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler/logs'
$env:WRANGLER_SEND_METRICS = 'false'
pnpm dev
```

### 検索機能のローカル確認（D1）

`feature/search-spec`では検索がローカルD1を参照します。初回だけ、マイグレーションとサンプルデータ（`src/videos.ts`の3本＋無効化済み検証用1本）をローカルDBへ適用してください。

```sh
pnpm exec wrangler d1 migrations apply knowledge-stream --local
pnpm exec wrangler d1 execute knowledge-stream --local --file=seeds/0001_local_sample_videos.sql
pnpm build && pnpm preview
curl 'http://localhost:4173/api/v1/search?q=ピザ'
```

seedはローカル開発専用です。実環境では環境ごとにD1を作成し、`wrangler.jsonc`の`database_id`を差し替えます。詳細は[引き継ぎ文書](docs/SEARCH_SPEC_HANDOFF.md)を参照してください。

## Phase 1の構成と操作

- [Cloudflare公式React + Vite構成](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)に準じ、`src/`がReact SPA、`worker/index.ts`が単一API Worker。`@cloudflare/vite-plugin`、`wrangler.jsonc`のStatic Assets SPA fallback、`/api/*`のWorker優先ルーティングを使用。
- `GET /api/v1/health`と、検索ブランチでは`GET /api/v1/search`（D1＋共有DTOは`shared/api.ts`）を実装。その他のAPIはJSON 404。管理APIの認証は未実装で、管理処理自体が存在しません。
- `compatibility_date`は同梱workerdで起動確認した`2026-10-01`に固定。作業日の`2026-10-15`はこのworkerdの対応上限を超えたため採用していません。
- CSS `scroll-snap`が位置合わせを担当。TypeScriptはカードの表示面積65%以上かつプレーヤー表示面積50%以上でactiveを決定。切替途中で条件を満たさないと全停止します。
- `PlaybackCoordinator`は旧プレーヤーの停止→新プレーヤーの音声付き自動再生要求の順を管理。遅れて届くready/再生イベントでも対象を再確認し、非activeの再生を停止。非表示タブでも停止します。
- 最後にactiveになった動画の±1件だけをマウント（最大3 iframe）。ウィンドウ外は`destroy()`。再訪時は再生成するため、遠い動画の再生位置は保持しません。
- iframe外の「前へ／次へ」は常設。動画外の余白をスクロールすることもできます。先頭・末尾の操作は非活性で、ループや次動画への自動送りはありません。
- 自動再生は保証しません。拒否されたらYouTube標準の再生ボタンを押してください。初期設定は音声オン。標準の音声操作が見えない場合は動画下の「音声オン／音声オフ」を使えます。外側の選択はページ内の動画切り替え・復帰にも適用し、再読み込みで初期設定へ戻ります。APIロード/readyの15秒タイムアウト、再試行、埋め込み不可等のエラー案内をプレーヤー外に表示します。
- 独自オーバーレイ・透明タッチ領域・プレーヤーのクロップはありません。3タブと前後操作はGridの別行、safe-areaを確保。200×200px以上を維持するため、高さ620px未満ではページ全体にもスクロールを許可します。
- 視聴済みの永続化はPhase 2対象。このスパイクはLocalStorageへ書き込みません。

## テスト動画と差し替え

`src/videos.ts`の`videoSources`に3本を集約しています。`source`へShorts URLまたは11文字の動画IDを指定すると、`youtubeUrl.ts`がプレーヤー用IDへ変換します。ラベルは独自説明であり、YouTube公式タイトルではありません。正式コンテンツ選定ではなく、縦型の技術検証用です。

| URL | 用途 | 2026-10-15の確認 |
| --- | --- | --- |
| https://www.youtube.com/shorts/pgGrQjYcm5A | Explaining Pi With Pizza / Veritasium | Shorts公開ページ・PC内蔵ブラウザの埋め込み実再生を確認 |
| https://www.youtube.com/shorts/uDeQB9OkoXY | World's Roundest Object / Veritasium | Shorts公開ページ・PC内蔵ブラウザの埋め込み実再生を確認 |
| https://www.youtube.com/shorts/Ko02mUWhItA | Raindrops aren't shaped like raindrops / Veritasium | Shorts公開ページ・PC内蔵ブラウザの埋め込み実再生を確認 |

地域・端末・年齢・配信者の設定変更で再生可否は変化します。スマホでの再生・音声操作は利用者確認済みですが、各動画の個別結果や全条件の確認は未完了です。URLからIDを抽出できることは、実在・Shorts・埋め込み可の証明にはなりません。上記はローカルアプリ内の実再生で確認しました。

再生できなくなった場合:

1. 所有者が埋め込みを許可した公開動画をYouTubeの「共有→埋め込む」で確認する。
2. `src/videos.ts`の`source`をShorts URLまたは11文字IDへ変更し、独自`label`と`category`を更新。`watch?v=`・`youtu.be/`・`embed/`のURLも抽出可能です。内部`id`はYouTube IDと別のUUID v4とし、別動画への差し替えなら新規UUIDを割り当てる。今回の検証データは3本です。変換後の`externalVideoId`を別ファイルで二重管理しないでください。
3. ローカルアプリで実際に再生し、前後操作、YouTube標準UI、iPhone Safariでも確認。公開ページやサムネイルが取得できただけでは埋め込み可と判断しない。
4. エラー100は削除/非公開等、101/150は埋め込み不可、153はReferer等の再生元識別を確認。自動再生拒否は動画無効と扱わない。`file://`で開かずHTTP(S)を使用する。

公式参考: [IFrame API](https://developers.google.com/youtube/iframe_api_reference)、[埋め込み要件](https://developers.google.com/youtube/terms/required-minimum-functionality)。`controls=1`、`playsinline=1`、実際の`origin`を設定し、Refererを抑制しない設定にしています。

## Phase 1.5の検証結果（2026-10-15）

- `pnpm typecheck`: 成功（React / Worker / Vite設定）。
- `pnpm build`: 成功。`dist/client`と`dist/worker`を生成。ログの権限エラーは上記の作業フォルダ設定で解消。
- `pnpm test`: 4ファイル、39テスト成功。既存の13件（閾値/ロード範囲、停止順序、遅延ready、非active再生、非表示タブ、StrictModeの生成破棄、ブロック案内、再試行/タイムアウト、API応答）に、URL/ID抽出・不正URL拒否・固定データの24件、音声操作の対象制限・設定引き継ぎの2件を追加。YouTubeをモックしたテストは実機再生の保証ではありません。
- ローカルworkerd起動・ビルド済みpreview: 成功。SPA 200、health 200、未実装のadmin/feedback APIはJSON 404（HTMLを要求してもSPAへ落ちない）、healthへのPOSTは405。
- PC内蔵ブラウザ: Shorts 3本の実再生、次への切り替え時の旧動画一時停止表示、iframe数2→3→2、最後の次ボタン非活性を確認。
- 390×844でプレーヤー約243×432px（9:16）、320×568で200×208px、844×390で200×206pxを確認。外側の操作・タブとは非重複。小さい高さでは最低200×200pxを優先し、縦動画は公式プレーヤー内に余白を伴って表示されます。ページ全体をスクロールして下部操作へ到達する設計です。
- 制限付き実行環境での初回Vitestは子プロセス起動がタイムアウト。通常のローカル実行権限で再実行し13件成功。テストを省略して成功扱いにはしていません。

## 旧Phase 1の手動・実機チェック記録

**下記の確認済み項目は旧横動画版の記録です。Shorts版は[新しい実機チェック](docs/PHASE1_5_SHORTS.md#iphone-safariで確認する項目)で再確認してください。** PCのモバイル幅表示は実機確認の代替になりません。PCで`pnpm build`→`pnpm preview:lan`を実行し、同じWi-FiのiPhoneからPCのIP:4174を開きます。[接続・停止・トラブル対処と実機記録シート](docs/IPHONE_SAFARI_QA.md)を参照してください。外部公開やファイアウォール設定の自動変更は行いません。

- [x] 今回のiPhone Safariで、動画内・動画外の上下スワイプの両方で動画が切り替わり、目立った差がないことを利用者が確認（2026-10-15）。端末差に備えiframe外の前/次操作も維持。
- [ ] 初回アクセス・低電力モード等で自動再生拒否時も標準再生ボタンが機能し、ミュート解除・一時停止・シークができること。
- [ ] 高速な往復移動、部分スクロール、別タブ/ホームへ移動・復帰、画面ロック/解除で複数の音声が同時に出ないこと。
- [x] iPhone 18 Pro / iOS 27.0.1（利用者申告）で、横向きでもボタンの重なりは見られなかったとの報告を記録（2026-10-15）。
- [ ] SafariのURLバー開閉、ホームインジケータ、拡大文字、広告表示時などでも標準UIを覆わず、前後操作と3タブへ到達できること。
- [ ] 全画面表示と復帰時の再生・active判定を確認。iframe内のフルスクリーン状態はこのスパイクでは独自制御しない。
- [ ] 実際の通信切断/復帰、コンテンツブロッカー、削除/埋め込み禁止動画で再試行と前/次が機能すること。

**PCブラウザでも追加確認が必要**: Chrome/Edge/Firefoxの実ブラウザでキーボードTab・スクロール、手動停止が勝手に再開しないこと、バックグラウンド復帰、広告表示時の非干渉、オフライン復帰、200%ズーム。現在確認したのはPCのCodex内蔵ブラウザです。

次の手順はDraft PRのレビューと上記実機チェック。Phase 2以降は別依頼として着手します。

## 開発ドキュメント
- [検索機能（SPEC §2.4準拠）引き継ぎ — feature/search-spec](docs/SEARCH_SPEC_HANDOFF.md)
- [Phase 1.5 Shortsのコード変更・検証記録](docs/PHASE1_5_SHORTS.md)
- [iPhone Safari・同じWi-Fiでの検証手順](docs/IPHONE_SAFARI_QA.md)
- [Phase 1 コードガイド・共有／復元手順](docs/PHASE1_CODE_GUIDE.md)
- [プロトタイプ仕様書 v0.2](docs/SPEC.md)
- [10/20までの実装計画](docs/PLAN.md)
- [Codexへの初回指示](docs/CODEX_START.md)
- [エージェント開発ルール](AGENTS.md)

## 実装タスク
- [#1 基盤とYouTube縦フィード技術検証](../../issues/1)
- [#2 ジャンル/3タブ/ローカル状態](../../issues/2)
- [#3 D1/API/検索](../../issues/3)
- [#4 管理画面/管理API認証](../../issues/4)
- [#5 匿名評価/再生エラー](../../issues/5)
- [#6 QA/バックアップ/完成判定](../../issues/6)

## 採用技術
React + TypeScript + Vite、Cloudflare Workers + Static Assets、YouTube IFrame Player API。Cloudflare D1は検索ブランチ（feature/search-spec）から検索用に使用。YouTube動画本体は取得・保存・再配信しない。

## 主要原則
- ユーザー側にログイン不要、管理画面だけCloudflare Accessで保護
- 下部「動画 / 検索 / プロフィール（設定）」タブ
- 動画に入った時点で視聴済み
- 検索対象は管理者選定の登録済み動画のみ（部分一致）
- 公式YouTubeプレーヤーのUIを独自UIで覆わない
- 最初にiPhone Safariでプレーヤーとスクロールの相性を検証する
