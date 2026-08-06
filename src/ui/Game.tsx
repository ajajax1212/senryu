import type { Action, GameState, Haiku } from '../engine/types';
import { seatedPlayer, totalRounds } from '../engine/reducer';
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
  onRestart?: () => void;
};

/** フェーズから画面を決める。1台版とオンライン版で共通 */
export function Game({ s, me, board, draft, setDraft, dispatch, canAdvance, onRestart }: GameProps) {
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
      return <GameOver s={s} onRestart={onRestart} />;
    default:
      return null;
  }
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
        第{s.round + 1}ラウンド ／ 全{totalRounds(s)}ラウンド
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
