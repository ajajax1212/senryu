export type DeckId = 'standard' | 'meme' | 'spicy';
export type Mode = 'dokudan' | 'contest';

export type Card = {
  id: string;
  deck: DeckId;
  mora: 5 | 7;
  text: string;
  reading: string;
  /** 「知らんけど」など、述語の形だが一語の決まり文句として下句にも置ける札 */
  idiom?: boolean;
  tags: string[];
};

export type Player = {
  id: string;
  name: string;
  hand: Card[];
  /** 独断と偏見=勝った回数 / コンテスト=各ラウンドの平均点の合計 */
  score: number;
  /** ラウンドごとの獲得点。総合結果で内訳を見せる */
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
  /** 1ラウンドあたりの交換回数 */
  exchangeLimit: number;
  /** 独断と偏見モードで提出句を匿名表示するか */
  anonymousSubmission: boolean;
  /** コンテストモードで誰が何点付けたかを公開するか */
  revealRaters: boolean;
  /** 秒。null で無制限。turn は交換〜作句、judge は審査・採点をまとめて計る */
  timeLimits: { turn: number | null; judge: number | null };
  /**
   * 1台を回して遊ぶか。
   */
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
  | 'roundResult'
  | 'gameover';

export type RoundResult = {
  round: number;
  mode: Mode;
  submissions: Haiku[];
  /** 独断と偏見: 親が選んだ句の作者 */
  winnerId?: string;
  /** コンテスト: raterId -> 点数 */
  ratings?: Record<string, number>;
  /** コンテスト: 平均点 */
  average?: number;
};

export type GameState = {
  mode: Mode;
  settings: GameSettings;
  players: Player[];
  deck5: Card[];
  deck7: Card[];
  discard: DiscardedCard[];
  /** 0始まり。players.length ラウンドで終了 */
  round: number;
  /** 親（独断と偏見）または提出者（コンテスト）の players 上の位置 */
  activeIndex: number;
  /** このフェーズでまだ行動していないプレイヤー。先頭が現在の手番 */
  turnQueue: string[];
  phase: Phase;
  /** phase==='handoff' のとき、端末を渡した先で始まるフェーズ */
  pendingPhase: Phase | null;
  /** 山札のシャッフルと提出句の並べ替えに使う。テストで配札を再現するため保持する */
  seed: number;
  /** playerId -> このラウンドで交換した回数 */
  exchangesUsed: Record<string, number>;
  submissions: Haiku[];
  /** コンテスト用 raterId -> 0..100 */
  ratings: Record<string, number>;
  lastResult: RoundResult | null;
  /** 各ラウンドの結果履歴。総合結果で名句ギャラリーを構築するために保持する */
  history: RoundResult[];
};

export type Action =
  | { type: 'START_GAME'; mode: Mode; settings: GameSettings; names: string[]; seed?: number }
  | { type: 'TAKE_SEAT' }
  | { type: 'EXCHANGE'; playerId: string; discardIds: string[]; capturedIds: string[] }
  | { type: 'SUBMIT'; playerId: string; upperId: string; middleId: string; lowerId: string }
  | { type: 'JUDGE'; playerId: string; index: number }
  | { type: 'RATE'; playerId: string; score: number }
  | {
      type: 'TIMEOUT';
      playerId?: string;
      partial?: { upperId?: string; middleId?: string; lowerId?: string };
    }
  | { type: 'NEXT_ROUND' };
