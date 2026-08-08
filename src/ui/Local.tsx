import { useReducer, useState } from 'react';
import { reducer, seatedPlayerId, shuffledSubmissions } from '../engine/reducer';
import type { Action, DeckId, GameSettings, GameState, Mode, Phase } from '../engine/types';
import { Setup } from './Setup';
import { Game } from './Game';
import type { Draft } from './Turn';
import { Countdown } from './parts';

type AppAction = Action | { type: 'RESET' };

/**
 * ゲーム開始前は state が null なので、エンジンの reducer をそのままは使えない。
 * 「まだ始まっていない」だけをここで吸収し、盤面のルールは engine 側に閉じておく。
 */
function localReducer(s: GameState | null, a: AppAction): GameState | null {
  if (a.type === 'RESET') return null;
  if (a.type === 'START_GAME') return reducer({} as GameState, a);
  return s ? reducer(s, a) : s;
}

/** どのフェーズがどちらの持ち時間で計られるか。引き継ぎ画面と結果画面は計らない */
const TIMED: Partial<Record<Phase, 'turn' | 'judge'>> = {
  turn: 'turn',
  judge: 'judge',
  rate: 'judge',
};

/** 1台を回して遊ぶ版。状態も時計もこのブラウザの中で完結する */
export function Local({ mode: initialMode, onBack }: { mode: Mode; onBack: () => void }) {
  const [game, dispatch] = useReducer(localReducer, null);
  const [draft, setDraft] = useState<Draft & { key: string }>({ key: '' });
  // タイトルで選んだモードが初期値。設定画面で変えられる
  const [mode, setMode] = useState<Mode>(initialMode);
  // もう一戦するとき設定画面に戻すので、顔ぶれと札は覚えておく。
  // 毎回入力し直させると「もう一度遊ぶ」が気軽でなくなる
  const [names, setNames] = useState<string[]>(['', '', '']);
  const [decks, setDecks] = useState<DeckId[]>(['standard', 'meme']);

  function start(picked: string[], settings: GameSettings) {
    setNames(picked);
    setDecks(settings.decks);
    dispatch({ type: 'START_GAME', mode, settings: { ...settings, passAndPlay: true }, names: picked });
  }

  if (!game) {
    return (
      <Setup
        mode={mode}
        onModeChange={setMode}
        initialNames={names}
        initialDecks={decks}
        online={false}
        onStart={start}
        onBack={onBack}
      />
    );
  }

  const me = seatedPlayerId(game) ?? game.players[game.activeIndex].id;
  // 手番が変わったら選択を捨てる。key を持たせておけば useEffect でリセットしなくて済む
  const turnKey = `${game.round}-${me}`;
  const { key: _key, ...partial } = draft.key === turnKey ? draft : { key: turnKey };

  const group = TIMED[game.phase];
  const limit = group ? game.settings.timeLimits[group] : null;

  return (
    <>
      {limit !== null && limit !== undefined && (
        <Countdown
          key={`${turnKey}-${group}`}
          seconds={limit}
          onExpire={() => dispatch({ type: 'TIMEOUT', playerId: me, partial })}
        />
      )}
      <Game
        s={game}
        me={me}
        board={shuffledSubmissions(game)}
        draft={partial}
        setDraft={(d) => setDraft({ ...d, key: turnKey })}
        dispatch={dispatch}
        canAdvance
        onReplay={() => dispatch({ type: 'RESET' })}
        onExit={onBack}
      />
    </>
  );
}
