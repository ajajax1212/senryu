import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { PlayerView } from '../engine/view';
import type { Action, DeckId, Mode } from '../engine/types';
import { EV } from './events';

export type Lobby = {
  code: string;
  hostId: string | null;
  mode: Mode;
  decks: DeckId[];
  /** ホストが選んだ対戦ラウンド数。サーバーが配るので全員が同じ値を見る */
  rounds: number;
  players: { id: string; name: string; connected: boolean }[];
  started: boolean;
};

export type ServerState = {
  lobby: Lobby;
  game: PlayerView | null;
  /** 時間切れになる時刻(epoch ms)。時計はサーバーが持つ */
  deadline: number | null;
};

type Ack = { ok: boolean; error?: string; [k: string]: unknown };

/** URL の /r/<code> が招待状そのもの */
export function codeFromUrl(): string | null {
  const m = location.pathname.match(/^\/r\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * localStorage ではなく sessionStorage を使う。localStorage は同じブラウザの
 * 全タブで共有されるので、2つ目のタブを開くと1つ目の席を乗っ取ってしまう。
 */
function saveSeat(code: string, token: string) {
  sessionStorage.setItem(`senryu:${code}`, token);
}
function loadSeat(code: string): string | null {
  return sessionStorage.getItem(`senryu:${code}`);
}

export function useRoom() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<ServerState | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(EV.state, (s: ServerState) => {
      setState(s);
      // 状態が届いたということは通信は生きている。古い失敗表示を残さない
      setError(null);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /**
   * ack が返らないケース（サーバーが落ちている／再接続中／イベント名の取り違え）でも
   * ボタンが押しっぱなしに見えないよう、必ず時間で打ち切る。
   * 応答が無いことは成功ではないので、失敗として返す。
   */
  const emit = useCallback((event: string, payload: unknown, timeoutMs = 6000): Promise<Ack> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket) return resolve({ ok: false, error: '接続していません' });
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ ok: false, error: 'サーバーから応答がありません。再読み込みしてください。' });
      }, timeoutMs);
      socket.emit(event, payload, (res: Ack) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res ?? { ok: false, error: '応答がありません' });
      });
    });
  }, []);

  const enter = useCallback((res: Ack) => {
    const c = res.code as string;
    setCode(c);
    setMe(res.playerId as string);
    // 席に戻るための合鍵。IDではなくこれを保存する
    saveSeat(c, res.token as string);
    history.replaceState(null, '', `/r/${c}`);
  }, []);

  const create = useCallback(
    async (name: string) => {
      setError(null);
      const res = await emit(EV.create, { name });
      if (!res.ok) return setError(res.error ?? '作成できませんでした');
      enter(res);
    },
    [emit, enter],
  );

  const join = useCallback(
    async (joinCode: string, name: string) => {
      setError(null);
      const res = await emit(EV.join, { code: joinCode, name });
      if (!res.ok) return setError(res.error ?? '参加できませんでした');
      enter(res);
    },
    [emit, enter],
  );

  /** リロードで戻ってきたときに元の席へ繋ぎ直す */
  const rejoin = useCallback(
    async (roomCode: string) => {
      const seat = loadSeat(roomCode);
      if (!seat) return false;
      const res = await emit(EV.rejoin, { code: roomCode, token: seat });
      if (!res.ok) {
        // 席が無くなっている。合鍵を捨てて参加画面からやり直させる
        sessionStorage.removeItem(`senryu:${roomCode}`);
        return false;
      }
      enter(res);
      return true;
    },
    [emit, enter],
  );

  const configure = useCallback(
    async (patch: { mode?: Mode; decks?: DeckId[]; rounds?: number }) => {
      const res = await emit(EV.configure, { code, ...patch });
      if (!res.ok) setError(res.error ?? '設定を変更できませんでした');
    },
    [emit, code],
  );

  const startGame = useCallback(async () => {
    const res = await emit(EV.start, { code });
    if (!res.ok) setError(res.error ?? '開始できませんでした');
  }, [emit, code]);

  /** 総合結果からロビーへ戻る。モードや札を変えてもう一戦するため */
  const toLobby = useCallback(async () => {
    const res = await emit(EV.toLobby, { code });
    if (!res.ok) setError(res.error ?? '戻れませんでした');
  }, [emit, code]);

  const send = useCallback(
    async (action: Action) => {
      const res = await emit(EV.action, { code, action });
      if (!res.ok && res.error) setError(res.error);
    },
    [emit, code],
  );

  return { state, me, code, error, connected, create, join, rejoin, configure, startGame, toLobby, send, setError };
}
