import { useEffect, useRef, useState } from 'react';
import type { Action, Card, GameState } from '../engine/types';
import {
  activePlayer,
  freeCardOf,
  handOf,
  phaseProgress,
  playerById,
  remainingExchanges,
  roundNumber,
  seatNumber,
  totalRounds,
} from '../engine/reducer';
import { remainingCards } from '../engine/view';
import { CardView, FreeCardEditor, HaikuView } from './parts';

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
  const freeUsed = player.free.usedRound === roundNumber(s);
  const five = hand.filter((c) => c.mora === 5);
  const seven = hand.filter((c) => c.mora === 7);

  const card = (id?: string) => hand.find((c) => c.id === id) ?? null;
  const upper = card(draft.upperId);
  const middle = card(draft.middleId);
  const lower = card(draft.lowerId);
  const isPlaced = (c: Card) => [draft.upperId, draft.middleId, draft.lowerId].includes(c.id);

  const tossed = player.hand.filter((c) => tossing.includes(c.id));
  const claimed = s.discard.filter((d) => claiming.includes(d.card.id)).map((d) => d.card);
  const room = (mora: 5 | 7) =>
    tossed.filter((c) => c.mora === mora).length - claimed.filter((c) => c.mora === mora).length;

  /** 5音札は上句→下句の順に、7音札は中句に入れる */
  function place(c: Card) {
    if (draft.upperId === c.id) return setDraft({ ...draft, upperId: undefined });
    if (draft.middleId === c.id) return setDraft({ ...draft, middleId: undefined });
    if (draft.lowerId === c.id) return setDraft({ ...draft, lowerId: undefined });
    if (c.mora === 7) return setDraft({ ...draft, middleId: c.id });
    if (!draft.upperId) return setDraft({ ...draft, upperId: c.id });
    if (!draft.lowerId) return setDraft({ ...draft, lowerId: c.id });
    setDraft({ ...draft, upperId: c.id });
  }

  function toggleToss(c: Card) {
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

      <div className="hdr-bar">
        <div className="hdr-group">
          <span className="hdr-badge">
            ラウンド {roundNumber(s)}／{totalRounds(s)}
          </span>
          <span className="hdr-badge">
            {seatNumber(s)}人目／{s.players.length}人
          </span>
          <span className="hdr-badge">残り札: {remainingCards(s)}</span>
        </div>
        <div className="hdr-title">川柳・{player.name}の句</div>
        <div className="hdr-group">
          <span className={`hdr-badge${left > 0 ? ' on' : ''}`}>交換残り: {left}</span>
        </div>
      </div>

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
              onClick={() =>
                dispatch({
                  type: 'SUBMIT',
                  playerId: me,
                  upperId: upper!.id,
                  middleId: middle!.id,
                  lowerId: lower!.id,
                })
              }
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
          <div className="hand">
            {[...five, ...seven].map((c) => (
              <CardView key={c.id} card={c} {...handProps(c)} />
            ))}
            {/* 自由札。まだ書いていないときは白紙の札を出し、押すと記入画面が開く。
                今ラウンド使い切ったあとは使用済みの札として置いておく */}
            {!freeCard && (
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
  const waiting = s.turnQueue.map((id) => playerById(s, id)?.name ?? '?');

  return (
    <>
      <h2>{role.title}</h2>
      {role.note && <p className="sub center">{role.note}</p>}
      {mine && (
        <div className="board">
          <HaikuView haiku={mine} />
        </div>
      )}
      <div className="panel col center">
        <h3>{waiting.length > 0 ? 'まだ詠んでいる人' : '全員そろいました'}</h3>
        <ProgressBar s={s} />
        {waiting.length > 0 && <p>{waiting.join('、')}</p>}
      </div>
    </>
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
