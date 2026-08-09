import { useEffect, useRef, useState } from 'react';
import type { Action, GameState, Haiku } from '../engine/types';
import { activePlayer, roundNumber, seatNumber, seatedPlayer, totalRounds } from '../engine/reducer';
import { Turn, type Draft } from './Turn';
import { GameOver, Judge, Rate, RoundResult } from './Results';

export type GameProps = {
  s: GameState;
  /** この画面を見ている人。1台版では「いま座っている人」、オンラインでは自分 */
  me: string;
  /** 審査に出す句の並び。オンラインでは作者を伏せたものがサーバーから届く */
  board: Haiku[];
  draft: Draft;
  setDraft: (d: Draft) => void;
  dispatch: (a: Action) => void;
  /** 次のラウンドへ進める権限があるか（オンラインではホストのみ） */
  canAdvance: boolean;
  /** 設定画面へ戻ってもう一戦する。オンラインではホストのみ */
  onReplay?: () => void;
  /** タイトルへ戻る。1台版のみ */
  onExit?: () => void;
};

/** フェーズから画面を決める。1台版とオンライン版で共通 */
export function Game({ s, me, board, draft, setDraft, dispatch, canAdvance, onReplay, onExit }: GameProps) {
  const screen = () => {
    switch (s.phase) {
      case 'handoff':
        return <Handoff s={s} dispatch={dispatch} />;
      case 'turn':
        return <Turn s={s} me={me} draft={draft} setDraft={setDraft} dispatch={dispatch} />;
      case 'judge':
        return <Judge s={s} me={me} board={board} dispatch={dispatch} />;
      case 'rate':
        return <Rate s={s} me={me} dispatch={dispatch} />;
      case 'roundResult':
        return <RoundResult s={s} canAdvance={canAdvance} dispatch={dispatch} />;
      case 'gameover':
        return <GameOver s={s} canAdvance={canAdvance} onReplay={onReplay} onExit={onExit} />;
      default:
        return null;
    }
  };

  return (
    <>
      <RoleAnnounce s={s} me={me} />
      {screen()}
    </>
  );
}

/** そのラウンドで自分が何をする人か。出す文言がなければ null */
function roleOf(s: GameState, me: string): { title: string; note: string } | null {
  const host = activePlayer(s);
  if (s.mode === 'dokudan') {
    // 親は詠まないので、1台版だと turn の間そもそも席に着かない。
    // 審査で席に着いたときにも知らせる（オンラインでは turn で出た文言と同じなので重複しない）
    if (me === host.id) {
      if (s.phase !== 'turn' && s.phase !== 'judge') return null;
      return { title: 'あなたが親です', note: '句は作りません。出そろったら好みで1句を選んでください' };
    }
    if (s.phase !== 'turn') return null;
    return { title: 'あなたは詠み手です', note: `親（${host.name}）の独断と偏見で選ばれる句を作ってください` };
  }
  // コンテストは1人ずつ詠むので、詠む人以外は全員が審査員になる
  if (s.phase !== 'turn' && s.phase !== 'rate') return null;
  return me === host.id
    ? { title: 'あなたが詠みます', note: '他の全員が100点満点で採点します' }
    : { title: 'あなたは審査員です', note: `${host.name} の句に0〜100点を付けてください` };
}

/**
 * ラウンドの頭に、自分の役割を画面中央で知らせる。
 * 見出しに小さく出しているだけだと「自分は何をすればいいのか」が読み飛ばされる。
 *
 * コンテストでは審査員が turn と rate の2フェーズにまたがって同じ役割なので、
 * ラウンド内で同じ文言を二度出さないよう、出した内容を覚えておく。
 */
function RoleAnnounce({ s, me }: { s: GameState; me: string }) {
  const role = roleOf(s, me);
  const key = role ? `${s.turn}:${me}:${role.title}` : null;
  const shown = useRef<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!key || shown.current === key) return;
    shown.current = key;
    setOpen(true);
    const t = setTimeout(() => setOpen(false), 3200);
    return () => clearTimeout(t);
  }, [key]);

  if (!open || !role) return null;
  return (
    <div className="announce" onClick={() => setOpen(false)}>
      <div className="announce-card">
        <div className="announce-round">
          第{roundNumber(s)}ラウンド ／ {seatNumber(s)}人目
        </div>
        <div className="announce-title">{role.title}</div>
        <p className="announce-note">{role.note}</p>
        <div className="announce-hint">タップで閉じる</div>
      </div>
    </div>
  );
}

/**
 * 1台を回して遊ぶときだけ出る仕切り。次の人が受け取るまで手札を隠しておく暗幕で、
 * トランプの手札を伏せて回すのと同じ役目。オンラインでは各自が自分の画面を見るので出ない。
 */
function Handoff({ s, dispatch }: { s: GameState; dispatch: (a: Action) => void }) {
  const me = seatedPlayer(s);
  if (!me) return null;
  const role =
    s.pendingPhase === 'judge' ? '審査します' : s.pendingPhase === 'rate' ? '採点します' : '句を作ります';

  return (
    <div className="handoff">
      <p className="sub">
        第{roundNumber(s)}ラウンド ／ 全{totalRounds(s)}ラウンド（{seatNumber(s)}人目 ／ {s.players.length}人）
      </p>
      <div>
        <div className="name">{me.name}</div>
        <p className="sub" style={{ marginTop: 8 }}>
          さんに端末を渡してください
        </p>
      </div>
      <p className="sub">{role}</p>
      <button className="primary wide" onClick={() => dispatch({ type: 'TAKE_SEAT' })}>
        {me.name}です
      </button>
      <p className="sub">他の人は画面を見ないこと</p>
    </div>
  );
}
