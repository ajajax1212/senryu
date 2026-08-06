import { useState } from 'react';
import { DECKS } from '../engine/cards';
import { DEFAULT_TIME_LIMITS, type DeckId, type GameSettings, type Mode } from '../engine/types';

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

export function Setup({
  mode,
  online,
  onStart,
  onBack,
}: {
  mode: Mode;
  /** オンライン版では名前入力はロビー側が持つのでここでは使わない */
  online: boolean;
  onStart: (names: string[], settings: GameSettings) => void;
  onBack: () => void;
}) {
  const [names, setNames] = useState(['', '', '']);
  const [decks, setDecks] = useState<DeckId[]>(['standard', 'meme']);
  const [confirmingR18, setConfirmingR18] = useState(false);

  const filled = names.map((n) => n.trim()).filter(Boolean);
  const ready = filled.length === names.length && filled.length >= MIN_PLAYERS;

  function setName(i: number, value: string) {
    setNames(names.map((n, j) => (j === i ? value : n)));
  }

  function toggleDeck(id: DeckId) {
    if (id === 'standard') return; // 山札の骨格なので外せない
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
          ←
        </button>
        <h2>{mode === 'dokudan' ? '独断と偏見モード' : 'コンテストモード'}</h2>
      </div>

      <div className="panel col">
        <h3>プレイヤー（{MIN_PLAYERS}〜{MAX_PLAYERS}人）</h3>
        {names.map((n, i) => (
          <input
            key={i}
            type="text"
            value={n}
            placeholder={`${i + 1}人目`}
            onChange={(e) => setName(i, e.target.value)}
          />
        ))}
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

      <div className="panel col">
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
              <div className="grow">
                <div>
                  {d.label} {d.rating === 'r18' && <span className="badge r18">R18</span>}
                </div>
                <div className="sub">
                  5音 {d.count5}枚 ／ 7音 {d.count7}枚{locked && ' ・常に使用'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="primary wide"
        disabled={!ready}
        onClick={() =>
          onStart(filled, {
            decks,
            exchangeLimit: 2,
            anonymousSubmission: true,
            revealRaters: true,
            timeLimits: DEFAULT_TIME_LIMITS,
            passAndPlay: !online,
          })
        }
      >
        はじめる
      </button>
      <p className="sub center">
        交換〜作句 {DEFAULT_TIME_LIMITS.turn / 60}分 ／ 審査・採点 {DEFAULT_TIME_LIMITS.judge / 60}分
      </p>
      {!ready && <p className="sub center">全員の名前を入れてください</p>}
    </>
  );
}
