import type { GameState, Haiku } from './types';
import { shuffledSubmissions } from './reducer';

/**
 * 1人分の画面に配るための状態。GameState と同じ形をしているので、
 * 1台を回す版で使っている画面コンポーネントをそのまま流用できる。
 */
export type PlayerView = GameState & {
  /** この view を見ている人 */
  me: string;
  /** 審査・結果で並べる句。審査中は authorId を伏せてある */
  board: Haiku[];
  /** 山札の残り枚数。札そのものは配らない */
  deckCounts: { five: number; seven: number };
};

const HIDDEN = '';

/**
 * サーバーが持っている完全な状態から、その人に見せてよいものだけを取り出す。
 *
 * 通信を覗かれても破綻しないことを基準にしている。手札を空配列にするだけでなく、
 * 山札の中身と乱数シードも落とす。シードを渡すと次に何を引くかを計算できてしまうため。
 */
export function viewFor(s: GameState, me: string): PlayerView {
  const isJudging = s.phase === 'judge';
  const settled = s.phase === 'roundResult' || s.phase === 'gameover';

  // 審査中は表示順だけ配り、誰の句かは配らない。親は位置（index）で選ぶ
  const board = isJudging
    ? shuffledSubmissions(s).map((h) => ({ ...h, authorId: HIDDEN }))
    : settled
      ? s.lastResult?.submissions ?? []
      : [];

  return {
    ...s,
    me,
    board,
    deckCounts: { five: s.deck5.length, seven: s.deck7.length },
    deck5: [],
    deck7: [],
    seed: 0,
    players: s.players.map((p) => (p.id === me ? p : { ...p, hand: [] })),
    // 自分がまだ詠んでいないうちに他人の句が見えると先に読まれてしまう。
    // 全員出し終わって審査・採点に入るまでは伏せる
    submissions: s.phase === 'turn' ? [] : isJudging ? [] : s.submissions,
    // 採点中は他人が何点入れたか見えてはいけない。自分の点だけ残す
    ratings: settled
      ? s.ratings
      : me in s.ratings
        ? { [me]: s.ratings[me] }
        : {},
    lastResult: settled ? s.lastResult : null,
  };
}

/** 誰がまだ行動していないかは全員に見せてよい（何を出したかは見せない） */
export function pendingNames(s: GameState): string[] {
  return s.turnQueue.map((id) => s.players.find((p) => p.id === id)?.name ?? '?');
}
