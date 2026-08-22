export type DeckId = 'standard' | 'meme' | 'spicy';
export type Mode = 'dokudan' | 'contest' | 'democracy';

export type Card = {
  id: string;
  deck: DeckId;
  mora: 5 | 7;
  text: string;
  reading: string;
  /** 「知らんけど」など、述語の形だが一語の決まり文句として下句にも置ける札 */
  idiom?: boolean;
  tags: string[];
  /** 自由札（プレイヤーが自分で言葉を書く札）。山札には入らない */
  free?: boolean;
};

/**
 * 自由札。各プレイヤーが1枚だけ持ち、ラウンドに1回使える。
 * 言葉は本人が書き、5音の位置と7音の位置のどちらで使うかも本人が決める。
 * 音数は検証しない。自由に書けることがこの札の意味なので、
 * 5音として出した言葉が実際に何音でも受け入れる。
 */
export type FreeCard = {
  /** 書いた言葉。空なら未記入 */
  text: string;
  /** どちらの位置で使うか。未選択なら null */
  mora: 5 | 7 | null;
  /**
   * 使い切った手番（0始まり）。null ならまだ使える。
   * 「ラウンドに1回」なのか「毎ターン」なのかは settings.freeCardPerTurn 次第なので、
   * ここには手番そのものを持ち、判定は freeCardUsed() に任せる。
   */
  usedTurn: number | null;
};

/** 自由札に書ける長さ。札の枠に収まる範囲に留める */
export const FREE_CARD_MAX = 12;

export type Player = {
  id: string;
  name: string;
  /** 山札から配られた札。自由札はここには入らない */
  hand: Card[];
  free: FreeCard;
  score: number;
  scoreHistory: number[];
};

export type Haiku = {
  authorId: string;
  upper: Card; // 5音
  middle: Card; // 7音
  lower: Card; // 5音
};

export type DiscardedCard = {
  card: Card;
  discardedBy: string;
};

export type GameSettings = {
  /** standard は常に含まれる。spicy は明示的に有効化したときのみ */
  decks: DeckId[];
  /**
   * 対戦ラウンド数（1〜5）。
   * 1ラウンド = 全員が1回ずつ親（提出者）をやること。
   * したがって総手番数は rounds × 人数 になる。
   */
  rounds?: number;
  /**
   * 自由札を毎ターン使えるようにするか。
   * 既定（false）はラウンドに1回だけ。true なら手番ごとに切り直せる。
   */
  freeCardPerTurn?: boolean;
  /** 1ラウンドあたりの交換回数 */
  exchangeLimit: number;
  /** 独断と偏見モードで提出句を匿名表示するか */
  anonymousSubmission: boolean;
  /** コンテストモードで誰が何点付けたかを公開するか */
  revealRaters: boolean;
  /** 秒。null で無制限。turn は交換〜作句、judge は審査・採点をまとめて計る */
  timeLimits: { turn: number | null; judge: number | null };
  /** 1台を回して遊ぶか */
  passAndPlay: boolean;
};

/** 秒。交換〜作句で5分、審査・採点で2分 */
export const DEFAULT_TIME_LIMITS = { turn: 300, judge: 120 };

export const GRADES = [
  { min: 85, label: '金賞' },
  { min: 70, label: '秀作' },
  { min: 50, label: '佳作' },
  { min: 0, label: '駄作' },
] as const;

export function gradeFor(average: number): string {
  return GRADES.find((g) => average >= g.min)!.label;
}

export type Phase =
  | 'setup'
  | 'handoff'
  | 'turn'
  | 'judge'
  | 'rate'
  /** 民主主義: 全員がどの句に入れるか決める */
  | 'vote'
  | 'roundResult'
  | 'gameover';

export type RoundResult = {
  /** 何番目の手番か（0始まり）。1手番 = 1人が親をやる */
  turn: number;
  mode: Mode;
  submissions: Haiku[];
  winnerId?: string;
  /** 独断と偏見: 親が選んだ句の表示位置。予想が当たったかの照合に使う */
  winnerIndex?: number;
  /** 独断と偏見: 予想した人 -> 予想した表示位置 */
  predictions?: Record<string, number>;
  ratings?: Record<string, number>;
  average?: number;
  /** 民主主義: 投票した人 -> 入れた表示位置 */
  votes?: Record<string, number>;
  /** 民主主義: 最多得票の表示位置。同票なら複数 */
  winnerIndexes?: number[];
  /** 民主主義: 最多得票だった人。同票なら複数 */
  winnerIds?: string[];
  /**
   * 民主主義: 誰の句に何票入ったか。表示位置ではなく作者IDで持つ。
   * 表示位置は審査中だけの並びなので、結果画面でそれを引き直させると
   * 並べ替えの再現に依存する。結果は作者が分かっている場面なので素直に持つ
   */
  voteCounts?: Record<string, number>;
};

export type GameState = {
  mode: Mode;
  settings: GameSettings;
  players: Player[];
  deck5: Card[];
  deck7: Card[];
  discard: DiscardedCard[];
  /** 何番目の手番か（0始まり）。ラウンド番号ではない */
  turn: number;
  /**
   * このラウンドの席順（playerId の並び）。ラウンドの頭で引き直す。
   * players 自体は並べ替えない。あれはサーバーの席番号と対応していて、
   * 入れ替えると再接続やキックの土台が崩れる。
   */
  order: string[];
  /** いま親（提出者）の players 上の位置。order から引いて入れる */
  activeIndex: number;
  turnQueue: string[];
  phase: Phase;
  pendingPhase: Phase | null;
  /** 山札のシャッフルと提出句の並べ替えに使う。テストで配札を再現するため保持する */
  seed: number;
  exchangesUsed: Record<string, number>;
  submissions: Haiku[];
  ratings: Record<string, number>;
  /**
   * 独断と偏見の勝ち句予想。playerId -> 表示順の位置。
   * 得点には一切関わらない。親が選ぶまでの待ち時間を能動的にするためだけのもの。
   */
  predictions: Record<string, number>;
  /** 民主主義の投票。playerId -> 表示順の位置 */
  votes: Record<string, number>;
  lastResult: RoundResult | null;
  /** 確定したラウンド結果を古い順に積む。総合結果の振り返りで使う */
  history: RoundResult[];
};

/**
 * プレイヤーの行動には必ず playerId を付ける。オンラインでは複数人が同時に動くので
 * 「いま手番の人」を状態から一意に決められないため。
 */
export type Action =
  | { type: 'START_GAME'; mode: Mode; settings: GameSettings; names: string[]; seed?: number }
  | { type: 'TAKE_SEAT' }
  | { type: 'EXCHANGE'; playerId: string; discardIds: string[]; capturedIds: string[] }
  | { type: 'SUBMIT'; playerId: string; upperId: string; middleId: string; lowerId: string }
  /** 自由札に言葉を書き、どちらの位置で使うかを決める。何度でも書き直せる */
  | { type: 'SET_FREE_CARD'; playerId: string; text: string; mora: 5 | 7 }
  /**
   * 独断と偏見: 親が句を選ぶ。作者IDではなく表示順の位置で指定する。
   * こうしておけばオンラインで配信する句から作者IDを落とせるので、
   * 通信を覗いても誰の句かは分からない。
   */
  | { type: 'JUDGE'; playerId: string; index: number }
  | { type: 'RATE'; playerId: string; score: number }
  /**
   * 独断と偏見: 親がどれを選ぶか予想する。JUDGE と同じく表示順の位置で指定する
   * ので、予想を配っても誰の句かは割れない。何度でも選び直せる。
   */
  | { type: 'PREDICT'; playerId: string; index: number }
  /**
   * 民主主義: 句に投票する。JUDGE / PREDICT と同じく表示順の位置で指定する。
   * 自分の句には入れられない。
   */
  | { type: 'VOTE'; playerId: string; index: number }
  | {
      type: 'TIMEOUT';
      playerId?: string;
      partial?: { upperId?: string; middleId?: string; lowerId?: string };
    }
  /** 次の人の手番へ。1ラウンド分（全員が親を1回）終わっていれば次のラウンドに入る */
  | { type: 'NEXT_TURN' };
