# 五七五（senryu-game）

配られた札を組み合わせて五・七・五の川柳を作り、**人間の主観**で勝敗を決めるパーティーゲーム。
アプリは札の配布・提出・集計だけを担当する。点数を機械的に計算するゲームではない。

遊び方は2通り。**オンライン対戦**（PCブラウザ、各自の端末で手札を見る）と、
**1台を回すパス&プレイ**（手番のたびに手札を隠す仕切りを挟む）。

仕様は `docs/SPEC.md`。ルールの話をするときは必ずこれを先に読む。

## スタック

TypeScript / React 19 / Vite 6 / Express 4 / Socket.IO 4 / Vitest 2。ESM（`"type": "module"`）。

## コマンド

**このディレクトリで実行する。** 親フォルダで叩くと ENOENT になる（`--prefix senryu-game` なら可）。

| コマンド | 内容 |
|---|---|
| `npm.cmd start` | 本番相当。`dist/` を配信するサーバー。http://localhost:3400 |
| `npm.cmd run build` | クライアント（`dist/`）とサーバー（`dist-server/`）の両方 |
| `npm.cmd run dev` | Vite 開発サーバー（5173）。**クライアントのみ＝1台版の確認用** |
| `npm.cmd run dev:server` | サーバーだけ watch 起動 |
| `npm.cmd test` | Vitest 76件（エンジン65 / 通信イベント6 / 札データ5） |
| `npm.cmd run validate` | 札データの検証 |
| `npm.cmd run cards:export` / `cards:import` | 札データの CSV 往復。**import 後は自動で validate が走る** |

**オンライン対戦を確認したいときに `npm run dev` を使わない。** Vite 開発サーバーは
クライアントしか立てないので、部屋が作れない。`npm.cmd run build && npm.cmd start`。

## 構造

```
src/engine/     ゲームのルール。React も Socket.IO も知らない純粋な層
  types.ts      Card / Player / GameState / Phase / Action
  reducer.ts    (state, action) => state。ルールの本体はここだけ
  cards.ts      data/decks/*.json の読み込み、山札の生成、シード付き乱数
  view.ts       viewFor(state, me) — 1人分に絞った状態
src/net/
  events.ts     Socket.IO のイベント名の唯一の定義（EV）+ ラウンド数の検証
  useRoom.ts    クライアント側の接続・再接続・状態受信
src/ui/         画面。Setup / Local / Online / Game / Turn / Results
server/
  index.ts      Socket.IO のハンドラ。reducer と viewFor を呼ぶだけ
  rooms.ts      部屋・席・token・タイマーの管理。ルールは持たない
data/decks/     standard.json / meme.json / spicy.json
```

### 層の境界を守る

- **`src/engine/` にネットワークやReactを持ち込まない。** ここが純粋だから、
  1台版とオンライン版が同じ reducer で動き、テストも speedy に書ける。
- **ルールの変更は `reducer.ts` だけで完結させる。** サーバーに条件分岐を足して
  挙動を変えると、1台版とオンライン版で結果が食い違う。
- **`server/rooms.ts` はゲームのルールを知らない。** 席・token・接続状態・時計だけ。

## このゲーム固有の注意

- **5音札は上の句にも下の句にも使える**（順不同）。7音札は中の句だけ。
  同じ手札でも並べ替えで意味が変わる、そこがこのゲームの中心的な面白さ。
- **自由札は山札の札ではない。** `player.hand` には入らず `player.free` が持つ。
  画面に並べるときは `handOf(s, id)` を通す。音数は検証しない（自由に書けることが
  この札の意味）。`viewFor` は書いた言葉を他人に配らない。
- **1ラウンド = 全員が1回ずつ親（提出者）をやること。** 総手番数は
  ラウンド数 × 人数。ここは一度取り違えて直した経緯があるので、
  「ラウンド」と「手番」を混同しない。
- **`JUDGE` は作者IDではなく表示順の位置（index）で指定する。** そうしておけば
  配信する句から作者IDを落とせて、通信を覗いても誰の句か分からない。
- **`viewFor` は手札だけでなく山札の中身と乱数シードも落とす。** シードを渡すと
  次に何を引くか計算できてしまう。ここに状態を足すときは同じ基準で判断する。
- **時計はサーバーが持つ**（`rooms.ts` の `timer` / `deadline`）。クライアントは
  `deadline` を見て残り時間を描くだけ。
- 札の追加・修正は `data/decks/*.json` を直接触らず、`cards:export` → CSV 編集 →
  `cards:import`。モーラ数の検証を通さない札を混ぜると配札が破綻する。

## やってはいけないこと

- **ルールやバランスを勝手に変えない。** 面白さの判断は本人がする。
  実装上おかしいと思ったら、直す前に指摘する。
- **`spicy` デッキ（r18）を既定で有効にしない。** 明示的に選ばれたときだけ。
- `dist/` `dist-server/` をコミットしない（`.gitignore` 済み）。
- push は明示的に言われたときだけ。リモートは `github.com/ajajax1212/senryu`。
