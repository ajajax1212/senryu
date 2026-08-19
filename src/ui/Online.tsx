import { useEffect, useRef, useState } from 'react';
import { DECKS } from '../engine/cards';
import type { DeckId } from '../engine/types';
import { codeFromUrl, useRoom, type Lobby } from '../net/useRoom';
import { ROUND_CHOICES } from '../net/events';
import { Game } from './Game';
import { MODES } from './Setup';
import type { Draft } from './Turn';
import { DeadlineBar } from './parts';

export function Online({ onBack }: { onBack: () => void }) {
  const room = useRoom();
  const [booted, setBooted] = useState(false);
  const bootedOnce = useRef(false);
  const [draft, setDraft] = useState<Draft & { key: string }>({ key: '' });

  useEffect(() => {
    if (bootedOnce.current || !room.connected) return;
    bootedOnce.current = true;
    const urlCode = codeFromUrl();
    if (urlCode) room.rejoin(urlCode).finally(() => setBooted(true));
    else setBooted(true);
  }, [booted, room]);

  if (!room.connected) return <p className="sub center">サーバーに接続中…</p>;
  if (!booted) return <p className="sub center">部屋を確認中…</p>;

  if (!room.me || !room.state) {
    return <JoinScreen room={room} onBack={onBack} initialCode={codeFromUrl() ?? ''} />;
  }

  const { lobby, game, deadline } = room.state;
  if (!game) return <LobbyScreen room={room} lobby={lobby} />;

  const turnKey = `${game.turn}-${game.phase}`;
  const { key: _key, ...partial } = draft.key === turnKey ? draft : { key: turnKey };

  return (
    <>
      {deadline !== null && (
        // 審査・採点は2分、作句は5分。総時間を渡さないとバーが40%から始まる
        <DeadlineBar
          deadline={deadline}
          total={
            game.phase === 'judge' || game.phase === 'rate'
              ? (game.settings.timeLimits.judge ?? 120)
              : (game.settings.timeLimits.turn ?? 300)
          }
        />
      )}
      {room.error && <p className="error">{room.error}</p>}
      <Game
        s={game}
        me={game.me}
        board={game.board}
        draft={partial}
        setDraft={(d) => setDraft({ ...d, key: turnKey })}
        dispatch={(a) => room.send(a)}
        canAdvance={lobby.hostId === game.me}
        onReplay={room.toLobby}
      />
    </>
  );
}

function JoinScreen({
  room,
  onBack,
  initialCode,
}: {
  room: ReturnType<typeof useRoom>;
  onBack: () => void;
  initialCode: string;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode);
  const joining = initialCode !== '';

  return (
    <>
      <div className="row">
        <button className="ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h2 className="grow">オンライン対戦</h2>
      </div>

      <div className="panel col">
        <h3>ニックネーム</h3>
        <input type="text" value={name} maxLength={12} placeholder="12文字まで" onChange={(e) => setName(e.target.value)} />
      </div>

      {joining ? (
        <>
          <p className="sub center">部屋「{code}」に参加します</p>
          <button className="primary wide" disabled={!name.trim()} onClick={() => room.join(code, name)}>
            参加する
          </button>
        </>
      ) : (
        <>
          <button className="primary wide" disabled={!name.trim()} onClick={() => room.create(name)}>
            部屋を作る
          </button>
          <div className="panel col">
            <h3>部屋コードで参加</h3>
            <input type="text" value={code} placeholder="例: はるかぜ-とら-123" onChange={(e) => setCode(e.target.value)} />
            <button className="ghost wide" disabled={!name.trim() || !code.trim()} onClick={() => room.join(code, name)}>
              参加する
            </button>
          </div>
        </>
      )}

      {room.error && <p className="error">{room.error}</p>}
    </>
  );
}

function LobbyScreen({ room, lobby }: { room: ReturnType<typeof useRoom>; lobby: Lobby }) {
  const amHost = lobby.hostId === room.me;
  const url = `${location.origin}/r/${lobby.code}`;
  const [copied, setCopied] = useState(false);
  // R18を入れるときは1台版と同じく一度確認を挟む（SPEC 3.3）。
  // ホストの操作が全員の山札を変えるので、むしろオンラインのほうが要る
  const [confirmingR18, setConfirmingR18] = useState(false);
  // ラウンド数はサーバーが持つ値をそのまま描く。ここでローカルに控えると
  // ホスト以外の画面が更新されず、選んだ数と表示がずれる
  const rounds = lobby.rounds;

  function toggleDeck(id: DeckId, on: boolean) {
    const deck = DECKS.find((d) => d.id === id)!;
    if (!on && deck.rating === 'r18') return setConfirmingR18(true);
    const next = on ? lobby.decks.filter((x) => x !== id) : [...lobby.decks, id];
    room.configure({ decks: next as DeckId[] });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (confirmingR18) {
    const spicy = DECKS.find((d) => d.id === 'spicy')!;
    return (
      <div className="col grow confirm-stage">
        <div className="panel col">
          <h2>下ネタデッキを入れますか</h2>
          <p className="sub">
            身体・行為・夜の街・修羅場を扱う直球の札が {spicy.count5 + spicy.count7}
            枚入ります。参加者全員が了承しているか確認してください。
          </p>
          <button
            className="primary wide"
            onClick={() => {
              room.configure({ decks: [...lobby.decks, 'spicy'] as DeckId[] });
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
      <div className="label-mark centered">部屋コード</div>
      <h1 className="lobby-code">{lobby.code}</h1>

      <div className="lobby-grid lb-online">
        <div className="panel col lb-invite">
          <h3>招待URL</h3>
          <div className="row">
            <div className="invite grow">{url}</div>
            <button className="ghost" onClick={copy}>
              {copied ? 'コピー済' : 'コピー'}
            </button>
          </div>
        </div>

        <div className="panel col lb-players">
          <h3>参加者（{lobby.players.length}人）</h3>
          <div className="player-list">
            {lobby.players.map((p) => (
              <div key={p.id} className="row">
                <span className="grow">
                  {p.name}
                  {p.id === lobby.hostId && ' 👑'}
                  {p.id === room.me && '（あなた）'}
                </span>
                {!p.connected && <span className="badge">切断</span>}
              </div>
            ))}
          </div>
          {lobby.players.length < 3 && <p className="sub">あと{3 - lobby.players.length}人必要です</p>}
        </div>

        <div className="panel col lb-mode">
          <h3>モード</h3>
          {MODES.map((m) => (
            <div
              key={m.id}
              className={`deck-option${lobby.mode === m.id ? ' on' : ''}${amHost ? '' : ' locked'}`}
              onClick={() => amHost && room.configure({ mode: m.id })}
            >
              <div className="check">{lobby.mode === m.id ? '✓' : ''}</div>
              <div className="grow">
                <div>{m.label}</div>
                <div className="sub">{m.note}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="panel col lb-rounds">
          <h3>対戦ラウンド数</h3>
          <div className="round-selector-row">
            {ROUND_CHOICES.map((r) => (
              <button
                key={r}
                className={`round-btn${rounds === r ? ' active' : ''}`}
                disabled={!amHost}
                onClick={() => amHost && room.configure({ rounds: r })}
              >
                <span className="num">{r}</span>
                <span className="unit">ラウンド</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel col lb-decks">
          <h3>使う札</h3>
          {DECKS.map((d) => {
            const on = lobby.decks.includes(d.id);
            const locked = d.id === 'standard' || !amHost;
            return (
              <div
                key={d.id}
                className={`deck-option${on ? ' on' : ''}${locked ? ' locked' : ''}`}
                onClick={() => !locked && toggleDeck(d.id, on)}
              >
                <div className="check">{on ? '✓' : ''}</div>
                <div className="grow opt-line">
                  <span>{d.label}</span>
                  {d.rating === 'r18' && <span className="badge r18">R18</span>}
                  <span className="sub opt-count">
                    5音{d.count5}／7音{d.count7}
                    {d.id === 'standard' && ' ・常に使用'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grow" />
      {amHost ? (
        <button className="primary wide" disabled={lobby.players.length < 3} onClick={room.startGame}>
          対戦を開始する
        </button>
      ) : (
        <p className="sub center">ホストが対戦を開始するのを待っています</p>
      )}
      {room.error && <p className="error">{room.error}</p>}
    </>
  );
}
