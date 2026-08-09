import type { Action, Card, GameState, Haiku, Phase, Player, RoundResult } from './types';
import { HAND_5, HAND_7, cardsFor, makeRng, shuffle } from './cards';

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

export function activePlayer(s: GameState): Player {
  return s.players[s.activeIndex];
}

export function totalRounds(s: GameState): number {
  return s.players.length;
}

export function remainingExchanges(s: GameState, playerId: string): number {
  return s.settings.exchangeLimit - (s.exchangesUsed[playerId] ?? 0);
}

export function canAct(s: GameState, playerId: string): boolean {
  if (s.phase === 'judge') return playerId === activePlayer(s).id;
  if (!s.turnQueue.includes(playerId)) return false;
  return s.settings.passAndPlay ? s.turnQueue[0] === playerId : true;
}

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
      if (recycled.length === 0) break;
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

function goto(s: GameState, phase: Phase, turnQueue: string[]): GameState {
  if (!s.settings.passAndPlay) return { ...s, phase, pendingPhase: null, turnQueue };
  return { ...s, phase: 'handoff', pendingPhase: phase, turnQueue };
}

function beginRound(s: GameState, round: number): GameState {
  const n = s.players.length;
  const activeIndex = round % n;
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

  const roundResult: RoundResult = {
    round: s.round,
    mode: s.mode,
    submissions: s.submissions,
    ratings: s.ratings,
    average,
  };

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
    lastResult: roundResult,
    history: [...s.history, roundResult],
  };
}

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
    return goto(next, 'turn', queue);
  }
  if (s.mode === 'dokudan') return goto(next, 'judge', [activePlayer(next).id]);

  const raters = next.players.filter((_, i) => i !== next.activeIndex).map((p) => p.id);
  return goto(next, 'rate', raters);
}

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
  const roundResult: RoundResult = {
    round: s.round,
    mode: s.mode,
    submissions: s.submissions,
    winnerId: chosen.authorId,
  };
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
    lastResult: roundResult,
    history: [...s.history, roundResult],
  };
}

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
        history: [],
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
          return state;
      }
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'roundResult') return state;
      const next = state.round + 1;
      if (next >= totalRounds(state)) {
        return { ...state, phase: 'gameover', pendingPhase: null, turnQueue: [] };
      }

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

export function shuffledSubmissions(s: GameState): Haiku[] {
  return shuffle(s.submissions, makeRng(s.seed + s.round * 31));
}

export function ranking(s: GameState): Player[] {
  return s.players.slice().sort((a, b) => b.score - a.score);
}
