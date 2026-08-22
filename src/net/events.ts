/**
 * Socket.IO のイベント名。サーバーとクライアントの両方がここから読む。
 *
 * 文字列を両側にべた書きすると、片方だけ書き換えたときに何も起きなくなる。
 * 型エラーにもテスト失敗にもならず、ボタンが黙って効かなくなるだけなので
 * 気づくのが遅れる。実際に一度それで通信が全滅した。
 */
export const EV = {
  /** 部屋を作る → { ok, code, playerId, token } */
  create: 'room:create',
  /** 部屋に入る → { ok, code, playerId, token } */
  join: 'room:join',
  /** リロード後に元の席へ戻る → { ok, code, playerId, token } */
  rejoin: 'room:rejoin',
  /** 部屋から抜ける（ロビーにいる間だけ） */
  leave: 'room:leave',
  /** ホストがモード・札・ラウンド数を変える */
  configure: 'host:configure',
  /** ホストが開始する */
  start: 'host:start',
  /** ホストが切れた人を席から外す（ロビーにいる間だけ） */
  kick: 'host:kick',
  /** ホストが総合結果からロビーへ戻す */
  toLobby: 'host:toLobby',
  /** ゲーム中の行動 */
  action: 'game:action',
  /** サーバー → クライアント。1人分に絞った状態 */
  state: 'state',
} as const;

export type EventName = (typeof EV)[keyof typeof EV];

/** ラウンド数の許容範囲。ロビーの選択肢もサーバー側の検証もこれを使う */
export const ROUND_CHOICES = [1, 2, 3, 4, 5] as const;
export const DEFAULT_ROUNDS = 3;

export function clampRounds(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  return (ROUND_CHOICES as readonly number[]).includes(n) ? n : null;
}
