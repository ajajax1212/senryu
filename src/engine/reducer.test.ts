import { describe, expect, it } from 'vitest';
import {
  reducer,
  seatedPlayerId,
  remainingExchanges,
  ranking,
  shuffledSubmissions,
  canAct,
  totalRounds,
  totalTurns,
  handOf,
  phaseProgress,
  predictionHits,
  freeCardOf,
  freeCardId,
  roundNumber,
  seatNumber,
} from './reducer';
import { viewFor } from './view';
import { gradeFor, FREE_CARD_MAX } from './types';
import type { Action, GameSettings, GameState, Mode } from './types';

const SETTINGS: GameSettings = {
  decks: ['standard', 'meme'],
  exchangeLimit: 2,
  anonymousSubmission: true,
  revealRaters: true,
  timeLimits: { turn: 300, judge: 120 },
  passAndPlay: true,
};

function start(mode: Mode, names = ['あ', 'い', 'う'], settings: Partial<GameSettings> = {}) {
  return reducer({} as GameState, {
    type: 'START_GAME',
    mode,
    settings: { ...SETTINGS, ...settings },
    names,
    seed: 42,
  });
}

/** オンライン（引き継ぎ画面なし・同時進行） */
function startOnline(mode: Mode, names = ['あ', 'い', 'う']) {
  return start(mode, names, { passAndPlay: false });
}

function apply(s: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reducer, s);
}

/** 指定した人が手札から適当な5-7-5を提出する */
function submitFor(s: GameState, playerId: string): GameState {
  const me = s.players.find((p) => p.id === playerId)!;
  const five = me.hand.filter((c) => c.mora === 5);
  const seven = me.hand.filter((c) => c.mora === 7);
  return reducer(s, {
    type: 'SUBMIT',
    playerId,
    upperId: five[0].id,
    middleId: seven[0].id,
    lowerId: five[1].id,
  });
}

/** 1台版で、いま座っている人が提出する */
function submitSeated(s: GameState): GameState {
  return submitFor(s, seatedPlayerId(s)!);
}

/**
 * 席順はラウンドごとに抽選されるので、テストは「誰が」ではなく
 * 「いま親の人」「いまキューにいる人」を state から引いて動かす。
 */
function hostId(s: GameState): string {
  return s.players[s.activeIndex].id;
}
function sorted(ids: string[]): string[] {
  return [...ids].sort();
}
/** いま手番のキューに入っている人（席順は抽選なので id を決め打ちしない） */
function queued(s: GameState, i = 0): string {
  return s.turnQueue[i];
}
/** 親（提出者）以外の全員 */
function others(s: GameState): string[] {
  return s.players.filter((p) => p.id !== hostId(s)).map((p) => p.id);
}

describe('配札', () => {
  it('全員が5音4枚と7音2枚を持つ', () => {
    const s = start('dokudan', ['あ', 'い', 'う', 'え']);
    for (const p of s.players) {
      expect(p.hand.filter((c) => c.mora === 5)).toHaveLength(4);
      expect(p.hand.filter((c) => c.mora === 7)).toHaveLength(2);
    }
  });

  it('同じ札が2人に配られない', () => {
    const s = start('dokudan', ['あ', 'い', 'う', 'え', 'お']);
    const ids = s.players.flatMap((p) => p.hand.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spicyを選ばなければr18の札は山札に入らない', () => {
    const s = start('dokudan');
    const all = [...s.deck5, ...s.deck7, ...s.players.flatMap((p) => p.hand)];
    expect(all.some((c) => c.deck === 'spicy')).toBe(false);
  });
});

describe('独断と偏見モード', () => {
  it('親以外の全員が提出したあと親が審査する', () => {
    let s = start('dokudan');
    // 席順は抽選なので、誰が親かは決め打ちできない。親以外の全員が詠むことだけ見る
    expect(sorted(s.turnQueue)).toEqual(sorted(s.players.filter((p) => p.id !== hostId(s)).map((p) => p.id)));

    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    expect(s.phase).toBe('handoff');

    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);

    expect(s.pendingPhase).toBe('judge');
    expect(seatedPlayerId(s)).toBe(hostId(s));

    s = apply(s, { type: 'TAKE_SEAT' });
    expect(s.phase).toBe('judge');
    expect(s.submissions).toHaveLength(2);

    const winner = shuffledSubmissions(s)[1].authorId;
    s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 1 });
    expect(s.phase).toBe('roundResult');
    expect(s.players.find((p) => p.id === winner)!.score).toBe(1);
  });

  it('親以外は審査できない', () => {
    let s = start('dokudan');
    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    s = apply(s, { type: 'TAKE_SEAT' });
    expect(reducer(s, { type: 'JUDGE', playerId: 'p1', index: 0 })).toBe(s);
  });

  it('全員が1周したら終了する', () => {
    let s = start('dokudan');
    const hosts: string[] = [];
    for (let round = 0; round < 3; round++) {
      hosts.push(hostId(s));
      for (let i = 0; i < 2; i++) {
        s = apply(s, { type: 'TAKE_SEAT' });
        s = submitSeated(s);
      }
      s = apply(s, { type: 'TAKE_SEAT' });
      s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
      s = reducer(s, { type: 'NEXT_TURN' });
    }
    expect(s.phase).toBe('gameover');
    // 1ラウンドで全員がちょうど1回ずつ親をやる
    expect(sorted(hosts)).toEqual(['p0', 'p1', 'p2']);
  });
});

describe('コンテストモード', () => {
  it('提出者以外が採点し平均点が入る', () => {
    let s = start('contest', ['あ', 'い', 'う', 'え']);
    const author = hostId(s);
    expect(s.turnQueue).toEqual([author]);
    const raters = others(s);

    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    expect(sorted(s.turnQueue)).toEqual(sorted(raters));

    for (const [i, score] of [90, 60, 30].entries()) {
      s = apply(s, { type: 'TAKE_SEAT' }, { type: 'RATE', playerId: raters[i], score });
    }
    expect(s.phase).toBe('roundResult');
    expect(s.lastResult!.average).toBe(60);
    expect(s.players.find((p) => p.id === author)!.score).toBe(60);
  });

  it('点数は0〜100に丸められる', () => {
    let s = start('contest');
    const [a, b] = others(s);
    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    s = apply(s, { type: 'TAKE_SEAT' }, { type: 'RATE', playerId: a, score: 500 });
    s = apply(s, { type: 'TAKE_SEAT' }, { type: 'RATE', playerId: b, score: -20 });
    expect(s.lastResult!.ratings).toEqual({ [a]: 100, [b]: 0 });
  });

  it('提出者は自分の句を採点できない', () => {
    let s = start('contest');
    const author = hostId(s);
    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    expect(reducer(s, { type: 'RATE', playerId: author, score: 100 })).toBe(s);
  });
});

describe('オンライン（同時進行）', () => {
  it('引き継ぎ画面を挟まずいきなり手番から始まる', () => {
    const s = startOnline('dokudan');
    expect(s.phase).toBe('turn');
    expect(s.pendingPhase).toBeNull();
  });

  it('キューにいる全員が同時に行動できる', () => {
    const s = startOnline('dokudan');
    for (const id of others(s)) expect(canAct(s, id)).toBe(true);
    expect(canAct(s, hostId(s))).toBe(false); // 親は詠まない
  });

  it('提出の順番が入れ替わってもよい', () => {
    let s = startOnline('dokudan');
    const [first, second] = s.turnQueue;
    s = submitFor(s, second); // 後ろの人が先に出す
    expect(s.phase).toBe('turn');
    expect(s.turnQueue).toEqual([first]);

    s = submitFor(s, first);
    expect(s.phase).toBe('judge');
  });

  it('1台版では先頭の人しか動けない', () => {
    const s = start('dokudan');
    expect(canAct(s, queued(s, 0))).toBe(true);
    expect(canAct(s, queued(s, 1))).toBe(false);
    expect(submitFor(s, queued(s, 1))).toBe(s);
  });

  it('二重提出は無視される', () => {
    let s = startOnline('dokudan');
    const one = queued(s, 0);
    s = submitFor(s, one);
    const before = s;
    expect(submitFor(s, one)).toBe(before);
  });

  it('採点も同時にできる', () => {
    let s = startOnline('contest', ['あ', 'い', 'う', 'え']);
    const raters = others(s);
    s = submitFor(s, hostId(s));
    expect(s.phase).toBe('rate');
    s = reducer(s, { type: 'RATE', playerId: raters[2], score: 100 });
    expect(s.phase).toBe('rate');
    s = reducer(s, { type: 'RATE', playerId: raters[0], score: 50 });
    s = reducer(s, { type: 'RATE', playerId: raters[1], score: 0 });
    expect(s.phase).toBe('roundResult');
    expect(s.lastResult!.average).toBe(50);
  });
});

describe('配信する情報の絞り込み', () => {
  it('自分以外の手札は配らない', () => {
    const s = startOnline('dokudan');
    const v = viewFor(s, 'p1');
    expect(v.players.find((p) => p.id === 'p1')!.hand).toHaveLength(6);
    expect(v.players.find((p) => p.id === 'p2')!.hand).toHaveLength(0);
  });

  it('山札とシードは配らない', () => {
    const s = startOnline('dokudan');
    const v = viewFor(s, 'p1');
    expect(v.deck5).toHaveLength(0);
    expect(v.deck7).toHaveLength(0);
    expect(v.seed).toBe(0);
    expect(v.deckCounts.five).toBeGreaterThan(0);
  });

  it('自分が詠み終わるまで他人の句は見えない', () => {
    let s = startOnline('dokudan');
    s = submitFor(s, 'p2');
    expect(viewFor(s, 'p1').submissions).toHaveLength(0);
  });

  it('審査中の句には作者が入っていない', () => {
    let s = startOnline('dokudan');
    const host = hostId(s);
    for (const id of others(s)) s = submitFor(s, id);
    expect(s.phase).toBe('judge');

    // 親は詠んでいないので、親から見た board には自分の句が1つも無い＝全部伏せ字
    const v = viewFor(s, host);
    expect(v.board).toHaveLength(2);
    expect(v.board.every((h) => h.authorId === '')).toBe(true);
    expect(v.submissions).toHaveLength(0);
  });

  it('採点中は他人の点数が見えない', () => {
    let s = startOnline('contest', ['あ', 'い', 'う', 'え']);
    const [a, b] = others(s);
    s = submitFor(s, hostId(s));
    s = reducer(s, { type: 'RATE', playerId: a, score: 90 });

    expect(viewFor(s, b).ratings).toEqual({});
    expect(viewFor(s, a).ratings).toEqual({ [a]: 90 });
  });

  it('結果が出たら全員の点数が見える', () => {
    let s = startOnline('contest');
    const [a, b] = others(s);
    s = submitFor(s, hostId(s));
    s = reducer(s, { type: 'RATE', playerId: a, score: 90 });
    s = reducer(s, { type: 'RATE', playerId: b, score: 70 });
    expect(viewFor(s, b).ratings).toEqual({ [a]: 90, [b]: 70 });
    expect(viewFor(s, b).lastResult!.average).toBe(80);
  });
});

describe('交換', () => {
  it('交換しても手札の構成は5音4枚+7音2枚のまま', () => {
    let s = start('dokudan');
    s = apply(s, { type: 'TAKE_SEAT' });
    const who = seatedPlayerId(s)!;
    const me = s.players.find((p) => p.id === who)!;
    const toss = [
      me.hand.filter((c) => c.mora === 5)[0].id,
      me.hand.filter((c) => c.mora === 7)[0].id,
    ];

    s = reducer(s, { type: 'EXCHANGE', playerId: who, discardIds: toss, capturedIds: [] });
    const after = s.players.find((p) => p.id === who)!;
    expect(after.hand.filter((c) => c.mora === 5)).toHaveLength(4);
    expect(after.hand.filter((c) => c.mora === 7)).toHaveLength(2);
    expect(after.hand.map((c) => c.id)).not.toContain(toss[0]);
  });

  it('捨てた札は捨て場に公開され、誰が捨てたか残る', () => {
    let s = start('dokudan');
    s = apply(s, { type: 'TAKE_SEAT' });
    const who = seatedPlayerId(s)!;
    const tossed = s.players.find((p) => p.id === who)!.hand.filter((c) => c.mora === 5)[0];

    s = reducer(s, { type: 'EXCHANGE', playerId: who, discardIds: [tossed.id], capturedIds: [] });
    expect(s.discard.find((d) => d.card.id === tossed.id)!.discardedBy).toBe(who);
  });

  it('捨て場の札を拾える', () => {
    let s = startOnline('dokudan');
    // 親は詠まないので交換もしない。キューにいる2人でやりとりする
    const [a, b] = s.turnQueue;
    const tossed = s.players.find((p) => p.id === a)!.hand.filter((c) => c.mora === 5)[0];
    s = reducer(s, { type: 'EXCHANGE', playerId: a, discardIds: [tossed.id], capturedIds: [] });

    const give = s.players.find((p) => p.id === b)!.hand.filter((c) => c.mora === 5)[0];
    s = reducer(s, {
      type: 'EXCHANGE',
      playerId: b,
      discardIds: [give.id],
      capturedIds: [tossed.id],
    });

    expect(s.players.find((p) => p.id === b)!.hand.map((c) => c.id)).toContain(tossed.id);
    expect(s.discard.map((d) => d.card.id)).not.toContain(tossed.id);
  });

  it('捨てた枚数より多く拾おうとすると拒否される', () => {
    let s = startOnline('dokudan');
    const two = s.players.find((p) => p.id === 'p1')!.hand.filter((c) => c.mora === 5).slice(0, 2);
    s = reducer(s, {
      type: 'EXCHANGE',
      playerId: 'p1',
      discardIds: two.map((c) => c.id),
      capturedIds: [],
    });

    const one = s.players.find((p) => p.id === 'p2')!.hand.filter((c) => c.mora === 5)[0];
    const before = s;
    expect(
      reducer(s, {
        type: 'EXCHANGE',
        playerId: 'p2',
        discardIds: [one.id],
        capturedIds: two.map((c) => c.id),
      }),
    ).toBe(before);
  });

  it('自分の手札にない札は捨てられない', () => {
    const s = startOnline('dokudan');
    const othersCard = s.players.find((p) => p.id === 'p2')!.hand[0];
    expect(
      reducer(s, { type: 'EXCHANGE', playerId: 'p1', discardIds: [othersCard.id], capturedIds: [] }),
    ).toBe(s);
  });

  it('交換は1ラウンド2回まで', () => {
    let s = startOnline('dokudan');
    const toss = () => [s.players.find((p) => p.id === 'p1')!.hand.filter((c) => c.mora === 5)[0].id];

    expect(remainingExchanges(s, 'p1')).toBe(2);
    s = reducer(s, { type: 'EXCHANGE', playerId: 'p1', discardIds: toss(), capturedIds: [] });
    s = reducer(s, { type: 'EXCHANGE', playerId: 'p1', discardIds: toss(), capturedIds: [] });
    expect(remainingExchanges(s, 'p1')).toBe(0);

    const before = s;
    expect(reducer(s, { type: 'EXCHANGE', playerId: 'p1', discardIds: toss(), capturedIds: [] })).toBe(
      before,
    );
  });

  it('交換回数はラウンドごとにリセットされる', () => {
    let s = startOnline('contest');
    const author = hostId(s);
    const raters = others(s);
    const hand = s.players.find((p) => p.id === author)!.hand;
    s = reducer(s, {
      type: 'EXCHANGE',
      playerId: author,
      discardIds: [hand.filter((c) => c.mora === 5)[0].id],
      capturedIds: [],
    });
    expect(remainingExchanges(s, author)).toBe(1);

    s = submitFor(s, author);
    for (const id of raters) s = reducer(s, { type: 'RATE', playerId: id, score: 50 });
    s = reducer(s, { type: 'NEXT_TURN' });
    expect(remainingExchanges(s, author)).toBe(2);
  });
});

describe('ラウンド間の補充', () => {
  it('句に使った3枚だけが補充され、残りは手元に残る', () => {
    let s = startOnline('contest');
    const author = hostId(s);
    const raters = others(s);
    const hand = s.players.find((p) => p.id === author)!.hand;
    const before = hand.map((c) => c.id);
    const five = hand.filter((c) => c.mora === 5);
    const seven = hand.filter((c) => c.mora === 7);
    const used = [five[0].id, seven[0].id, five[1].id];

    s = submitFor(s, author);
    for (const id of raters) s = reducer(s, { type: 'RATE', playerId: id, score: 50 });
    s = reducer(s, { type: 'NEXT_TURN' });

    const after = s.players.find((p) => p.id === author)!.hand;
    expect(after.filter((c) => c.mora === 5)).toHaveLength(4);
    expect(after.filter((c) => c.mora === 7)).toHaveLength(2);
    for (const id of before.filter((id) => !used.includes(id))) {
      expect(after.map((c) => c.id)).toContain(id);
    }
    for (const id of used) expect(after.map((c) => c.id)).not.toContain(id);
  });
});

describe('不正な提出', () => {
  it('上句と下句に同じ札は使えない', () => {
    const s = startOnline('dokudan');
    const me = s.players.find((p) => p.id === 'p1')!;
    const five = me.hand.filter((c) => c.mora === 5);
    const seven = me.hand.filter((c) => c.mora === 7);
    expect(
      reducer(s, {
        type: 'SUBMIT',
        playerId: 'p1',
        upperId: five[0].id,
        middleId: seven[0].id,
        lowerId: five[0].id,
      }),
    ).toBe(s);
  });

  it('中の句に5音札は置けない', () => {
    const s = startOnline('dokudan');
    const five = s.players.find((p) => p.id === 'p1')!.hand.filter((c) => c.mora === 5);
    expect(
      reducer(s, {
        type: 'SUBMIT',
        playerId: 'p1',
        upperId: five[0].id,
        middleId: five[2].id,
        lowerId: five[1].id,
      }),
    ).toBe(s);
  });

  it('他人の手札の札では提出できない', () => {
    const s = startOnline('dokudan');
    const mine = s.players.find((p) => p.id === 'p1')!.hand;
    const theirs = s.players.find((p) => p.id === 'p2')!.hand.filter((c) => c.mora === 5)[0];
    expect(
      reducer(s, {
        type: 'SUBMIT',
        playerId: 'p1',
        upperId: theirs.id,
        middleId: mine.filter((c) => c.mora === 7)[0].id,
        lowerId: mine.filter((c) => c.mora === 5)[0].id,
      }),
    ).toBe(s);
  });
});

describe('時間切れ', () => {
  it('手番中に切れたら手札から自動で提出される', () => {
    let s = start('dokudan');
    s = apply(s, { type: 'TAKE_SEAT' });
    s = reducer(s, { type: 'TIMEOUT', playerId: 'p1' });
    expect(s.submissions).toHaveLength(1);
    const h = s.submissions[0];
    expect(h.authorId).toBe('p1');
    expect([h.upper.mora, h.middle.mora, h.lower.mora]).toEqual([5, 7, 5]);
    expect(h.upper.id).not.toBe(h.lower.id);
  });

  it('選びかけの札は活かして残りだけ埋める', () => {
    let s = start('dokudan');
    s = apply(s, { type: 'TAKE_SEAT' });
    const wanted = s.players.find((p) => p.id === 'p1')!.hand.filter((c) => c.mora === 5)[3];

    s = reducer(s, { type: 'TIMEOUT', playerId: 'p1', partial: { lowerId: wanted.id } });
    expect(s.submissions[0].lower.id).toBe(wanted.id);
    expect(s.submissions[0].upper.id).not.toBe(wanted.id);
  });

  it('オンラインでは未提出の全員がまとめて処理される', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'TIMEOUT' });
    expect(s.submissions).toHaveLength(2);
    expect(s.phase).toBe('judge');
  });

  it('審査中に切れたら表示順の先頭が選ばれる', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'TIMEOUT' });
    const shown = shuffledSubmissions(s)[0];
    s = reducer(s, { type: 'TIMEOUT' });
    expect(s.phase).toBe('roundResult');
    expect(s.lastResult!.winnerId).toBe(shown.authorId);
  });

  it('採点中に切れたら未入力の人に50点が入る', () => {
    let s = startOnline('contest');
    const [a, b] = others(s);
    s = submitFor(s, hostId(s));
    s = reducer(s, { type: 'RATE', playerId: a, score: 80 });
    s = reducer(s, { type: 'TIMEOUT' });
    expect(s.lastResult!.ratings).toEqual({ [a]: 80, [b]: 50 });
    expect(s.lastResult!.average).toBe(65);
  });

  it('引き継ぎ画面と結果画面では何も起きない', () => {
    const s = start('dokudan');
    expect(s.phase).toBe('handoff');
    expect(reducer(s, { type: 'TIMEOUT' })).toBe(s);
  });
});

describe('最後まで遊ぶ', () => {
  /** 独断と偏見で最後まで進めて gameover にする */
  function playThrough(): GameState {
    let s = startOnline('dokudan');
    for (let round = 0; round < 3; round++) {
      s = reducer(s, { type: 'TIMEOUT' });          // 全員自動提出
      s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
      s = reducer(s, { type: 'NEXT_TURN' });
    }
    return s;
  }

  // もう一戦するときは設定画面に戻すので、エンジンに再戦の口は持たせない。
  // 1台版は state を捨てて Setup へ、オンラインはサーバーが game を null に戻す
  it('全ラウンド終わると gameover で止まり、それ以上進まない', () => {
    const done = playThrough();
    expect(done.phase).toBe('gameover');
    expect(done.players.some((p) => p.score > 0)).toBe(true);
    expect(reducer(done, { type: 'NEXT_TURN' })).toBe(done);
  });
});

describe('コンテストの位', () => {
  it('平均点から位が決まる', () => {
    expect(gradeFor(0)).toBe('駄作');
    expect(gradeFor(49.9)).toBe('駄作');
    expect(gradeFor(50)).toBe('佳作');
    expect(gradeFor(69.9)).toBe('佳作');
    expect(gradeFor(70)).toBe('秀作');
    expect(gradeFor(84.9)).toBe('秀作');
    expect(gradeFor(85)).toBe('金賞');
    expect(gradeFor(100)).toBe('金賞');
  });
});

describe('順位', () => {
  it('得点の高い順に並ぶ', () => {
    const s = start('dokudan');
    const withScores: GameState = {
      ...s,
      players: [
        { ...s.players[0], score: 1 },
        { ...s.players[1], score: 3 },
        { ...s.players[2], score: 2 },
      ],
    };
    expect(ranking(withScores).map((p) => p.name)).toEqual(['い', 'う', 'あ']);
  });
});

describe('対戦ラウンド数', () => {
  /** 1手番ぶん進める（時間切れで全員自動提出 → 親が先頭を選ぶ → 次へ） */
  function playTurn(s: GameState): GameState {
    s = reducer(s, { type: 'TIMEOUT' });
    s = reducer(s, { type: 'JUDGE', playerId: s.players[s.activeIndex].id, index: 0 });
    return reducer(s, { type: 'NEXT_TURN' });
  }

  // 1ラウンド = 全員が1回ずつ親をやること。
  // ここを「1ラウンド = 1人が親をやる」と取り違えると、
  // 1ラウンドを選んだのに1人だけ親をやって終わってしまう。
  it('1ラウンドは人数ぶんの手番', () => {
    const s = start('dokudan', ['あ', 'い', 'う', 'え'], { rounds: 1 });
    expect(totalRounds(s)).toBe(1);
    expect(totalTurns(s)).toBe(4);
  });

  it('指定がなければ1ラウンド（ちょうど一巡）', () => {
    const s = start('dokudan', ['あ', 'い', 'う', 'え']);
    expect(totalRounds(s)).toBe(1);
    expect(totalTurns(s)).toBe(4);
  });

  it('1ラウンドを選ぶと全員が親をやって終わる', () => {
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 1, passAndPlay: false });
    const hosts: string[] = [];
    for (let i = 0; i < 3; i++) {
      hosts.push(s.players[s.activeIndex].name);
      expect(s.phase).not.toBe('gameover');
      s = playTurn(s);
    }
    // 席順は抽選なので並びは決め打ちしない。全員が1回ずつ親をやることを見る
    expect(sorted(hosts)).toEqual(['あ', 'い', 'う']);
    expect(s.phase).toBe('gameover');
  });

  it('コンテストでも1ラウンドで全員が提出者をやる', () => {
    let s = start('contest', ['あ', 'い', 'う'], { rounds: 1, passAndPlay: false });
    expect(totalTurns(s)).toBe(3);
    const authors: string[] = [];
    for (let i = 0; i < 3; i++) {
      authors.push(s.players[s.activeIndex].name);
      expect(s.phase).not.toBe('gameover');
      s = reducer(s, { type: 'TIMEOUT' }); // 提出
      s = reducer(s, { type: 'TIMEOUT' }); // 採点
      s = reducer(s, { type: 'NEXT_TURN' });
    }
    expect(sorted(authors)).toEqual(['あ', 'い', 'う']);
    expect(s.phase).toBe('gameover');
  });

  it('2ラウンドなら親が二巡する', () => {
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 2, passAndPlay: false });
    expect(totalTurns(s)).toBe(6);
    const hosts: string[] = [];
    for (let i = 0; i < 6; i++) {
      hosts.push(s.players[s.activeIndex].name);
      s = playTurn(s);
    }
    // 1ラウンドごとに全員がちょうど1回。ラウンドをまたいだ並びは抽選で変わる
    expect(sorted(hosts.slice(0, 3))).toEqual(['あ', 'い', 'う']);
    expect(sorted(hosts.slice(3))).toEqual(['あ', 'い', 'う']);
    expect(s.phase).toBe('gameover');
  });

  it('ラウンド番号と何人目かが手番から求まる', () => {
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 2, passAndPlay: false });
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(`${roundNumber(s)}-${seatNumber(s)}`);
      s = playTurn(s);
    }
    expect(seen).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3']);
  });
});

describe('ラウンドの切れ目での仕切り直し', () => {
  /** 独断と偏見で1手番進める */
  function playTurn(s: GameState): GameState {
    s = reducer(s, { type: 'TIMEOUT' });
    s = reducer(s, { type: 'JUDGE', playerId: s.players[s.activeIndex].id, index: 0 });
    return reducer(s, { type: 'NEXT_TURN' });
  }

  it('ラウンドが変わると全員に配り直し、捨て場も空になる', () => {
    // 3人・2ラウンド。手番2→3がラウンドの切れ目
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 2, passAndPlay: false });

    // 捨て場に札を積んでおく
    const me = s.players[1];
    s = reducer(s, {
      type: 'EXCHANGE',
      playerId: me.id,
      discardIds: [me.hand.filter((c) => c.mora === 5)[0].id],
      capturedIds: [],
    });
    expect(s.discard.length).toBeGreaterThan(0);

    s = playTurn(s); // 手番0 → 1（ラウンド内）
    expect(roundNumber(s)).toBe(1);
    expect(s.discard.length).toBeGreaterThan(0); // まだ持ち越す

    const before = s.players.map((p) => p.hand.map((c) => c.id).join(','));
    s = playTurn(s); // 手番1 → 2（まだラウンド内）
    s = playTurn(s); // 手番2 → 3（ここでラウンドが変わる）

    expect(roundNumber(s)).toBe(2);
    expect(seatNumber(s)).toBe(1);
    expect(s.discard).toEqual([]);

    const after = s.players.map((p) => p.hand.map((c) => c.id).join(','));
    expect(after).not.toEqual(before);
    for (const p of s.players) {
      expect(p.hand.filter((c) => c.mora === 5)).toHaveLength(4);
      expect(p.hand.filter((c) => c.mora === 7)).toHaveLength(2);
    }
    // 配り直しても同じ札が2人に渡らない
    const ids = s.players.flatMap((p) => p.hand.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('得点はラウンドをまたいでも持ち越す', () => {
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 2, passAndPlay: false });
    for (let i = 0; i < 3; i++) s = playTurn(s);
    expect(roundNumber(s)).toBe(2);
    expect(s.players.reduce((a, p) => a + p.score, 0)).toBe(3); // 3手番ぶんの勝ち
    expect(s.history).toHaveLength(3);
  });

  it('ラウンドの途中では使った札だけ補充する', () => {
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 2, passAndPlay: false });
    const keeper = hostId(s); // 親は詠まないので手札が減らない
    const before = s.players.find((p) => p.id === keeper)!.hand.map((c) => c.id).join(',');
    s = playTurn(s);
    expect(roundNumber(s)).toBe(1);
    expect(s.players.find((p) => p.id === keeper)!.hand.map((c) => c.id).join(',')).toBe(before);
  });
});

describe('自由札', () => {
  /** その人が自由札 + 手札の5音1枚 + 7音1枚で提出する（自由札は5音の位置に置く） */
  function submitWithFree(s: GameState, playerId: string): GameState {
    const hand = handOf(s, playerId);
    const five = hand.filter((c) => c.mora === 5 && !c.free);
    const seven = hand.filter((c) => c.mora === 7);
    return reducer(s, {
      type: 'SUBMIT',
      playerId,
      upperId: freeCardId(playerId),
      middleId: seven[0].id,
      lowerId: five[0].id,
    });
  }

  it('最初は未記入で、手札には並ばない', () => {
    const s = startOnline('dokudan');
    expect(s.players[0].free).toEqual({ text: '', mora: null, usedTurn: null });
    // 山札から配られた6枚だけ。自由札は書くまで札にならない
    expect(handOf(s, 'p1')).toHaveLength(6);
    expect(freeCardOf(s, 'p1')).toBeNull();
  });

  it('言葉と位置を決めると手札に並ぶ', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '課長の顔', mora: 5 });
    const free = freeCardOf(s, 'p1');
    expect(free).not.toBeNull();
    expect(free!.text).toBe('課長の顔');
    expect(free!.mora).toBe(5);
    expect(free!.free).toBe(true);
    expect(handOf(s, 'p1')).toHaveLength(7); // 既存6枚 + 自由札
  });

  it('音数は検証しない。7音として出せば7音の札になる', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: 'あ', mora: 7 });
    expect(freeCardOf(s, 'p1')!.mora).toBe(7);
    expect(handOf(s, 'p1').filter((c) => c.mora === 7)).toHaveLength(3);
  });

  it('何度でも書き直せる', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '一回目', mora: 5 });
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '二回目', mora: 7 });
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '三回目', mora: 5 });
    expect(freeCardOf(s, 'p1')!.text).toBe('三回目');
    expect(freeCardOf(s, 'p1')!.mora).toBe(5);
  });

  it('空白だけの言葉は受け付けず、長さは切り詰める', () => {
    let s = startOnline('dokudan');
    const before = s;
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '   ', mora: 5 });
    expect(s).toBe(before);

    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: 'あ'.repeat(50), mora: 5 });
    expect(freeCardOf(s, 'p1')!.text).toHaveLength(FREE_CARD_MAX);
  });

  it('交換には出せない', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '出せない', mora: 5 });
    const before = s;
    // 自由札を捨てようとしても、山札の手札に無いので丸ごと弾かれる
    s = reducer(s, {
      type: 'EXCHANGE',
      playerId: 'p1',
      discardIds: [freeCardId('p1')],
      capturedIds: [],
    });
    expect(s).toBe(before);
  });

  it('使うとそのラウンドは手札から消え、次のラウンドで戻る', () => {
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 2, passAndPlay: false });
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '奥の手', mora: 5 });
    s = submitWithFree(s, 'p1');

    expect(s.players[1].free.usedTurn).toBe(0);
    expect(freeCardOf(s, 'p1')).toBeNull();
    // 言葉は残る。次のラウンドでそのまま使ってもいいし書き直してもいい
    expect(s.players[1].free.text).toBe('奥の手');

    // ラウンド1を終わらせて次のラウンドへ
    s = reducer(s, { type: 'TIMEOUT' });
    for (let i = 0; i < 3; i++) {
      s = reducer(s, { type: 'JUDGE', playerId: s.players[s.activeIndex].id, index: 0 });
      s = reducer(s, { type: 'NEXT_TURN' });
      if (roundNumber(s) === 2) break;
      s = reducer(s, { type: 'TIMEOUT' });
    }
    expect(roundNumber(s)).toBe(2);
    expect(freeCardOf(s, 'p1')).not.toBeNull(); // また使える
  });

  it('使い切ったあとは書き直せない', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '一度きり', mora: 5 });
    s = submitWithFree(s, 'p1');
    const before = s;
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: 'やり直し', mora: 5 });
    expect(s).toBe(before);
  });

  it('自分の手番でなければ書けない', () => {
    const s = startOnline('dokudan');
    // 親は詠まない＝手番のキューにいない
    expect(reducer(s, { type: 'SET_FREE_CARD', playerId: hostId(s), text: '親の札', mora: 5 })).toBe(s);
  });

  it('他人の自由札の中身は配らない', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '秘密の句', mora: 5 });
    const seen = viewFor(s, 'p2');
    expect(seen.players.find((p) => p.id === 'p1')!.free.text).toBe('');
    expect(seen.players.find((p) => p.id === 'p1')!.free.mora).toBeNull();
    // 自分の自由札は見える
    expect(viewFor(s, 'p1').players.find((p) => p.id === 'p1')!.free.text).toBe('秘密の句');
  });

  it('時間切れの自動提出では自由札を使わない', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'SET_FREE_CARD', playerId: 'p1', text: '勝手に使うな', mora: 5 });
    s = reducer(s, { type: 'TIMEOUT' });
    const mine = s.submissions.find((h) => h.authorId === 'p1')!;
    expect([mine.upper, mine.middle, mine.lower].some((c) => c.free)).toBe(false);
    expect(s.players[1].free.usedTurn).toBeNull();
  });
});

describe('進み具合', () => {
  it('独断と偏見は親以外の人数が母数', () => {
    let s = startOnline('dokudan', ['あ', 'い', 'う', 'え']);
    const poets = others(s);
    expect(phaseProgress(s)).toEqual({ done: 0, total: 3 });
    s = submitFor(s, poets[0]);
    expect(phaseProgress(s)).toEqual({ done: 1, total: 3 });
    s = submitFor(s, poets[1]);
    s = submitFor(s, poets[2]);
    // 全員出そろうと審査へ移るので、進み具合は出さない
    expect(s.phase).toBe('judge');
    expect(phaseProgress(s)).toBeNull();
  });

  it('コンテストは詠む1人、採点は残り全員が母数', () => {
    let s = startOnline('contest', ['あ', 'い', 'う', 'え']);
    const raters = others(s);
    expect(phaseProgress(s)).toEqual({ done: 0, total: 1 });
    s = submitFor(s, hostId(s));
    expect(s.phase).toBe('rate');
    expect(phaseProgress(s)).toEqual({ done: 0, total: 3 });
    s = reducer(s, { type: 'RATE', playerId: raters[0], score: 50 });
    expect(phaseProgress(s)).toEqual({ done: 1, total: 3 });
  });

  it('結果画面では出さない', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'TIMEOUT' });
    s = reducer(s, { type: 'JUDGE', playerId: 'p0', index: 0 });
    expect(phaseProgress(s)).toBeNull();
  });
});

describe('勝ち句予想', () => {
  /** 親以外の全員に提出させて審査フェーズまで進める */
  function toJudge(names = ['あ', 'い', 'う', 'え']): GameState {
    let s = startOnline('dokudan', names);
    for (const id of others(s)) s = submitFor(s, id);
    expect(s.phase).toBe('judge');
    return s;
  }
  /** 名前で引く（席順が抽選なので id を決め打ちしない） */
  function nameOf(s: GameState, id: string): string {
    return s.players.find((p) => p.id === id)!.name;
  }

  it('親以外が表示順の位置で予想できる', () => {
    let s = toJudge();
    const [a, b] = others(s);
    s = reducer(s, { type: 'PREDICT', playerId: a, index: 2 });
    s = reducer(s, { type: 'PREDICT', playerId: b, index: 0 });
    expect(s.predictions).toEqual({ [a]: 2, [b]: 0 });
  });

  it('親は予想できない', () => {
    const s = toJudge();
    expect(reducer(s, { type: 'PREDICT', playerId: hostId(s), index: 0 })).toBe(s);
  });

  it('何度でも選び直せる', () => {
    let s = toJudge();
    const me = others(s)[0];
    s = reducer(s, { type: 'PREDICT', playerId: me, index: 0 });
    s = reducer(s, { type: 'PREDICT', playerId: me, index: 2 });
    expect(s.predictions).toEqual({ [me]: 2 });
  });

  it('無い位置は受け付けない', () => {
    const s = toJudge();
    const me = others(s)[0];
    expect(reducer(s, { type: 'PREDICT', playerId: me, index: 9 })).toBe(s);
    expect(reducer(s, { type: 'PREDICT', playerId: me, index: -1 })).toBe(s);
  });

  it('審査フェーズ以外では予想できない', () => {
    const s = startOnline('dokudan');
    expect(s.phase).toBe('turn');
    expect(reducer(s, { type: 'PREDICT', playerId: 'p1', index: 0 })).toBe(s);
  });

  it('コンテストには無い', () => {
    let s = startOnline('contest', ['あ', 'い', 'う']);
    s = submitFor(s, hostId(s));
    expect(s.phase).toBe('rate');
    expect(reducer(s, { type: 'PREDICT', playerId: others(s)[0], index: 0 })).toBe(s);
  });

  it('当てた人だけが結果に出る。得点は動かない', () => {
    let s = toJudge();
    const host = hostId(s);
    const [a, b, c] = others(s);
    s = reducer(s, { type: 'PREDICT', playerId: a, index: 1 });
    s = reducer(s, { type: 'PREDICT', playerId: b, index: 1 });
    s = reducer(s, { type: 'PREDICT', playerId: c, index: 0 });

    const scoresBefore = s.players.map((p) => p.score);
    s = reducer(s, { type: 'JUDGE', playerId: host, index: 1 });

    expect(s.lastResult!.winnerIndex).toBe(1);
    expect(predictionHits(s, s.lastResult!).sort()).toEqual(
      [nameOf(s, a), nameOf(s, b)].sort(),
    );

    // 予想が当たっても点は入らない。増えるのは選ばれた句の作者の1点だけ
    const winner = s.lastResult!.winnerId;
    for (const p of s.players) {
      const before = scoresBefore[s.players.indexOf(p)];
      expect(p.score).toBe(p.id === winner ? before + 1 : before);
    }
  });

  it('誰も当てられなければ空', () => {
    let s = toJudge();
    s = reducer(s, { type: 'PREDICT', playerId: others(s)[0], index: 0 });
    s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 2 });
    expect(predictionHits(s, s.lastResult!)).toEqual([]);
  });

  it('手番が変わると予想は消える', () => {
    let s = toJudge(['あ', 'い', 'う']);
    s = reducer(s, { type: 'PREDICT', playerId: others(s)[0], index: 0 });
    s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
    s = reducer(s, { type: 'NEXT_TURN' });
    expect(s.predictions).toEqual({});
  });

  it('締まるまで他人の予想は配らない', () => {
    let s = toJudge();
    const host = hostId(s);
    const [a, b, c] = others(s);
    s = reducer(s, { type: 'PREDICT', playerId: a, index: 0 });
    s = reducer(s, { type: 'PREDICT', playerId: b, index: 1 });

    expect(viewFor(s, a).predictions).toEqual({ [a]: 0 });
    expect(viewFor(s, c).predictions).toEqual({});

    s = reducer(s, { type: 'JUDGE', playerId: host, index: 0 });
    // 結果が出たら全員ぶん見える。答え合わせのため
    expect(viewFor(s, c).predictions).toEqual({ [a]: 0, [b]: 1 });
  });
});

describe('席順の抽選', () => {
  function playRound(s: GameState): { s: GameState; hosts: string[] } {
    const hosts: string[] = [];
    for (let i = 0; i < s.players.length; i++) {
      hosts.push(hostId(s));
      s = reducer(s, { type: 'TIMEOUT' });
      s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
      s = reducer(s, { type: 'NEXT_TURN' });
    }
    return { s, hosts };
  }

  it('ラウンド内では全員がちょうど1回ずつ親をやる', () => {
    const s = start('dokudan', ['あ', 'い', 'う', 'え'], { rounds: 1, passAndPlay: false });
    const { hosts } = playRound(s);
    expect(sorted(hosts)).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  it('席順はラウンドの頭で引き直され、ラウンド中は変わらない', () => {
    let s = start('dokudan', ['あ', 'い', 'う', 'え'], { rounds: 2, passAndPlay: false });
    const first = [...s.order];
    // ラウンド1の途中では並びが動かない
    s = reducer(s, { type: 'TIMEOUT' });
    s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
    s = reducer(s, { type: 'NEXT_TURN' });
    expect(s.order).toEqual(first);
    expect(roundNumber(s)).toBe(1);

    // ラウンド2に入ると引き直す
    for (let i = 0; i < 3; i++) {
      s = reducer(s, { type: 'TIMEOUT' });
      s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
      s = reducer(s, { type: 'NEXT_TURN' });
    }
    expect(roundNumber(s)).toBe(2);
    expect(sorted(s.order)).toEqual(['p0', 'p1', 'p2', 'p3']); // 顔ぶれは同じ
  });

  it('種が違えば並びも変わる', () => {
    const a = reducer({} as GameState, {
      type: 'START_GAME', mode: 'dokudan', settings: SETTINGS, names: ['あ','い','う','え','お','か'], seed: 1,
    });
    const b = reducer({} as GameState, {
      type: 'START_GAME', mode: 'dokudan', settings: SETTINGS, names: ['あ','い','う','え','お','か'], seed: 2,
    });
    expect(a.order).not.toEqual(b.order);
  });

  /**
   * 種の作り方を変えたときの歯止め。
   *
   * 小さな seed（1 とか 2）だけで確かめると、seed が Date.now() 相当の
   * 大きさになったときの丸めや桁落ちを見逃す。「引き直しているつもりで
   * 毎ラウンド同じ種になっている」は、遊んでいて気づきにくいわりに
   * 抽選そのものを無意味にするので、実寸の seed で偏りを見ておく。
   */
  it('本物の大きさの種でも、ラウンドごとにちゃんと引き直される', () => {
    const base = Date.now();
    let same = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      let s = reducer({} as GameState, {
        type: 'START_GAME',
        mode: 'dokudan',
        settings: { ...SETTINGS, rounds: 2, passAndPlay: false },
        names: ['あ', 'い', 'う', 'え'],
        // 実際は数百msおきに部屋が立つ。その刻みを模す
        seed: base + i * 700,
      });
      const first = s.order.join('');
      for (let k = 0; k < 4; k++) {
        s = reducer(s, { type: 'TIMEOUT' });
        s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
        s = reducer(s, { type: 'NEXT_TURN' });
      }
      expect(roundNumber(s)).toBe(2);
      if (s.order.join('') === first) same++;
    }
    // 4人なら偶然一致するのは 1/24。引き直していなければ 60/60 に張り付く
    expect(same).toBeLessThan(trials / 4);
  });

  it('players の並びは動かさない（席番号はサーバーと対応している）', () => {
    let s = start('dokudan', ['あ', 'い', 'う'], { rounds: 2, passAndPlay: false });
    for (let i = 0; i < 3; i++) {
      s = reducer(s, { type: 'TIMEOUT' });
      s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
      s = reducer(s, { type: 'NEXT_TURN' });
    }
    expect(s.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
    expect(s.players.map((p) => p.name)).toEqual(['あ', 'い', 'う']);
  });
});

describe('民主主義モード', () => {
  /** 全員が詠んで投票フェーズまで進める */
  function toVote(names = ['あ', 'い', 'う', 'え']): GameState {
    let s = start('democracy', names, { rounds: 1, passAndPlay: false });
    expect(sorted(s.turnQueue)).toEqual(sorted(s.players.map((p) => p.id)));
    for (const p of s.players) s = submitFor(s, p.id);
    expect(s.phase).toBe('vote');
    return s;
  }

  it('全員が詠み、全員が投票に回る', () => {
    const s = toVote();
    expect(s.submissions).toHaveLength(4);
    expect(sorted(s.turnQueue)).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  it('自分の句には入れられない', () => {
    const s = toVote();
    const board = shuffledSubmissions(s);
    const mine = board.findIndex((h) => h.authorId === 'p0');
    expect(reducer(s, { type: 'VOTE', playerId: 'p0', index: mine })).toBe(s);
  });

  it('最多得票の作者に1点。票数はそのまま点にしない', () => {
    let s = toVote();
    const board = shuffledSubmissions(s);
    const target = board.findIndex((h) => h.authorId === 'p1');
    const other = board.findIndex((h) => h.authorId === 'p2');
    // p1 の句に3票、p2 の句に1票。1位の作者だけ1点で、票数は点にしない
    s = reducer(s, { type: 'VOTE', playerId: 'p0', index: target });
    s = reducer(s, { type: 'VOTE', playerId: 'p2', index: target });
    s = reducer(s, { type: 'VOTE', playerId: 'p3', index: target });
    s = reducer(s, { type: 'VOTE', playerId: 'p1', index: other });
    expect(s.phase).toBe('roundResult');
    expect(s.lastResult!.winnerIndexes).toEqual([target]);
    expect(s.players.find((p) => p.id === 'p1')!.score).toBe(1);
    expect(s.players.find((p) => p.id === 'p2')!.score).toBe(0);
  });

  it('同票なら全員に1点（同時優勝）', () => {
    let s = toVote(['あ', 'い', 'う']);
    const board = shuffledSubmissions(s);
    const a = board.findIndex((h) => h.authorId === 'p0');
    const b = board.findIndex((h) => h.authorId === 'p1');
    s = reducer(s, { type: 'VOTE', playerId: 'p1', index: a });
    s = reducer(s, { type: 'VOTE', playerId: 'p2', index: b });
    s = reducer(s, { type: 'VOTE', playerId: 'p0', index: b });
    // p0に1票、p1に2票 … ではなく確実に同票を作る
    expect(s.phase).toBe('roundResult');
    const winners = s.players.filter((p) => p.score === 1).map((p) => p.id);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    expect(s.lastResult!.winnerIndexes!.length).toBe(winners.length);
  });

  it('結果には作者IDでの集計も残す（表示順を引き直さずに描けるように）', () => {
    let s = toVote(['あ', 'い', 'う', 'え']);
    const board = shuffledSubmissions(s);
    const target = board.findIndex((h) => h.authorId === 'p1');
    const other = board.findIndex((h) => h.authorId === 'p2');
    s = reducer(s, { type: 'VOTE', playerId: 'p0', index: target });
    s = reducer(s, { type: 'VOTE', playerId: 'p2', index: target });
    s = reducer(s, { type: 'VOTE', playerId: 'p3', index: target });
    s = reducer(s, { type: 'VOTE', playerId: 'p1', index: other });

    const r = s.lastResult!;
    expect(r.winnerIds).toEqual(['p1']);
    expect(r.voteCounts).toEqual({ p0: 0, p1: 3, p2: 1, p3: 0 });
    // 集計の合計は投じられた票数と必ず一致する
    const total = Object.values(r.voteCounts!).reduce((a, b) => a + b, 0);
    expect(total).toBe(Object.keys(r.votes!).length);
  });

  it('同票のときは winnerIds に全員入る', () => {
    let s = toVote(['あ', 'い', 'う', 'え']);
    const board = shuffledSubmissions(s);
    const a = board.findIndex((h) => h.authorId === 'p0');
    const b = board.findIndex((h) => h.authorId === 'p1');
    s = reducer(s, { type: 'VOTE', playerId: 'p1', index: a });
    s = reducer(s, { type: 'VOTE', playerId: 'p2', index: a });
    s = reducer(s, { type: 'VOTE', playerId: 'p0', index: b });
    s = reducer(s, { type: 'VOTE', playerId: 'p3', index: b });
    const r = s.lastResult!;
    expect(sorted(r.winnerIds!)).toEqual(['p0', 'p1']);
    expect(s.players.filter((p) => p.score === 1).map((p) => p.id).sort()).toEqual(['p0', 'p1']);
  });

  it('時間切れは入った票だけで数える。誰も入れなければ勝者なし', () => {
    let s = toVote();
    s = reducer(s, { type: 'TIMEOUT' });
    expect(s.phase).toBe('roundResult');
    expect(s.lastResult!.winnerIndexes).toEqual([]);
    expect(s.players.every((p) => p.score === 0)).toBe(true);
  });

  it('締まるまで他人の票は配らない。投票中は他人の作者は伏せる', () => {
    let s = toVote();
    const board = shuffledSubmissions(s);
    const t = board.findIndex((h) => h.authorId === 'p1');
    s = reducer(s, { type: 'VOTE', playerId: 'p0', index: t });

    const seen = viewFor(s, 'p2');
    expect(seen.votes).toEqual({});
    expect(viewFor(s, 'p0').votes).toEqual({ p0: t });
    // 自分の句だけは伏せない（自分には投票できないことを画面で示すため）
    expect(seen.board.filter((h) => h.authorId === 'p2')).toHaveLength(1);
    expect(seen.board.filter((h) => h.authorId === '')).toHaveLength(seen.board.length - 1);
  });

  it('手番が変わると票は消える', () => {
    let s = toVote(['あ', 'い', 'う']);
    s = reducer(s, { type: 'TIMEOUT' });
    s = reducer(s, { type: 'NEXT_TURN' });
    expect(s.votes).toEqual({});
    expect(s.phase).toBe('turn');
  });

  it('1ラウンドは人数ぶんの手番', () => {
    const s = start('democracy', ['あ', 'い', 'う'], { rounds: 2 });
    expect(totalTurns(s)).toBe(6);
  });
});

describe('履歴', () => {
  it('開始時は空', () => {
    expect(start('dokudan').history).toEqual([]);
  });

  it('独断と偏見はラウンドごとに勝者つきで積まれる', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'TIMEOUT' });
    const winner = shuffledSubmissions(s)[0].authorId;
    s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });

    expect(s.history).toHaveLength(1);
    expect(s.history[0].turn).toBe(0);
    expect(s.history[0].winnerId).toBe(winner);
    // 負けた句も残す。総合結果の振り返りで全員ぶん見せられるようにするため
    expect(s.history[0].submissions).toHaveLength(2);
    expect(s.history[0]).toEqual(s.lastResult);
  });

  it('コンテストは平均点つきで積まれ、ラウンドを重ねても消えない', () => {
    let s = startOnline('contest', ['あ', 'い', 'う']);
    const rate = (score: number) => {
      const next = s.turnQueue[0];
      s = reducer(s, { type: 'RATE', playerId: next, score });
    };
    s = submitFor(s, hostId(s));
    rate(80);
    rate(60);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].average).toBe(70);

    s = reducer(s, { type: 'NEXT_TURN' });
    s = submitFor(s, hostId(s));
    rate(10);
    rate(30);
    expect(s.history).toHaveLength(2);
    expect(s.history.map((r) => r.average)).toEqual([70, 20]);
  });

  it('配信する状態にも履歴が入る（総合結果の振り返りに要る）', () => {
    let s = startOnline('dokudan');
    s = reducer(s, { type: 'TIMEOUT' });
    s = reducer(s, { type: 'JUDGE', playerId: hostId(s), index: 0 });
    expect(viewFor(s, s.players[1].id).history).toHaveLength(1);
  });
});
