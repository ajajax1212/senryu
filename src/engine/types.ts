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
   * 1台を回して遊ぶか。true なら手番の前に引き継ぎ画面を挟み、turnQueue を先頭から
   * 1人ずつ処理する。false（オンライン）なら各自が自分の画面を見るので引き継ぎは不要で、
   * キューに入っている全員が同時に行動できる。
   */
  passAndPlay: boolean;
};

/** 秒。交換〜作句で5分、審査・採点で2分 */
export const DEFAULT_TIME_LIMITS = { turn: 300, judge: 120 };

export type Phase =
  /** タイトル〜プレイヤー登録 */
  | 'setup'
  /** 「○○さんに端末を渡してください」。1台を回すときだけ手番の前に挟む */
  | 'handoff'
  /**
   * 交換と作句。オンラインでは各自が自分のペースで交換したり並べ替えたりするので、
   * 「交換フェーズ」と「作句フェーズ」を全体で区切ることができない。どこまで進んだかは
   * exchangesUsed と submissions に持たせ、フェーズとしてはひとまとめに扱う。
   */
  | 'turn'
  /** 親が全句から1句選ぶ（独断と偏見） */
  | 'judge'
  /** 提出句に点を付ける（コンテスト） */
  | 'rate'
  /** ラウンド結果の発表 */
  | 'roundResult'
  /** 総合結果 */
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
};

/**
 * プレイヤーの行動には必ず playerId を付ける。オンラインでは複数人が同時に動くので
 * 「いま手番の人」を状態から一意に決められないため。
 */
export type Action =
  | { type: 'START_GAME'; mode: Mode; settings: GameSettings; names: string[]; seed?: number }
  /** 引き継ぎ画面で「準備できた」を押した（1台を回すときだけ） */
  | { type: 'TAKE_SEAT' }
  /** 手札を交換する。captured は捨て場から拾う札。残りは山札から引く */
  | { type: 'EXCHANGE'; playerId: string; discardIds: string[]; capturedIds: string[] }
  | { type: 'SUBMIT'; playerId: string; upperId: string; middleId: string; lowerId: string }
  /**
   * 独断と偏見: 親が句を選ぶ。作者IDではなく表示順の位置で指定する。
   * こうしておけばオンラインで配信する句から作者IDを落とせるので、
   * 通信を覗いても誰の句かは分からない。
   */
  | { type: 'JUDGE'; playerId: string; index: number }
  /** コンテスト: 採点する */
  | { type: 'RATE'; playerId: string; score: number }
  /**
   * 制限時間切れ。止まらないよう現在のフェーズを自動で解決する。
   * playerId を指定すればその人だけ、省略すればまだ行動していない全員を処理する。
   * partial は作句中に選びかけていた札。埋まっていない位置だけ手札から補う。
   */
  | {
      type: 'TIMEOUT';
      playerId?: string;
      partial?: { upperId?: string; middleId?: string; lowerId?: string };
    }
  | { type: 'NEXT_ROUND' };
