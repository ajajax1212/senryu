import type { Card, DeckId } from './types';
import standard from '../../data/decks/standard.json';
import meme from '../../data/decks/meme.json';
import spicy from '../../data/decks/spicy.json';

type DeckFile = {
  deck: string;
  label: string;
  rating: 'all' | 'r18';
  note: string;
  cards: { id: string; mora: number; text: string; reading: string; idiom?: boolean; tags: string[] }[];
};

const FILES = [standard, meme, spicy] as unknown as DeckFile[];

export type DeckInfo = {
  id: DeckId;
  label: string;
  rating: 'all' | 'r18';
  count5: number;
  count7: number;
};

export const DECKS: DeckInfo[] = FILES.map((f) => ({
  id: f.deck as DeckId,
  label: f.label,
  rating: f.rating,
  count5: f.cards.filter((c) => c.mora === 5).length,
  count7: f.cards.filter((c) => c.mora === 7).length,
}));

/** デッキ単位の札。deck フィールドは JSON 側では各札に持たせず、読み込み時に付与する */
const ALL: Card[] = FILES.flatMap((f) =>
  f.cards.map((c) => ({ ...c, deck: f.deck as DeckId, mora: c.mora as 5 | 7 })),
);

export function cardsFor(decks: DeckId[]): { deck5: Card[]; deck7: Card[] } {
  const enabled = new Set<DeckId>(decks);
  enabled.add('standard'); // 標準デッキは常に山札の骨格として入れる
  const pool = ALL.filter((c) => enabled.has(c.deck));
  return {
    deck5: pool.filter((c) => c.mora === 5),
    deck7: pool.filter((c) => c.mora === 7),
  };
}

/**
 * mulberry32。シード付きにしてあるのはテストで配札を再現するため。
 * 実プレイでは Date.now() を渡す。
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates。引数は破壊せず新しい配列を返す */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const HAND_5 = 4;
export const HAND_7 = 2;
