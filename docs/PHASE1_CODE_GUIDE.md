# Phase 1 コードガイド・共有手順

このドキュメントは、Phase 1のコードを初めて読む共同開発者向けの案内です。仕様は[SPEC.md](SPEC.md)、実装範囲と検証結果は[README](../README.md)を参照してください。

## 共有する実装

作業ブランチは`feature/phase-1-player-spike`、レビュー先は[Draft PR #7](https://github.com/Luke0703/knowledge-stream/pull/7)です。mainへのマージはまだ行っていません。

Reactの画面、Cloudflare Worker、設定、依存関係のロックファイル、テスト、仕様書をGitで管理します。`node_modules/`と`dist/`は下記のコマンドで復元できる生成物のため含めません。`.env*`、`.dev.vars*`、`.wrangler/`、ログなどの端末固有データも追跡対象外です。

## 別のPCで復元・起動する

リポジトリへのアクセス権があるGitHubアカウントと、Git、Node.js 22.12以上、pnpm 11.25.0を用意します。

```sh
git clone --branch feature/phase-1-player-spike https://github.com/Luke0703/knowledge-stream.git
cd knowledge-stream
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

ブラウザで`http://localhost:5173`を開きます。Cloudflareへのログインや秘密情報は不要です。ビルド済み成果物は`pnpm preview`で確認できます。既存の作業コピーを更新する場合は、ローカル変更を確認してから対象ブランチ上で`git pull --ff-only`を実行してください。

同じWi-FiのiPhoneへ共有する場合は、ビルド後に`pnpm preview:lan`を実行します。[iPhone Safari検証手順](IPHONE_SAFARI_QA.md)に接続先の調べ方と確認結果を記録しています。`vite.config.ts`の`lan`モードでデバッグ・管理機能を無効化し、ビルド済みアプリをポート4174で提供します。

## ファイルごとの役割

| ファイル | 役割 |
| --- | --- |
| `index.html` | 日本語ページ、viewportとReferer方針、Reactの起動点 |
| `src/main.tsx` | Reactをマウント。StrictModeでライフサイクルの問題も検出 |
| `src/App.tsx` | ヘッダー、Worker疎通表示、動画フィード、3タブの外枠 |
| `src/videos.ts` | Shorts 3本の内部UUID・URL/ID・独自説明ラベルを一元管理 |
| `src/player/youtubeUrl.ts` | Shorts/watch/短縮/embed URLまたは生IDから動画IDを抽出。実在・埋め込み可否は判定しない |
| `src/VideoFeed.tsx` | 可視領域の測定、activeの更新、現在±1件のロード・最大3個のiframe再利用、前後操作 |
| `src/player/visibility.ts` | 可視面積率、active選択、ロード範囲と再利用対象を決める純粋関数 |
| `src/player/PlaybackCoordinator.ts` | 再生対象を一元管理し、他のプレーヤーを停止 |
| `src/player/youtubeApi.ts` | 公式IFrame APIの共有ロード、15秒タイムアウト、失敗後の再試行 |
| `src/player/YouTubePlayer.tsx` | YT.Player生成・イベント処理・エラー表示・破棄 |
| `src/styles.css` | scroll-snap、プレーヤー外の操作領域、safe-area、小画面対応 |
| `shared/api.ts` | ブラウザとWorkerで共有するhealthレスポンスの型 |
| `worker/index.ts` | `GET /api/v1/health`と未実装パスのJSON 404 |
| `vite.config.ts` | ReactとCloudflare公式Viteプラグインの接続 |
| `wrangler.jsonc` | 単一Worker、Static Assets、SPA fallback、API優先ルーティング |
| `tsconfig.*.json` | ブラウザ・Node設定ファイル・Workerの型チェック環境を分離 |
| `vitest.config.ts` / `tests/` | テスト設定、再生制御・プレーヤー・APIの回帰テスト |
| `package.json` / `pnpm-lock.yaml` | 起動・検証コマンド、依存関係の再現 |
| `pnpm-workspace.yaml` | esbuild/workerdのインストールスクリプトを許可 |

## 起動から動画切り替えまで

1. `App`が`/api/v1/health`を呼び、Workerの接続状態を表示します。動画一覧はローカルの固定データを使うため、このAPIの失敗でフィードは停止しません。
2. `VideoFeed`がカードを配置し、先頭と次の動画のプレーヤーをマウントします。APIスクリプトの読み込みPromiseを共有し、複数コンポーネントからの重複ロードを抑えます。
3. スクロール・リサイズ・タブ表示状態の変更などでカードとプレーヤーの可視面積を測定します。カード65%以上、プレーヤー50%以上が表示されているものをactiveにします。該当しなければactiveは`null`です。
4. `PlaybackCoordinator`が非active動画を停止してから、active動画へ音声設定を適用して再生要求します。利用者の希望により毎回unMuteを要求します。独自の音声オン/オフボタンはありません。自動再生の成功自体はブラウザとYouTubeに依存します。
5. フィード内で最も見えるカードをcenterとし、現在±1だけをロード対象にします。範囲外ではstopVideoでメディアを停止・読み込み中止し、iframeは最大3個まで再利用します。再生へ戻す際はloadVideoByIdを1回使います。保持枠から外れたPlayer、再試行、画面unmountではdestroyします。

```mermaid
flowchart TD
  Input[スクロール・リサイズ・表示状態] --> Measure[VideoFeed: 可視面積を測定]
  Measure --> Select[visibility: activeを選択]
  Select --> Control[PlaybackCoordinator: 非active停止 → active再生要求]
  Measure --> Window[center前後1件をロード・iframe最大3個を再利用]
  Window --> Player[YouTubePlayer: 生成・停止・再利用・破棄]
  Player --> Events[ready・state・error・autoplay blocked]
  Events --> Control
  Events --> Status[プレーヤー外の状態案内]
```

`active`は現在の再生対象、`center`はフィード枠内で最も見える動画です。再生に必要な可視率を満たさなくてもロード対象を更新します。前後ボタンはいったん停止して対象カードへ移動し、そのタップの処理内で可視面積を再測定します。条件を満たす準備済みプレーヤーへ同期的に再生要求を出しますが、ブラウザが許可するかは別の問題です。

## 再生制御で注意する点

- readyイベントは動画移動後に届くことがあります。`register()`時点で現在のactiveを確認するため、遅れて準備ができた非active動画は再生しません。
- `onStateChange`でも非activeの再生/バッファリングを検知して停止します。Reactの描画完了だけに再生判断を依存させません。
- 同じactiveの測定が続いても再生要求を繰り返しません。表示が変わらない間、標準UIでの手動停止を維持します。別動画から戻ったときやタブ復帰時は音声オンで自動再生を再度試みます。
- `useLayoutEffect`のcleanupで、ReactがDOMを外す前に停止・破棄します。通常の`useEffect`のcleanupだとYouTube APIが外れたiframeを操作する警告につながります。
- React管理のホスト要素の中に専用の子要素を作り、YouTubeにはその子だけを置き換えさせます。cleanup後の非同期イベントは`cancelled`で無視します。
- 自動再生拒否と動画の削除・埋め込み禁止は別扱いです。拒否時はYouTube標準の再生操作を案内し、エラー時は独立した領域に再試行を表示します。
- iframe内部のスワイプが外側へ届くとは仮定しません。タッチを横取りする透明レイヤーは設けず、前後操作をプレーヤー外に置きます。

## 変更箇所の探し方

| 変更したい内容 | 最初に確認する箇所 |
| --- | --- |
| 動画の差し替え | `src/videos.ts`とREADMEの確認手順 |
| activeになる表示率 | `visibility.ts`と`tests/playback.test.ts` |
| ロードする前後件数 | `inMountWindow()`と再生・メモリ使用の検証 |
| エラー文言や再試行 | `YouTubePlayer.tsx`と`tests/player.test.tsx` |
| 余白・サイズ・ナビの配置 | `styles.css`。標準UI非干渉と最低200×200pxを再確認 |
| Worker疎通 | `worker/index.ts`、`shared/api.ts`、`tests/worker.test.ts` |

Phase 1は最大5件程度の固定データを想定し、カード全件を測定します。大規模フィード向けの最適化、視聴履歴、検索、管理、評価、D1はこの実装に含まれません。

## テストと引き継ぎ

現在の52テストは、表示率・ロード範囲、再生停止順序、遅延イベント、タブ非表示、StrictMode、DOM接続中の破棄、エラー/再試行、Workerレスポンス、URL/ID抽出と固定データ、毎回の音声オン要求、最大3個の再利用・範囲外メディア停止、タップ内の再生要求、長いバッファリングへの案内を確認します。実際のYouTube通信をモックするテストもあるため、端末固有の再生やタッチ挙動は保証しません。

共有後は[Phase 1.5の変更点・実機チェック](PHASE1_5_SHORTS.md)を使ってiPhone Safariを確認してください。実施日・端末・OS・結果を残し、旧横動画版の実機結果と今回のShorts版を混同しないことが引き継ぎ事項です。

## ローカル負荷計測（2026-11-01追加）

通常URLに `?diagnostics=1` を付けると、`src/player/diagnostics.ts` が5秒ごとにブラウザーコンソールへ集計値を出します。生成/破棄/再利用/再生要求/状態イベント/測定の回数、DOM上のiframe数、対応ブラウザーではLong Tasksの件数と時間です。外部送信・保存・動画ID記録はありません。パラメーターなしでは計測タイマーもObserverも起動しません。親ページのLong Tasksはiframe内部のCPU/GPU/メモリ全体を表すものではありません。
