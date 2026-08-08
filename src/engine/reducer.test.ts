import { describe, expect, it } from 'vitest';
import {
  reducer,
  seatedPlayerId,
  remainingExchanges,
  ranking,
  shuffledSubmissions,
  canAct,
} from './reducer';
import { viewFor } from './view';
import { gradeFor } from './types';
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
    expect(s.activeIndex).toBe(0);
    expect(s.turnQueue).toEqual(['p1', 'p2']); // 親(p0)は詠まない

    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    expect(s.phase).toBe('handoff');

    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);

    expect(s.pendingPhase).toBe('judge');
    expect(seatedPlayerId(s)).toBe('p0');

    s = apply(s, { type: 'TAKE_SEAT' });
    expect(s.phase).toBe('judge');
    expect(s.submissions).toHaveLength(2);

    const winner = shuffledSubmissions(s)[1].authorId;
    s = reducer(s, { type: 'JUDGE', playerId: 'p0', index: 1 });
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
    for (let round = 0; round < 3; round++) {
      expect(s.activeIndex).toBe(round);
      for (let i = 0; i < 2; i++) {
        s = apply(s, { type: 'TAKE_SEAT' });
        s = submitSeated(s);
      }
      s = apply(s, { type: 'TAKE_SEAT' });
      s = reducer(s, { type: 'JUDGE', playerId: s.players[round].id, index: 0 });
      s = reducer(s, { type: 'NEXT_ROUND' });
    }
    expect(s.phase).toBe('gameover');
  });
});

describe('コンテストモード', () => {
  it('提出者以外が採点し平均点が入る', () => {
    let s = start('contest', ['あ', 'い', 'う', 'え']);
    expect(s.turnQueue).toEqual(['p0']);

    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    expect(s.turnQueue).toEqual(['p1', 'p2', 'p3']);

    for (const [id, score] of [
      ['p1', 90],
      ['p2', 60],
      ['p3', 30],
    ] as const) {
      s = apply(s, { type: 'TAKE_SEAT' }, { type: 'RATE', playerId: id, score });
    }
    expect(s.phase).toBe('roundResult');
    expect(s.lastResult!.average).toBe(60);
    expect(s.players[0].score).toBe(60);
  });

  it('点数は0〜100に丸められる', () => {
    let s = start('contest');
    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    s = apply(s, { type: 'TAKE_SEAT' }, { type: 'RATE', playerId: 'p1', score: 500 });
    s = apply(s, { type: 'TAKE_SEAT' }, { type: 'RATE', playerId: 'p2', score: -20 });
    expect(s.lastResult!.ratings).toEqual({ p1: 100, p2: 0 });
  });

  it('提出者は自分の句を採点できない', () => {
    let s = start('contest');
    s = apply(s, { type: 'TAKE_SEAT' });
    s = submitSeated(s);
    expect(reducer(s, { type: 'RATE', playerId: 'p0', score: 100 })).toBe(s);
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
    expect(canAct(s, 'p1')).toBe(true);
    expect(canAct(s, 'p2')).toBe(true);
    expect(canAct(s, 'p0')).toBe(false); // 親は詠まない
  });

  it('提出の順番が入れ替わってもよい', () => {
    let s = startOnline('dokudan');
    s = submitFor(s, 'p2'); // 後ろの人が先に出す
    expect(s.phase).toBe('turn');
    expect(s.turnQueue).toEqual(['p1']);

    s = submitFor(s, 'p1');
    expect(s.phase).toBe('judge');
  });

  it('1台版では先頭の人しか動けない', () => {
    const s = start('dokudan');
    expect(canAct(s, 'p1')).toBe(true);
    expect(canAct(s, 'p2')).toBe(false);
    expect(submitFor(s, 'p2')).toBe(s);
  });

  it('二重提出は無視される', () => {
    let s = startOnline('dokudan');
    s = submitFor(s, 'p1');
    const before = s;
    expect(submitFor(s, 'p1')).toBe(before);
  });

  it('採点も同時にできる', () => {
    let s = startOnline('contest', ['あ', 'い', 'う', 'え']);
    s = submitFor(s, 'p0');
    expect(s.phase).toBe('rate');
    s = reducer(s, { type: 'RATE', playerId: 'p3', score: 100 });
    expect(s.phase).toBe('rate');
    s = reducer(s, { type: 'RATE', playerId: 'p1', score: 50 });
    s = reducer(s, { type: 'RATE', playerId: 'p2', score: 0 });
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
    s = submitFor(s, 'p1');
    s = submitFor(s, 'p2');
    expect(s.phase).toBe('judge');

    const v = viewFor(s, 'p0');
    expect(v.board).toHaveLength(2);
    expect(v.board.every((h) => h.authorId === '')).toBe(true);
    expect(v.submissions).toHaveLength(0);
  });

  it('採点中は他人の点数が見えない', () => {
    let s = startOnline('contest', ['あ', 'い', 'う', 'え']);
    s = submitFor(s, 'p0');
    s = reducer(s, { type: 'RATE', playerId: 'p1', score: 90 });

    const v = viewFor(s, 'p2');
    expect(v.ratings).toEqual({});
    expect(viewFor(s, 'p1').ratings).toEqual({ p1: 90 });
  });

  it('結果が出たら全員の点数が見える', () => {
    let s = startOnline('contest');
    s = submitFor(s, 'p0');
    s = reducer(s, { type: 'RATE', playerId: 'p1', score: 90 });
    s = reducer(s, { type: 'RATE', playerId: 'p2', score: 70 });
    expect(viewFor(s, 'p2').ratings).toEqual({ p1: 90, p2: 70 });
    expect(viewFor(s, 'p2').lastResult!.average).toBe(80);
  });
});

describe('交換', () => {
  it('交換しても手札の構成は5音4枚+7音2枚のまま', () => {
    let s = start('dokudan');
    s = apply(s, { type: 'TAKE_SEAT' });
    const me = s.players.find((p) => p.id === 'p1')!;
    const toss = [
      me.hand.filter((c) => c.mora === 5)[0].id,
      me.hand.filter((c) => c.mora === 7)[0].id,
    ];

    s = reducer(s, { type: 'EXCHANGE', playerId: 'p1', discardIds: toss, capturedIds: [] });
    const after = s.players.find((p) => p.id === 'p1')!;
    expect(after.hand.filter((c) => c.mora === 5)).toHaveLength(4);
    expect(after.hand.filter((c) => c.mora === 7)).toHaveLength(2);
    expect(after.hand.map((c) => c.id)).not.toContain(toss[0]);
  });

  it('捨てた札は捨て場に公開され、誰が捨てたか残る', () => {
    let s = start('dokudan');
    s = apply(s, { type: 'TAKE_SEAT' });
    const tossed = s.players.find((p) => p.id === 'p1')!.hand.filter((c) => c.mora === 5)[0];

    s = reducer(s, { type: 'EXCHANGE', playerId: 'p1', discardIds: [tossed.id], capturedIds: [] });
    expect(s.discard.find((d) => d.card.id === tossed.id)!.discardedBy).toBe('p1');
  });

  it('捨て場の札を拾える', () => {
    let s = startOnline('dokudan');
    const tossed = s.players.find((p) => p.id === 'p1')!.hand.filter((c) => c.mora === 5)[0];
    s = reducer(s, { type: 'EXCHANGE', playerId: 'p1', discardIds: [tossed.id], capturedIds: [] });

    const give = s.players.find((p) => p.id === 'p2')!.hand.filter((c) => c.mora === 5)[0];
    s = reducer(s, {
      type: 'EXCHANGE',
      playerId: 'p2',
      discardIds: [give.id],
      capturedIds: [tossed.id],
    });

    expect(s.players.find((p) => p.id === 'p2')!.hand.map((c) => c.id)).toContain(tossed.id);
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
    s = reducer(s, {
      type: 'EXCHANGE',
      playerId: 'p0',
      discardIds: [s.players[0].hand.filter((c) => c.mora === 5)[0].id],
      capturedIds: [],
    });
    expect(remainingExchanges(s, 'p0')).toBe(1);

    s = submitFor(s, 'p0');
    s = reducer(s, { type: 'RATE', playerId: 'p1', score: 50 });
    s = reducer(s, { type: 'RATE', playerId: 'p2', score: 50 });
    s = reducer(s, { type: 'NEXT_ROUND' });
    expect(remainingExchanges(s, 'p0')).toBe(2);
  });
});

describe('ラウンド間の補充', () => {
  it('句に使った3枚だけが補充され、残りは手元に残る', () => {
    let s = startOnline('contest');
    const before = s.players[0].hand.map((c) => c.id);
    const five = s.players[0].hand.filter((c) => c.mora === 5);
    const seven = s.players[0].hand.filter((c) => c.mora === 7);
    const used = [five[0].id, seven[0].id, five[1].id];

    s = submitFor(s, 'p0');
    s = reducer(s, { type: 'RATE', playerId: 'p1', score: 50 });
    s = reducer(s, { type: 'RATE', playerId: 'p2', score: 50 });
    s = reducer(s, { type: 'NEXT_ROUND' });

    const after = s.players[0].hand;
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
    s = submitFor(s, 'p0');
    s = reducer(s, { type: 'RATE', playerId: 'p1', score: 80 });
    s = reducer(s, { type: 'TIMEOUT' });
    expect(s.lastResult!.ratings).toEqual({ p1: 80, p2: 50 });
    expect(s.lastResult!.average).toBe(65);
  });

  it('引き継ぎ画面と結果画面では何も起きない', () => {
    const s = start('dokudan');
    expect(s.phase).toBe('handoff');
    expect(reducer(s, { type: 'TIMEOUT' })).toBe(s);
  });
});

describe('続けて遊ぶ', () => {
  /** 独断と偏見で最後まで進めて gameover にする */
  function playThrough(): GameState {
    let s = startOnline('dokudan');
    for (let round = 0; round < 3; round++) {
      s = reducer(s, { type: 'TIMEOUT' });          // 全員自動提出
      s = reducer(s, { type: 'JUDGE', playerId: s.players[round].id, index: 0 });
      s = reducer(s, { type: 'NEXT_ROUND' });
    }
    return s;
  }

  it('顔ぶれはそのままで、得点と手札が配り直される', () => {
    const done = playThrough();
    expect(done.phase).toBe('gameover');
    expect(done.players.some((p) => p.score > 0)).toBe(true);

    const again = reducer(done, { type: 'RESTART', seed: 7 });
    expect(again.phase).toBe('turn');
    expect(again.round).toBe(0);
    expect(again.players.map((p) => p.name)).toEqual(done.players.map((p) => p.name));
    expect(again.players.map((p) => p.id)).toEqual(done.players.map((p) => p.id));
    for (const p of again.players) {
      expect(p.score).toBe(0);
      expect(p.scoreHistory).toEqual([]);
      expect(p.hand.filter((c) => c.mora === 5)).toHaveLength(4);
      expect(p.hand.filter((c) => c.mora === 7)).toHaveLength(2);
    }
    expect(again.discard).toEqual([]);
    expect(again.lastResult).toBeNull();
    // 同じ札が2人に配られていない
    const ids = again.players.flatMap((p) => p.hand.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('終了していないときは何も起きない', () => {
    const s = startOnline('dokudan');
    expect(reducer(s, { type: 'RESTART' })).toBe(s);
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
