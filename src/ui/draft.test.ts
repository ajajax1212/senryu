import { describe, it, expect } from 'vitest';
import type { Card } from '../engine/types';
import { clearSlot, draftOf, placeCard, swapOuter, type Slots } from './draft';

const card = (id: string, mora: 5 | 7, free = false): Card =>
  ({ id, text: id, reading: id, mora, deck: 'standard', ...(free ? { free: true } : {}) }) as Card;

const A = card('a', 5);
const B = card('b', 5);
const C = card('c', 5);
const S = card('s', 7);
const FREE = card('free-p0', 5, true);

const empty: Slots = { upper: null, middle: null, lower: null };

describe('札の置き場所', () => {
  it('5音は上句から埋まり、次は下句に入る', () => {
    const one = placeCard(empty, A);
    expect(one).toEqual({ upperId: 'a', middleId: undefined, lowerId: undefined });
    const two = placeCard({ ...empty, upper: A }, B);
    expect(two.upperId).toBe('a');
    expect(two.lowerId).toBe('b');
  });

  it('7音は中句にしか入らない', () => {
    expect(placeCard(empty, S).middleId).toBe('s');
    expect(placeCard(empty, S).upperId).toBeUndefined();
  });

  it('上下が埋まっていたら上句を置き換える', () => {
    const next = placeCard({ upper: A, middle: null, lower: B }, C);
    expect(next.upperId).toBe('c');
    expect(next.lowerId).toBe('b');
  });

  it('置いてある札をもう一度タップすると外れる', () => {
    expect(placeCard({ upper: A, middle: S, lower: B }, B).lowerId).toBeUndefined();
    expect(placeCard({ upper: A, middle: S, lower: B }, S).middleId).toBeUndefined();
  });

  it('上句と下句は入れ替えられる（並べ替えで意味が変わるゲームなので）', () => {
    expect(swapOuter({ upper: A, middle: S, lower: B })).toEqual({
      upperId: 'b', middleId: 's', lowerId: 'a',
    });
  });

  it('枠から外せる', () => {
    expect(clearSlot({ upper: A, middle: S, lower: B }, 'upper').upperId).toBeUndefined();
    expect(clearSlot({ upper: A, middle: S, lower: B }, 'upper').lowerId).toBe('b');
  });

  /**
   * 一度これで詰んだ。
   *
   * 自由札を下の句に置いたまま「筆」で七音に書き直すと、枠の側は音数が合わず
   * 空になるのに、draft には自由札の id が残っていた。「下句が空いていたら入れる」
   * 判定が id を見ていたのですり抜け、5音札をいくら押しても上句を置き換える
   * だけになり、下の句が二度と埋まらず提出できなくなった。
   *
   * 枠の中身から draft を作り直していれば、この形は起きない。
   */
  it('枠から消えた札の id を引きずらない（自由札を書き直しても下句が埋まる）', () => {
    // 自由札を七音に書き直した直後。下句は音数が合わないので空になっている
    const afterRewrite: Slots = { upper: A, middle: null, lower: null };
    const next = placeCard(afterRewrite, B);
    expect(next.lowerId).toBe('b'); // ここが自由札の id のままだと詰む
    expect(next.upperId).toBe('a'); // 上句を巻き込まない
  });

  it('draft は必ず枠の中身と一致する', () => {
    expect(draftOf({ upper: A, middle: null, lower: FREE })).toEqual({
      upperId: 'a', middleId: undefined, lowerId: 'free-p0',
    });
  });
});
