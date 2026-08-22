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
  // 民主主義の投票中も、誰の句かは伏せたまま並べる
  const isJudging = s.phase === 'judge' || s.phase === 'vote';
  const settled = s.phase === 'roundResult' || s.phase === 'gameover';

  // 審査中は表示順だけ配り、誰の句かは配らない。親は位置（index）で選ぶ。
  // ただし自分の句だけは伏せない。自分が書いた句なのだから隠す意味がなく、
  // 民主主義モードで「自分には入れられない」を画面側で示すのに要る
  const board = isJudging
    ? shuffledSubmissions(s).map((h) => ({ ...h, authorId: h.authorId === me ? me : HIDDEN }))
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
    // 自由札に書いた言葉も手札と同じ扱い。提出するまで他人に見えてはいけない。
    // 使ったかどうか（usedTurn）だけは残す。誰がもう切ったかは公開情報でよい
    players: s.players.map((p) =>
      p.id === me
        ? p
        : { ...p, hand: [], free: { text: '', mora: null, usedTurn: p.free.usedTurn } },
    ),
    // 自分がまだ詠んでいないうちに他人の句が見えると先に読まれてしまう。
    // ただし自分が出した句だけは、提出後の待機画面で見せる必要がある
    submissions:
      s.phase === 'turn'
        ? s.submissions.filter((h) => h.authorId === me)
        : isJudging
          ? []
          : s.submissions,
    // 予想も採点と同じ。締まる前に他人の予想が見えると答え合わせの意味がなくなる
    predictions: settled
      ? s.predictions
      : me in s.predictions
        ? { [me]: s.predictions[me] }
        : {},
    // 投票も同じ。締まる前に他人の票が見えると、多数派に寄せる遊びになる
    votes: settled ? s.votes : me in s.votes ? { [me]: s.votes[me] } : {},
    // 採点中は他人が何点入れたか見えてはいけない。自分の点だけ残す
    ratings: settled
      ? s.ratings
      : me in s.ratings
        ? { [me]: s.ratings[me] }
        : {},
    lastResult: settled ? s.lastResult : null,
  };
}

/**
 * 山札の残り枚数。
 *
 * オンラインでは viewFor が deck5 / deck7 を空にして枚数だけ deckCounts に移すので、
 * 画面が deck5.length を数えると常に0になる。どちらの形でも正しく数えられるよう
 * ここを通す。
 */
export function remainingCards(s: GameState | PlayerView): number {
  const counts = (s as PlayerView).deckCounts;
  if (counts) return counts.five + counts.seven;
  return s.deck5.length + s.deck7.length;
}

/** 誰がまだ行動していないかは全員に見せてよい（何を出したかは見せない） */
export function pendingNames(s: GameState): string[] {
  return s.turnQueue.map((id) => s.players.find((p) => p.id === id)?.name ?? '?');
}
