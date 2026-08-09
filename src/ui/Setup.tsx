import { useState } from 'react';
import { DECKS } from '../engine/cards';
import { DEFAULT_TIME_LIMITS, type DeckId, type GameSettings, type Mode } from '../engine/types';

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

export const MODES = [
  { id: 'dokudan' as const, label: '独断と偏見モード', note: '親が好みで一番良い句を選ぶ。全員同時に作句できる' },
  { id: 'contest' as const, label: 'コンテストモード', note: '1人ずつ提出し、他の全員が100点満点で採点する' },
];

export function Setup({
  mode,
  onModeChange,
  initialNames,
  initialDecks,
  online,
  onStart,
  onBack,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  initialNames: string[];
  initialDecks: DeckId[];
  online: boolean;
  onStart: (names: string[], settings: GameSettings) => void;
  onBack: () => void;
}) {
  const [names, setNames] = useState(initialNames);
  const [decks, setDecks] = useState<DeckId[]>(initialDecks);
  const [rounds, setRounds] = useState<number>(3);
  const [confirmingR18, setConfirmingR18] = useState(false);

  const filled = names.map((n) => n.trim()).filter(Boolean);
  const ready = filled.length === names.length && filled.length >= MIN_PLAYERS;

  function setName(i: number, value: string) {
    setNames(names.map((n, j) => (j === i ? value : n)));
  }

  function toggleDeck(id: DeckId) {
    if (id === 'standard') return;
    if (decks.includes(id)) {
      setDecks(decks.filter((d) => d !== id));
      return;
    }
    const deck = DECKS.find((d) => d.id === id)!;
    if (deck.rating === 'r18') {
      setConfirmingR18(true);
      return;
    }
    setDecks([...decks, id]);
  }

  if (confirmingR18) {
    return (
      <div className="col grow" style={{ justifyContent: 'center' }}>
        <div className="panel col">
          <h2>下ネタデッキを入れますか</h2>
          <p className="sub">
            身体・行為・夜の街・修羅場を扱う直球の札が {DECKS.find((d) => d.id === 'spicy')!.count5 +
              DECKS.find((d) => d.id === 'spicy')!.count7}
            枚入ります。同席する全員が了承しているか確認してください。
          </p>
          <button
            className="primary wide"
            onClick={() => {
              setDecks([...decks, 'spicy']);
              setConfirmingR18(false);
            }}
          >
            全員OK。入れる
          </button>
          <button className="ghost wide" onClick={() => setConfirmingR18(false)}>
            やめておく
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="row">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2 className="grow">ゲーム設定</h2>
      </div>

      <div className="lobby-grid lb-setup">
        <div className="panel col lb-mode">
          <h3>モード</h3>
          {MODES.map((m) => (
            <div
              key={m.id}
              className={`deck-option${mode === m.id ? ' on' : ''}`}
              onClick={() => onModeChange(m.id)}
            >
              <div className="check">{mode === m.id ? '✓' : ''}</div>
              <div className="grow">
                <div>{m.label}</div>
                <div className="sub">{m.note}</div>
              </div>
            </div>
          ))}

          {/* ラウンド数選択 (1 〜 5 ラウンド) */}
          <h3 style={{ marginTop: 12 }}>対戦ラウンド数</h3>
          <div className="row" style={{ gap: 6 }}>
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                className={`ghost grow ${rounds === r ? 'primary' : ''}`}
                style={{ padding: '6px 8px', fontSize: 13 }}
                onClick={() => setRounds(r)}
              >
                {r}回
              </button>
            ))}
          </div>
        </div>

        <div className="panel col lb-players">
          <h3>プレイヤー（{MIN_PLAYERS}〜{MAX_PLAYERS}人）</h3>
          <div className="player-list">
            {names.map((n, i) => (
              <input
                key={i}
                type="text"
                value={n}
                placeholder={`${i + 1}人目`}
                onChange={(e) => setName(i, e.target.value)}
              />
            ))}
          </div>
          <div className="row">
            <button
              className="ghost grow"
              disabled={names.length >= MAX_PLAYERS}
              onClick={() => setNames([...names, ''])}
            >
              ＋ 追加
            </button>
            <button
              className="ghost grow"
              disabled={names.length <= MIN_PLAYERS}
              onClick={() => setNames(names.slice(0, -1))}
            >
              − 減らす
            </button>
          </div>
        </div>

        <div className="panel col lb-decks">
          <h3>使う札</h3>
          {DECKS.map((d) => {
            const on = decks.includes(d.id);
            const locked = d.id === 'standard';
            return (
              <div
                key={d.id}
                className={`deck-option${on ? ' on' : ''}${locked ? ' locked' : ''}`}
                onClick={() => toggleDeck(d.id)}
              >
                <div className="check">{on ? '✓' : ''}</div>
                <div className="grow opt-line">
                  <span>{d.label}</span>
                  {d.rating === 'r18' && <span className="badge r18">R18</span>}
                  <span className="sub opt-count">
                    5音{d.count5}／7音{d.count7}
                    {locked && ' ・常に使用'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grow" />
      <button
        className="primary wide"
        disabled={!ready}
        onClick={() =>
          onStart(filled, {
            decks,
            rounds,
            exchangeLimit: 2,
            anonymousSubmission: true,
            revealRaters: true,
            timeLimits: DEFAULT_TIME_LIMITS,
            passAndPlay: !online,
          })
        }
      >
        対戦を開始する（全{rounds}ラウンド）
      </button>
      <p className="sub center">
        交換〜作句 {DEFAULT_TIME_LIMITS.turn / 60}分 ／ 審査・採点 {DEFAULT_TIME_LIMITS.judge / 60}分
      </p>
      {!ready && <p className="sub center">全員の名前を入れてください</p>}
    </>
  );
}
