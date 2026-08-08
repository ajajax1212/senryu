import type { Action, Card, GameState, Haiku, Phase, Player } from './types';
import { HAND_5, HAND_7, cardsFor, makeRng, shuffle } from './cards';

/**
 * 1台を回して遊ぶときに、いま端末を持っているべきプレイヤー。
 * オンラインではキュー全員が同時に動くのでこの概念は使わない。
 */
export function seatedPlayerId(s: GameState): string | null {
  return s.turnQueue[0] ?? null;
}

export function seatedPlayer(s: GameState): Player | null {
  const id = seatedPlayerId(s);
  return id ? (s.players.find((p) => p.id === id) ?? null) : null;
}

export function playerById(s: GameState, id: string): Player | null {
  return s.players.find((p) => p.id === id) ?? null;
}

/** 親（独断と偏見）または提出者（コンテスト） */
export function activePlayer(s: GameState): Player {
  return s.players[s.activeIndex];
}

export function totalRounds(s: GameState): number {
  return s.players.length;
}

export function remainingExchanges(s: GameState, playerId: string): number {
  return s.settings.exchangeLimit - (s.exchangesUsed[playerId] ?? 0);
}

/** その人がこのフェーズでまだ行動できるか */
export function canAct(s: GameState, playerId: string): boolean {
  if (s.phase === 'judge') return playerId === activePlayer(s).id;
  if (!s.turnQueue.includes(playerId)) return false;
  // 1台を回すときは先頭の人しか動けない
  return s.settings.passAndPlay ? s.turnQueue[0] === playerId : true;
}

/**
 * 山札から n 枚引く。山札が尽きたら捨て場の同じ音数の札を混ぜ直して補充する。
 * deck / discard を破壊せず、新しい配列を返す。
 */
function drawFrom(
  deck: Card[],
  discard: GameState['discard'],
  mora: 5 | 7,
  n: number,
  rng: () => number,
): { drawn: Card[]; deck: Card[]; discard: GameState['discard'] } {
  let pile = deck.slice();
  let disc = discard.slice();
  const drawn: Card[] = [];

  for (let i = 0; i < n; i++) {
    if (pile.length === 0) {
      const recycled = disc.filter((d) => d.card.mora === mora);
      if (recycled.length === 0) break; // 札が尽きた。手札が欠けた状態で続行する
      disc = disc.filter((d) => d.card.mora !== mora);
      pile = shuffle(
        recycled.map((d) => d.card),
        rng,
      );
    }
    drawn.push(pile.shift()!);
  }
  return { drawn, deck: pile, discard: disc };
}

/**
 * 次のフェーズへ移る。1台を回すときは間に引き継ぎ画面を挟み、
 * オンラインでは直接そのフェーズに入る。
 */
function goto(s: GameState, phase: Phase, turnQueue: string[]): GameState {
  if (!s.settings.passAndPlay) return { ...s, phase, pendingPhase: null, turnQueue };
  return { ...s, phase: 'handoff', pendingPhase: phase, turnQueue };
}

function beginRound(s: GameState, round: number): GameState {
  const n = s.players.length;
  const activeIndex = round % n;
  // 独断と偏見は親以外の全員が詠む。親の次の席から時計回り
  const queue =
    s.mode === 'contest'
      ? [s.players[activeIndex].id]
      : Array.from({ length: n - 1 }, (_, i) => s.players[(activeIndex + 1 + i) % n].id);

  return goto(
    {
      ...s,
      round,
      activeIndex,
      submissions: [],
      ratings: {},
      exchangesUsed: {},
      lastResult: null,
    },
    'turn',
    queue,
  );
}

function scoreRound(s: GameState): GameState {
  const submitter = s.players[s.activeIndex];
  const scores = Object.values(s.ratings);
  const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    ...s,
    phase: 'roundResult',
    pendingPhase: null,
    turnQueue: [],
    players: s.players.map((p) =>
      p.id === submitter.id
        ? { ...p, score: p.score + average, scoreHistory: [...p.scoreHistory, average] }
        : { ...p, scoreHistory: [...p.scoreHistory, 0] },
    ),
    lastResult: {
      round: s.round,
      mode: s.mode,
      submissions: s.submissions,
      ratings: s.ratings,
      average,
    },
  };
}

/** 提出を確定する。手動提出と時間切れの自動提出で共有する */
function submit(s: GameState, me: Player, upper?: Card, middle?: Card, lower?: Card): GameState {
  if (!upper || !middle || !lower) return s;
  if (upper.mora !== 5 || middle.mora !== 7 || lower.mora !== 5) return s;
  if (upper.id === lower.id) return s;

  const haiku: Haiku = { authorId: me.id, upper, middle, lower };
  const usedIds = [upper.id, middle.id, lower.id];
  const queue = s.turnQueue.filter((id) => id !== me.id);
  const next: GameState = {
    ...s,
    submissions: [...s.submissions, haiku],
    turnQueue: queue,
    players: s.players.map((p) =>
      p.id === me.id ? { ...p, hand: p.hand.filter((c) => !usedIds.includes(c.id)) } : p,
    ),
  };

  if (queue.length > 0) {
    // まだ詠んでいない人がいる。1台なら次の人へ引き継ぐ
    return goto(next, 'turn', queue);
  }
  if (s.mode === 'dokudan') return goto(next, 'judge', [activePlayer(next).id]);

  // コンテスト: 提出者以外の全員が採点する
  const raters = next.players.filter((_, i) => i !== next.activeIndex).map((p) => p.id);
  return goto(next, 'rate', raters);
}

/** 時間切れ用。選びかけの札はそのまま活かし、空いている位置だけ手札から埋める */
function autoFill(
  hand: Card[],
  partial?: { upperId?: string; middleId?: string; lowerId?: string },
): { upper?: Card; middle?: Card; lower?: Card } {
  const five = hand.filter((c) => c.mora === 5);
  const seven = hand.filter((c) => c.mora === 7);
  const pick = (id: string | undefined, from: Card[]) => from.find((c) => c.id === id);

  let upper = pick(partial?.upperId, five);
  let lower = pick(partial?.lowerId, five);
  const middle = pick(partial?.middleId, seven) ?? seven[0];

  const taken = new Set([upper?.id, lower?.id].filter(Boolean) as string[]);
  if (!upper) {
    upper = five.find((c) => !taken.has(c.id));
    if (upper) taken.add(upper.id);
  }
  if (!lower) lower = five.find((c) => !taken.has(c.id));

  return { upper, middle, lower };
}

function applyRate(s: GameState, playerId: string, score: number): GameState {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const rated: GameState = {
    ...s,
    ratings: { ...s.ratings, [playerId]: clamped },
    turnQueue: s.turnQueue.filter((id) => id !== playerId),
  };
  if (rated.turnQueue.length === 0) return scoreRound(rated);
  return goto(rated, 'rate', rated.turnQueue);
}

function applyJudge(s: GameState, index: number): GameState {
  const chosen = shuffledSubmissions(s)[index];
  if (!chosen) return s;
  return {
    ...s,
    phase: 'roundResult',
    pendingPhase: null,
    turnQueue: [],
    players: s.players.map((p) =>
      p.id === chosen.authorId
        ? { ...p, score: p.score + 1, scoreHistory: [...p.scoreHistory, 1] }
        : { ...p, scoreHistory: [...p.scoreHistory, 0] },
    ),
    lastResult: {
      round: s.round,
      mode: s.mode,
      submissions: s.submissions,
      winnerId: chosen.authorId,
    },
  };
}

/** 山札を切り直して全員に配る。開始時と再戦で共有する */
function deal(decks: GameState['settings']['decks'], seed: number, names: string[]) {
  const rng = makeRng(seed);
  const { deck5, deck7 } = cardsFor(decks);
  let pile5 = shuffle(deck5, rng);
  let pile7 = shuffle(deck7, rng);
  const hands = names.map(() => {
    const hand = [...pile5.slice(0, HAND_5), ...pile7.slice(0, HAND_7)];
    pile5 = pile5.slice(HAND_5);
    pile7 = pile7.slice(HAND_7);
    return hand;
  });
  return { hands, deck5: pile5, deck7: pile7 };
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const seed = action.seed ?? Date.now();
      const { hands, deck5: pile5, deck7: pile7 } = deal(action.settings.decks, seed, action.names);
      const players: Player[] = action.names.map((name, i) => ({
        id: `p${i}`,
        name,
        hand: hands[i],
        score: 0,
        scoreHistory: [],
      }));

      const base: GameState = {
        mode: action.mode,
        settings: action.settings,
        players,
        deck5: pile5,
        deck7: pile7,
        discard: [],
        round: 0,
        activeIndex: 0,
        turnQueue: [],
        phase: 'setup',
        pendingPhase: null,
        exchangesUsed: {},
        submissions: [],
        ratings: {},
        lastResult: null,
        seed,
      };
      return beginRound(base, 0);
    }

    case 'TAKE_SEAT': {
      if (state.phase !== 'handoff' || !state.pendingPhase) return state;
      return { ...state, phase: state.pendingPhase, pendingPhase: null };
    }

    case 'EXCHANGE': {
      const me = playerById(state, action.playerId);
      if (!me || state.phase !== 'turn' || !canAct(state, me.id)) return state;
      if (remainingExchanges(state, me.id) <= 0) return state;
      if (action.discardIds.length === 0) return state;

      const out = me.hand.filter((c) => action.discardIds.includes(c.id));
      const kept = me.hand.filter((c) => !action.discardIds.includes(c.id));
      if (out.length !== action.discardIds.length) return state;

      // 捨て場から拾う札は、捨てた札と音数の内訳が一致していなければならない。
      // ここが崩れると手札が 5音4枚+7音2枚 の構成から外れる。
      const captured = state.discard
        .filter((d) => action.capturedIds.includes(d.card.id))
        .map((d) => d.card);
      const need = (m: 5 | 7) => out.filter((c) => c.mora === m).length;
      const got = (m: 5 | 7) => captured.filter((c) => c.mora === m).length;
      if (got(5) > need(5) || got(7) > need(7)) return state;

      const rng = makeRng(state.seed + state.round * 100 + (state.exchangesUsed[me.id] ?? 0));
      let discard = state.discard.filter((d) => !action.capturedIds.includes(d.card.id));
      discard = [...discard, ...out.map((card) => ({ card, discardedBy: me.id }))];

      const d5 = drawFrom(state.deck5, discard, 5, need(5) - got(5), rng);
      const d7 = drawFrom(state.deck7, d5.discard, 7, need(7) - got(7), rng);

      return {
        ...state,
        players: state.players.map((p) =>
          p.id === me.id ? { ...p, hand: [...kept, ...captured, ...d5.drawn, ...d7.drawn] } : p,
        ),
        deck5: d5.deck,
        deck7: d7.deck,
        discard: d7.discard,
        exchangesUsed: { ...state.exchangesUsed, [me.id]: (state.exchangesUsed[me.id] ?? 0) + 1 },
      };
    }

    case 'SUBMIT': {
      const me = playerById(state, action.playerId);
      if (!me || state.phase !== 'turn' || !canAct(state, me.id)) return state;
      const find = (id: string) => me.hand.find((c) => c.id === id);
      return submit(state, me, find(action.upperId), find(action.middleId), find(action.lowerId));
    }

    case 'JUDGE': {
      if (state.phase !== 'judge' || action.playerId !== activePlayer(state).id) return state;
      return applyJudge(state, action.index);
    }

    case 'RATE': {
      if (state.phase !== 'rate' || !canAct(state, action.playerId)) return state;
      return applyRate(state, action.playerId, action.score);
    }

    case 'TIMEOUT': {
      // 誰かが席を外しても進行が止まらないよう、その場で妥当な既定値に倒す
      switch (state.phase) {
        case 'turn': {
          const targets = action.playerId ? [action.playerId] : [...state.turnQueue];
          return targets.reduce((acc, id) => {
            const me = playerById(acc, id);
            if (!me || !acc.turnQueue.includes(id)) return acc;
            const { upper, middle, lower } = autoFill(me.hand, action.partial);
            return submit(acc, me, upper, middle, lower);
          }, state);
        }
        case 'judge':
          return applyJudge(state, 0);
        case 'rate': {
          const targets = action.playerId ? [action.playerId] : [...state.turnQueue];
          return targets.reduce(
            (acc, id) => (acc.phase === 'rate' ? applyRate(acc, id, 50) : acc),
            state,
          );
        }
        default:
          // 引き継ぎ画面と結果画面には時間制限を付けない
          return state;
      }
    }

    case 'RESTART': {
      // 顔ぶれはそのまま。得点と手札だけ捨てて配り直す
      if (state.phase !== 'gameover') return state;
      const seed = action.seed ?? Date.now();
      const names = state.players.map((p) => p.name);
      const { hands, deck5, deck7 } = deal(state.settings.decks, seed, names);
      return beginRound(
        {
          ...state,
          seed,
          deck5,
          deck7,
          discard: [],
          lastResult: null,
          players: state.players.map((p, i) => ({
            ...p,
            hand: hands[i],
            score: 0,
            scoreHistory: [],
          })),
        },
        0,
      );
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'roundResult') return state;
      const next = state.round + 1;
      if (next >= totalRounds(state)) {
        return { ...state, phase: 'gameover', pendingPhase: null, turnQueue: [] };
      }

      // 句に使った分だけ引き直す。使わなかった札は手元に残る
      const rng = makeRng(state.seed + next * 977);
      let deck5 = state.deck5;
      let deck7 = state.deck7;
      let discard = state.discard;

      const players = state.players.map((p) => {
        const have5 = p.hand.filter((c) => c.mora === 5).length;
        const have7 = p.hand.filter((c) => c.mora === 7).length;
        const d5 = drawFrom(deck5, discard, 5, HAND_5 - have5, rng);
        const d7 = drawFrom(deck7, d5.discard, 7, HAND_7 - have7, rng);
        deck5 = d5.deck;
        deck7 = d7.deck;
        discard = d7.discard;
        return { ...p, hand: [...p.hand, ...d5.drawn, ...d7.drawn] };
      });

      return beginRound({ ...state, players, deck5, deck7, discard }, next);
    }

    default:
      return state;
  }
}

/** 審査画面に出す並び。提出順から作者が割れないようラウンドごとに固定の順で混ぜる */
export function shuffledSubmissions(s: GameState): Haiku[] {
  return shuffle(s.submissions, makeRng(s.seed + s.round * 31));
}

export function ranking(s: GameState): Player[] {
  return s.players.slice().sort((a, b) => b.score - a.score);
}
