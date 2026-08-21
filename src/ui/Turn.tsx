import { useEffect, useRef, useState } from 'react';
import type { Action, Card, GameState } from '../engine/types';
import {
  activePlayer,
  freeCardOf,
  freeCardUsed,
  handOf,
  phaseProgress,
  playerById,
  remainingExchanges,
} from '../engine/reducer';
import { remainingCards } from '../engine/view';
import { CardView, FreeCardEditor, HaikuView, PhaseBar, Roster } from './parts';
import { play } from './sound';

/** 選択中の札。時間切れの自動提出に渡すので画面より上で保持する */
export type Draft = { upperId?: string; middleId?: string; lowerId?: string };

/**
 * 交換と作句を1画面にまとめてある。
 */
export function Turn({
  s,
  me,
  draft,
  setDraft,
  dispatch,
}: {
  s: GameState;
  me: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  dispatch: (a: Action) => void;
}) {
  const [tab, setTab] = useState<'compose' | 'exchange'>('compose');
  const [tossing, setTossing] = useState<string[]>([]);
  const [claiming, setClaiming] = useState<string[]>([]);
  const [editingFree, setEditingFree] = useState(false);
  // 交換の演出。捨てる札が抜けるのを見せてから実際に交換する
  const [leaving, setLeaving] = useState<string[]>([]);
  const [arrived, setArrived] = useState<string[]>([]);
  const knownIds = useRef<Set<string> | null>(null);

  // 手札に無かったIDが現れたら「引いてきた札」。交換でも配り直しでも同じように光る
  const handIds = handOf(s, me)
    .map((c) => c.id)
    .join(',');
  useEffect(() => {
    const ids = new Set(handIds ? handIds.split(',') : []);
    const prev = knownIds.current;
    knownIds.current = ids;
    if (!prev) return; // 初回の配札では光らせない
    const fresh = [...ids].filter((id) => !prev.has(id));
    if (fresh.length === 0) return;
    setArrived(fresh);
    const t = setTimeout(() => setArrived([]), 900);
    return () => clearTimeout(t);
  }, [handIds]);

  const player = playerById(s, me);
  const submitted = s.submissions.some((h) => h.authorId === me) || !s.turnQueue.includes(me);
  if (!player) return null;

  if (submitted) return <Waiting s={s} me={me} />;

  const left = remainingExchanges(s, me);
  // 自由札は山札の札と別扱いなので handOf で足す。交換タブでは出さない（交換不可）
  const hand = handOf(s, me);
  const freeCard = freeCardOf(s, me);
  const freeUsed = freeCardUsed(s, me);
  // 五音の束・七音の束・自由札、の三つに分けて並べる。
  // 以前は handOf の並び（自由札が宣言した音数の群に混ざる）をそのまま出していたので、
  // 「五音として使う」と書き直すたびに自由札の位置が動き、目で追う先が毎回変わっていた。
  // 自由札は末尾に固定する。山札の札とは性質が違う（交換に出せない・1ラウンド1回）ので、
  // 束を分けたほうが「使い切ったかどうか」も見に行きやすい
  const five = player.hand.filter((c) => c.mora === 5);
  const seven = player.hand.filter((c) => c.mora === 7);

  const card = (id?: string) => hand.find((c) => c.id === id) ?? null;
  /**
   * 位置に合う札だけを取る。自由札は上の句に置いたまま七音へ書き直せてしまい、
   * そのままだと七音の札が五音の位置に居座る。エンジンは弾くので提出はされないが、
   * ボタンだけ押せて何も起きない状態になるので、置いた側で外す。
   */
  const inSlot = (id: string | undefined, mora: 5 | 7) => {
    const c = card(id);
    return c && c.mora === mora ? c : null;
  };
  const upper = inSlot(draft.upperId, 5);
  const middle = inSlot(draft.middleId, 7);
  const lower = inSlot(draft.lowerId, 5);
  const placedIds = [upper?.id, middle?.id, lower?.id];
  const isPlaced = (c: Card) => placedIds.includes(c.id);

  const tossed = player.hand.filter((c) => tossing.includes(c.id));
  const claimed = s.discard.filter((d) => claiming.includes(d.card.id)).map((d) => d.card);
  const room = (mora: 5 | 7) =>
    tossed.filter((c) => c.mora === mora).length - claimed.filter((c) => c.mora === mora).length;

  /** 5音札は上句→下句の順に、7音札は中句に入れる */
  function place(c: Card) {
    play('place');
    if (draft.upperId === c.id) return setDraft({ ...draft, upperId: undefined });
    if (draft.middleId === c.id) return setDraft({ ...draft, middleId: undefined });
    if (draft.lowerId === c.id) return setDraft({ ...draft, lowerId: undefined });
    if (c.mora === 7) return setDraft({ ...draft, middleId: c.id });
    if (!draft.upperId) return setDraft({ ...draft, upperId: c.id });
    if (!draft.lowerId) return setDraft({ ...draft, lowerId: c.id });
    setDraft({ ...draft, upperId: c.id });
  }

  function toggleToss(c: Card) {
    play('place');
    if (tossing.includes(c.id)) {
      setTossing(tossing.filter((id) => id !== c.id));
      const over = claimed.filter((x) => x.mora === c.mora);
      if (over.length > tossed.filter((x) => x.mora === c.mora).length - 1) {
        setClaiming(claiming.filter((id) => id !== over[over.length - 1].id));
      }
    } else {
      setTossing([...tossing, c.id]);
    }
  }

  /**
   * 交換。捨てる札が抜けていくのを見せてから state を動かす。
   * 即座に入れ替えると、本当に交換できたのか分からないため。
   */
  function commitExchange() {
    if (leaving.length > 0) return; // 演出中の二度押しを防ぐ
    play('toss');
    const discardIds = tossing;
    const capturedIds = claiming;

    setLeaving(discardIds);
    setTossing([]);
    setClaiming([]);
    setDraft({
      upperId: discardIds.includes(draft.upperId ?? '') ? undefined : draft.upperId,
      middleId: discardIds.includes(draft.middleId ?? '') ? undefined : draft.middleId,
      lowerId: discardIds.includes(draft.lowerId ?? '') ? undefined : draft.lowerId,
    });

    setTimeout(() => {
      dispatch({ type: 'EXCHANGE', playerId: me, discardIds, capturedIds });
      setLeaving([]);
      play('draw');
    }, 300);
  }

  const handProps = (c: Card) => {
    const motion = {
      leaving: leaving.includes(c.id),
      arriving: arrived.includes(c.id),
    };
    if (tab === 'compose') {
      return {
        ...motion,
        selected: isPlaced(c),
        onClick: () => place(c),
        ...(c.free ? { onEdit: () => setEditingFree(true) } : {}),
      };
    }
    // 交換タブ。自由札は交換に出せないので押しても何も起きない
    if (c.free) return { ...motion, variant: 'static' as const };
    return {
      ...motion,
      selected: tossing.includes(c.id),
      discarding: tossing.includes(c.id),
      onClick: () => toggleToss(c),
    };
  };

  return (
    <>
      {editingFree && (
        <FreeCardEditor
          initialText={player.free.text}
          initialMora={player.free.mora}
          onCancel={() => setEditingFree(false)}
          onDecide={(text, mora) => {
            dispatch({ type: 'SET_FREE_CARD', playerId: me, text, mora });
            setEditingFree(false);
          }}
        />
      )}

      <PhaseBar
        s={s}
        title={`川柳・${player.name}の句`}
        right={
          <>
            <span className="hdr-badge">残り札 {remainingCards(s)}</span>
            <span className={`hdr-badge${left > 0 ? ' on' : ''}`}>交換残り {left}</span>
          </>
        }
      />

      <div className="tabs">
        <button className={tab === 'compose' ? 'on' : ''} onClick={() => setTab('compose')}>
          句を作る
        </button>
        <button className={tab === 'exchange' ? 'on' : ''} onClick={() => setTab('exchange')}>
          札を交換する
        </button>
      </div>

      <div className="turn-grid">
        <div className="turn-stage">
          {tab === 'compose' ? (
            <>
              <div className="slots">
                <Slot mora={5} hint="上の句" card={upper} onClear={() => setDraft({ ...draft, upperId: undefined })} />
                <Slot mora={7} hint="中の句" card={middle} onClear={() => setDraft({ ...draft, middleId: undefined })} />
                <Slot mora={5} hint="下の句" card={lower} onClear={() => setDraft({ ...draft, lowerId: undefined })} />
              </div>
              <button
                className="ghost chip-btn"
                disabled={!upper || !lower}
                onClick={() => setDraft({ ...draft, upperId: draft.lowerId, lowerId: draft.upperId })}
              >
                ↕ 上句と下句を入れ替える
              </button>
            </>
          ) : (
            <div className="exchange-stage col">
              <p className="sub center">
                手札から不要な札を選んで交換します。捨てられた札は拾うことができます。
              </p>
              {s.discard.length > 0 && (
                <div className="discard-area">
                  <div className="label-mark">
                    みんなの捨て場{tossed.length > 0 && `（あと5音${room(5)}枚・7音${room(7)}枚まで拾える）`}
                  </div>
                  <div className="discard-pile">
                    {s.discard.map((d) => (
                      <div key={d.card.id} className="discard-card-wrap">
                        <CardView
                          card={d.card}
                          selected={claiming.includes(d.card.id)}
                          onClick={() => {
                            if (claiming.includes(d.card.id)) {
                              setClaiming(claiming.filter((id) => id !== d.card.id));
                            } else if (room(d.card.mora) > 0) {
                              setClaiming([...claiming, d.card.id]);
                            }
                          }}
                        />
                        <div className="owner">{playerById(s, d.discardedBy)?.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grow" />

          {tab === 'exchange' ? (
            <button
              className="primary wide"
              disabled={tossing.length === 0 || left <= 0 || leaving.length > 0}
              onClick={commitExchange}
            >
              {tossing.length}枚を交換する
              {claimed.length > 0 && `（うち${claimed.length}枚は捨て場から）`}
            </button>
          ) : (
            <button
              className="btn-kansei"
              disabled={!upper || !middle || !lower}
              onClick={() => {
                play('submit');
                dispatch({
                  type: 'SUBMIT',
                  playerId: me,
                  upperId: upper!.id,
                  middleId: middle!.id,
                  lowerId: lower!.id,
                });
              }}
            >
              完成
            </button>
          )}

          {s.mode === 'dokudan' && <p className="sub center">親（{activePlayer(s).name}）が選びます</p>}
        </div>

        <div className="turn-side hand-tray">
          <div className="label-mark">
            手札
            <span className="free-note">自由札はラウンドに1枚・交換不可</span>
          </div>
          {/* 五音・七音・自由札を束で分ける。文字の見出しを足すと1行ぶん高くなって
              作句画面が1画面に収まらなくなるので、区切りは間隔だけで示す */}
          <div className="hand">
            <div className="hand-group">
              {five.map((c) => (
                <CardView key={c.id} card={c} {...handProps(c)} />
              ))}
            </div>
            <div className="hand-group">
              {seven.map((c) => (
                <CardView key={c.id} card={c} {...handProps(c)} />
              ))}
            </div>
            <div className="hand-group">
              {/* 自由札。まだ書いていないときは白紙の札を出し、押すと記入画面が開く。
                  今ラウンド使い切ったあとは使用済みの札として置いておく */}
              {freeCard ? (
                <CardView card={freeCard} {...handProps(freeCard)} />
              ) : (
                <div
                  className={`card free blank${freeUsed ? ' spent' : ''}`}
                  onClick={() => !freeUsed && setEditingFree(true)}
                >
                  <div className="text">{freeUsed ? '使用済' : '自由札'}</div>
                  <div className="reading">{freeUsed ? 'このラウンドは終わり' : '押して書く'}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Waiting({ s, me }: { s: GameState; me: string }) {
  const mine = s.submissions.find((h) => h.authorId === me);
  const author = activePlayer(s);
  const role =
    s.mode === 'dokudan' && me === author.id
      ? { title: 'あなたが親です', note: '句は作りません。出そろったら好きな1句を選んでください。' }
      : s.mode === 'contest' && me !== author.id
        ? { title: 'あなたは審査員です', note: `${author.name} が詠み終わったら0〜100点を付けます。` }
        : { title: '提出しました', note: null };
  const p = phaseProgress(s);
  const allIn = s.turnQueue.length === 0;

  return (
    <>
      <PhaseBar s={s} title={role.title} />

      <div className="wait-stage">
        {/* 自分の句があれば真ん中に据える。無い人（親・審査員）には、
            出そろい具合を伏せ札の列で見せる。文字だけの待機画面は
            進んでいるのか止まっているのか分からない */}
        <div className="wait-main">
          {mine ? (
            <HaikuView haiku={mine} author="あなたの句" />
          ) : (
            <FaceDownStack done={p?.done ?? 0} total={p?.total ?? 0} />
          )}
        </div>

        <div className="panel col wait-side">
          <div className="label-mark">{allIn ? '全員そろいました' : '出そろうのを待っています'}</div>
          <ProgressBar s={s} />
          {/* コンテストは詠むのが1人だけなので、残りは「提出済」ではなく「審査員」。
              同じ待機画面でもモードで意味が違う */}
          <Roster
            s={s}
            leadLabel={s.mode === 'dokudan' ? '親' : '詠み手'}
            doneLabel={s.mode === 'dokudan' ? '提出済' : '審査員'}
            pendingLabel={s.mode === 'dokudan' ? '詠んでいる' : '待機'}
          />
          {role.note && <p className="sub">{role.note}</p>}
        </div>
      </div>
    </>
  );
}

/**
 * 出そろい具合を伏せた短冊で見せる。
 *
 * 提出された句そのものは当然まだ配られていないので、枚数だけを形にする。
 * 数字のバーより「あと何枚で場が埋まるか」が体感で分かるのと、
 * 何も動かない画面に置くものがこれ以外に無い。
 */
function FaceDownStack({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="facedown-stack">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`facedown${i < done ? ' in' : ''}`}>
          <span>{i < done ? '句' : ''}</span>
        </div>
      ))}
    </div>
  );
}

function Slot({
  mora,
  hint,
  card,
  onClear,
}: {
  mora: 5 | 7;
  hint: string;
  card: Card | null;
  onClear: () => void;
}) {
  return (
    <div className="slot-wrap">
      <div className="slot-mora">{mora === 7 ? '七' : '五'}</div>
      <div
        className={`slot${card ? ' filled' : ''}${mora === 7 ? ' tall' : ''}`}
        onClick={card ? onClear : undefined}
      >
        {card ? card.text : <span className="hint">{hint}</span>}
      </div>
    </div>
  );
}

/**
 * 「あと何人待てばいいのか」を出す。名前の羅列だけだと残りが数えにくく、
 * オンラインでは特に「止まっているのか進んでいるのか」が分からない。
 */
export function ProgressBar({ s }: { s: GameState }) {
  const p = phaseProgress(s);
  if (!p || p.total <= 0) return null;
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${(p.done / p.total) * 100}%` }} />
      </div>
      <span className="progress-label">
        {p.done} / {p.total}人
      </span>
    </div>
  );
}
