// 札データの取り扱いルールの検証。ここが壊れると札が黙って化けるので押さえておく
import { describe, expect, it } from 'vitest';
import { countMora, slotFor, validateAll } from './validate-cards.mjs';

describe('モーラ数の数え方', () => {
  it('拗音は直前のかなと合わせて1と数える', () => {
    expect(countMora('ざんぎょうび')).toBe(5); // 残業日: 6文字だが5モーラ
    expect(countMora('ばきゅーむふぇら')).toBe(6);
  });

  it('促音・撥音・長音はそれぞれ1と数える', () => {
    expect(countMora('ぼっちめし')).toBe(5);
    expect(countMora('ぱすわーど')).toBe(5);
  });
});

describe('字余りの振り分け', () => {
  it('6音は5音の枠、8音は7音の枠に収める', () => {
    expect(slotFor(5)).toBe(5);
    expect(slotFor(6)).toBe(5);
    expect(slotFor(7)).toBe(7);
    expect(slotFor(8)).toBe(7);
  });

  it('2モーラ以上ずれるものは枠に入れない', () => {
    for (const n of [0, 1, 4, 9, 10]) expect(slotFor(n)).toBeNull();
  });
});

describe('同梱している札データ', () => {
  it('検証を通る', () => {
    expect(validateAll().errors).toEqual([]);
  });
});
