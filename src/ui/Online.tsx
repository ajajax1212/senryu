import { useEffect, useRef, useState } from 'react';
import { DECKS } from '../engine/cards';
import type { DeckId } from '../engine/types';
import { codeFromUrl, useRoom, type Lobby } from '../net/useRoom';
import { Game } from './Game';
import { MODES } from './Setup';
import type { Draft } from './Turn';
import { DeadlineBar } from './parts';

export function Online({ onBack }: { onBack: () => void }) {
  const room = useRoom();
  const [booted, setBooted] = useState(false);
  // useRoom は毎レンダー新しい object を返すので、booted だけを頼りにすると
  // 状態が反映される前に rejoin が何度も飛ぶ。実行済みかを ref で押さえる
  const bootedOnce = useRef(false);
  const [draft, setDraft] = useState<Draft & { key: string }>({ key: '' });

  // URL に部屋コードが入っていれば、まず前の席に戻れるか試す
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

  const turnKey = `${game.round}-${game.phase}`;
  const { key: _key, ...partial } = draft.key === turnKey ? draft : { key: turnKey };

  return (
    <>
      {deadline !== null && <DeadlineBar deadline={deadline} />}
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
          ←
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
            <input type="text" value={code} placeholder="はるかぜ-とら-123" onChange={(e) => setCode(e.target.value)} />
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <h1>{lobby.code}</h1>
      <div className="panel col">
        <h3>このURLを配れば参加できます</h3>
        <div className="invite">{url}</div>
        <button className="ghost wide" onClick={copy}>
          {copied ? 'コピーしました' : 'URLをコピー'}
        </button>
      </div>

      <div className="panel col">
        <h3>参加者（{lobby.players.length}人）</h3>
        {lobby.players.map((p) => (
          <div key={p.id} className="row">
            <span className="grow">
              {p.name}
              {p.id === lobby.hostId && ' 👑'}
              {p.id === room.me && '（あなた）'}
            </span>
            <span className="badge">{p.connected ? '接続中' : '切断'}</span>
          </div>
        ))}
        {lobby.players.length < 3 && <p className="sub">あと{3 - lobby.players.length}人必要です</p>}
      </div>

      <div className="panel col">
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

      <div className="panel col">
        <h3>使う札</h3>
        {DECKS.map((d) => {
          const on = lobby.decks.includes(d.id);
          const locked = d.id === 'standard' || !amHost;
          return (
            <div
              key={d.id}
              className={`deck-option${on ? ' on' : ''}${locked ? ' locked' : ''}`}
              onClick={() => {
                if (locked) return;
                const next = on ? lobby.decks.filter((x) => x !== d.id) : [...lobby.decks, d.id];
                room.configure({ decks: next as DeckId[] });
              }}
            >
              <div className="check">{on ? '✓' : ''}</div>
              <div className="grow">
                <div>
                  {d.label} {d.rating === 'r18' && <span className="badge r18">R18</span>}
                </div>
                <div className="sub">
                  5音 {d.count5}枚 ／ 7音 {d.count7}枚{d.id === 'standard' && ' ・常に使用'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grow" />
      {amHost ? (
        <button className="primary wide" disabled={lobby.players.length < 3} onClick={room.startGame}>
          はじめる
        </button>
      ) : (
        <p className="sub center">ホストが開始するのを待っています</p>
      )}
      {room.error && <p className="error">{room.error}</p>}
    </>
  );
}
