/**
 * 作句中の「どの札をどの枠に置いているか」。
 *
 * React も Socket.IO も知らない純粋な計算にしてある。画面の中に埋めていたときに
 * 一度壊したので、テストで固定できるところまで出した。
 *
 * **必ず「いま枠に入っている札」から作り直す。** 前の draft の id をそのまま
 * 引き継ぐと、もう手札に無い札や、書き直して音数の変わった自由札の id が
 * 残ったままになる。枠は空に見えるのに id は埋まっているので、
 * 「空いている枠に入れる」判定がすり抜けて**その枠が二度と埋まらなくなる**。
 * 実際に、自由札を下の句に置いたまま七音へ書き直すと詰んだ。
 */

import type { Card } from '../engine/types';

export type Draft = { upperId?: string; middleId?: string; lowerId?: string };

/** いま実際に枠に入っている札。音数の合わない札は入っていない扱いにしてある */
export type Slots = { upper: Card | null; middle: Card | null; lower: Card | null };

/** 枠の中身をそのまま draft に写す。ここが「作り直す」の実体 */
export function draftOf(s: Slots): Draft {
  return { upperId: s.upper?.id, middleId: s.middle?.id, lowerId: s.lower?.id };
}

/**
 * 札をタップしたときの置き場所。
 *
 * 5音札は上句 → 下句の順に埋め、両方埋まっていたら上句を置き換える。
 * 7音札は中句だけ。すでに置いてある札をもう一度タップしたら外す。
 */
export function placeCard(s: Slots, card: Card): Draft {
  const base = draftOf(s);
  if (base.upperId === card.id) return { ...base, upperId: undefined };
  if (base.middleId === card.id) return { ...base, middleId: undefined };
  if (base.lowerId === card.id) return { ...base, lowerId: undefined };

  if (card.mora === 7) return { ...base, middleId: card.id };
  if (!base.upperId) return { ...base, upperId: card.id };
  if (!base.lowerId) return { ...base, lowerId: card.id };
  return { ...base, upperId: card.id };
}

/** 上句と下句を入れ替える。同じ手札でも並べ替えで意味が変わるのがこのゲームの肝 */
export function swapOuter(s: Slots): Draft {
  const base = draftOf(s);
  return { ...base, upperId: base.lowerId, lowerId: base.upperId };
}

/** 枠から外す */
export function clearSlot(s: Slots, which: keyof Slots): Draft {
  const base = draftOf(s);
  const key = ({ upper: 'upperId', middle: 'middleId', lower: 'lowerId' } as const)[which];
  return { ...base, [key]: undefined };
}
