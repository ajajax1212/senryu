import { useReducer, useRef, useState } from 'react';
import { reducer, seatedPlayerId, shuffledSubmissions } from '../engine/reducer';
import type { Action, DeckId, GameSettings, GameState, Mode, Phase } from '../engine/types';
import { Setup } from './Setup';
import { Game } from './Game';
import type { Draft } from './Turn';
import type { ArchivedHaiku } from '../net/useRoom';
import { Countdown, PoemGallery } from './parts';

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
  vote: 'judge',
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
  // 1台版にも感想戦を持たせる。RESET で state を捨てるので、句だけ外に取っておく
  const [archive, setArchive] = useState<ArchivedHaiku[]>([]);
  const [gallery, setGallery] = useState(false);
  const games = useRef(0);

  function start(picked: string[], settings: GameSettings) {
    setNames(picked);
    setDecks(settings.decks);
    dispatch({ type: 'START_GAME', mode, settings: { ...settings, passAndPlay: true }, names: picked });
  }

  if (!game) {
    return (
      <>
        {gallery && <PoemGallery poems={archive} onClose={() => setGallery(false)} />}
        {archive.length > 0 && (
          <div className="row lobby-head">
            <div className="grow" />
            <button className="ghost" onClick={() => setGallery(true)}>
              これまでの句（{archive.length}）
            </button>
          </div>
        )}
      <Setup
        mode={mode}
        onModeChange={setMode}
        initialNames={names}
        initialDecks={decks}
        online={false}
        onStart={start}
        onBack={onBack}
      />
      </>
    );
  }

  const me = seatedPlayerId(game) ?? game.players[game.activeIndex].id;
  // 手番が変わったら選択を捨てる。key を持たせておけば useEffect でリセットしなくて済む
  const turnKey = `${game.turn}-${me}`;
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
        onReplay={() => {
          // 設定画面に戻る前に句を控える。state はこのあと捨てられる
          games.current += 1;
          const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? '?';
          const added = game.history.flatMap((r) =>
            r.submissions.map((h) => ({
              game: games.current,
              mode: r.mode,
              authorName: nameOf(h.authorId),
              upper: h.upper.text,
              middle: h.middle.text,
              lower: h.lower.text,
              ...(r.winnerId === h.authorId ? { won: true } : {}),
              ...(r.average !== undefined ? { average: r.average } : {}),
            })),
          );
          setArchive((prev) => [...prev, ...added].slice(-240));
          dispatch({ type: 'RESET' });
        }}
        onExit={onBack}
      />
    </>
  );
}
