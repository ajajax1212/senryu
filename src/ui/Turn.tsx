import { useState } from 'react';
import type { Action, Card, GameState } from '../engine/types';
import { activePlayer, playerById, remainingExchanges } from '../engine/reducer';
import { CardView, HaikuView } from './parts';

/** 選択中の札。時間切れの自動提出に渡すので画面より上で保持する */
export type Draft = { upperId?: string; middleId?: string; lowerId?: string };

/**
 * 交換と作句を1画面にまとめてある。オンラインでは各自が自分のペースで
 * 行き来するので「交換フェーズ→作句フェーズ」と全体で区切れないため。
 * 札のタップが両方の操作を兼ねないよう、画面内のタブで切り替える。
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

  const player = playerById(s, me);
  const submitted = s.submissions.some((h) => h.authorId === me) || !s.turnQueue.includes(me);
  if (!player) return null;

  if (submitted) return <Waiting s={s} me={me} />;

  const left = remainingExchanges(s, me);
  const five = player.hand.filter((c) => c.mora === 5);
  const seven = player.hand.filter((c) => c.mora === 7);

  const card = (id?: string) => player.hand.find((c) => c.id === id) ?? null;
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
    setDraft({ ...draft, upperId: c.id }); // 両方埋まっていたら上句を差し替える
  }

  function toggleToss(c: Card) {
    if (tossing.includes(c.id)) {
      setTossing(tossing.filter((id) => id !== c.id));
      // 捨てる枚数が減ったぶん、拾いすぎている札を外す
      const over = claimed.filter((x) => x.mora === c.mora);
      if (over.length > tossed.filter((x) => x.mora === c.mora).length - 1) {
        setClaiming(claiming.filter((id) => id !== over[over.length - 1].id));
      }
    } else {
      setTossing([...tossing, c.id]);
    }
  }

  function commitExchange() {
    dispatch({ type: 'EXCHANGE', playerId: me, discardIds: tossing, capturedIds: claiming });
    setTossing([]);
    setClaiming([]);
    // 捨てた札が句に入っていたら外す
    setDraft({
      upperId: tossing.includes(draft.upperId ?? '') ? undefined : draft.upperId,
      middleId: tossing.includes(draft.middleId ?? '') ? undefined : draft.middleId,
      lowerId: tossing.includes(draft.lowerId ?? '') ? undefined : draft.lowerId,
    });
  }

  const handProps = (c: Card) =>
    tab === 'compose'
      ? { state: isPlaced(c) ? ('selected' as const) : undefined, onClick: () => place(c) }
      : { state: tossing.includes(c.id) ? ('discarding' as const) : undefined, onClick: () => toggleToss(c) };

  return (
    <>
      <div className="row">
        <h2 className="grow">{player.name} の手番</h2>
        <span className={`badge${left > 0 ? ' on' : ''}`}>交換 残り{left}回</span>
      </div>

      <div className="tabs">
        <button className={tab === 'compose' ? 'on' : ''} onClick={() => setTab('compose')}>
          句を作る
        </button>
        <button className={tab === 'exchange' ? 'on' : ''} onClick={() => setTab('exchange')}>
          札を交換する
        </button>
      </div>

      {tab === 'compose' ? (
        <>
          {/* 縦書きなので右から左に読む。表示順の反転は CSS 側（row-reverse）で行う */}
          <div className="slots">
            <Slot mora={5} hint="上の句" card={upper} onClear={() => setDraft({ ...draft, upperId: undefined })} />
            <Slot mora={7} hint="中の句" card={middle} onClear={() => setDraft({ ...draft, middleId: undefined })} />
            <Slot mora={5} hint="下の句" card={lower} onClear={() => setDraft({ ...draft, lowerId: undefined })} />
          </div>
          <button
            className="ghost wide"
            disabled={!upper || !lower}
            onClick={() => setDraft({ ...draft, upperId: draft.lowerId, lowerId: draft.upperId })}
          >
            ↕ 上句と下句を入れ替える
          </button>
        </>
      ) : (
        <p className="sub">
          いらない札をタップして交換する。捨てた札は全員に公開され、他の人が拾えます。
        </p>
      )}

      <h3>手札</h3>
      <div className="hand">
        {five.map((c) => (
          <CardView key={c.id} card={c} {...handProps(c)} />
        ))}
      </div>
      <div className="hand sevens">
        {seven.map((c) => (
          <CardView key={c.id} card={c} {...handProps(c)} />
        ))}
      </div>

      {tab === 'exchange' && s.discard.length > 0 && (
        <div className="panel col">
          <h3>捨て場{tossed.length > 0 && `（あと5音${room(5)}枚・7音${room(7)}枚まで拾える）`}</h3>
          <div className="discard-pile">
            {s.discard.map((d) => (
              <div key={d.card.id}>
                <CardView
                  card={d.card}
                  state={claiming.includes(d.card.id) ? 'selected' : undefined}
                  onClick={() => {
                    if (claiming.includes(d.card.id)) {
                      setClaiming(claiming.filter((id) => id !== d.card.id));
                    } else if (room(d.card.mora) > 0) {
                      setClaiming([...claiming, d.card.id]);
                    }
                  }}
                />
                <div className="owner">{playerById(s, d.discardedBy)?.name} が捨てた</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grow" />

      {tab === 'exchange' ? (
        <button className="primary wide" disabled={tossing.length === 0 || left <= 0} onClick={commitExchange}>
          {tossing.length}枚を交換する
          {claimed.length > 0 && `（うち${claimed.length}枚は捨て場から）`}
        </button>
      ) : (
        <button
          className="primary wide"
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
          この句で提出する
        </button>
      )}

      {s.mode === 'dokudan' && <p className="sub center">親（{activePlayer(s).name}）が選びます</p>}
    </>
  );
}

/**
 * 自分の手番が終わっていて、他の人を待っている状態。
 * 独断と偏見モードの親はそもそも詠まないので、同じ画面でも文言を分ける。
 */
function Waiting({ s, me }: { s: GameState; me: string }) {
  const mine = s.submissions.find((h) => h.authorId === me);
  const isHost = s.mode === 'dokudan' && me === activePlayer(s).id;
  const waiting = s.turnQueue.map((id) => playerById(s, id)?.name ?? '?');

  return (
    <>
      <h2>{isHost ? 'あなたが親です' : '提出しました'}</h2>
      {isHost && <p className="sub center">句は作りません。出そろったら好きな1句を選んでください。</p>}
      {mine && (
        <div className="board">
          <HaikuView haiku={mine} />
        </div>
      )}
      <div className="panel col center">
        <h3>{waiting.length > 0 ? 'まだ詠んでいる人' : '全員そろいました'}</h3>
        {waiting.length > 0 && <p>{waiting.join('、')}</p>}
      </div>
    </>
  );
}

/**
 * 句の1マス。上に大きく薄い「五」「七」を出して音数を示す。
 * 並びの左右は .slots の row-reverse が担当するので、ここは順序を意識しない。
 */
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
