import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { PlayerView } from '../engine/view';
import type { Action, DeckId, Mode } from '../engine/types';

export type Lobby = {
  code: string;
  hostId: string | null;
  mode: Mode;
  decks: DeckId[];
  rounds?: number;
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

export function codeFromUrl(): string | null {
  const m = location.pathname.match(/^\/r\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function saveSeat(code: string, token: string) {
  sessionStorage.setItem(`senryu:${code}`, token);
}
function loadSeat(code: string): string | null {
  return sessionStorage.getItem(`senryu:${code}`);
}

export function useRoom() {
  const [state, setState] = useState<ServerState | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const currentCode = useRef<string | null>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', (s: ServerState) => {
      setState(s);
      setError(null);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = useCallback((event: string, payload: unknown): Promise<Ack> => {
    return new Promise((resolve) => {
      if (!socketRef.current) return resolve({ ok: false, error: '未接続' });
      socketRef.current.emit(event, payload, (ack: Ack) => resolve(ack ?? { ok: true }));
    });
  }, []);

  const create = useCallback(
    async (name: string) => {
      const ack = await emit('create', { name });
      if (!ack.ok) return setError(ack.error!);
      const code = ack.code as string;
      const token = ack.token as string;
      currentCode.current = code;
      saveSeat(code, token);
      setMe(ack.playerId as string);
      history.replaceState(null, '', `/r/${code}`);
    },
    [emit],
  );

  const join = useCallback(
    async (code: string, name: string) => {
      const ack = await emit('join', { code, name });
      if (!ack.ok) return setError(ack.error!);
      currentCode.current = code;
      saveSeat(code, ack.token as string);
      setMe(ack.playerId as string);
      history.replaceState(null, '', `/r/${code}`);
    },
    [emit],
  );

  const rejoin = useCallback(
    async (code: string) => {
      const token = loadSeat(code);
      if (!token) return;
      const ack = await emit('rejoin', { code, token });
      if (!ack.ok) {
        sessionStorage.removeItem(`senryu:${code}`);
        history.replaceState(null, '', '/');
        return;
      }
      currentCode.current = code;
      setMe(ack.playerId as string);
    },
    [emit],
  );

  const configure = useCallback(
    async (opts: { mode?: Mode; decks?: DeckId[]; rounds?: number }) => {
      const ack = await emit('configure', opts);
      if (!ack.ok) setError(ack.error!);
    },
    [emit],
  );

  const startGame = useCallback(async () => {
    const ack = await emit('start', {});
    if (!ack.ok) setError(ack.error!);
  }, [emit]);

  const send = useCallback(
    async (action: Action) => {
      const ack = await emit('action', action);
      if (!ack.ok) setError(ack.error!);
    },
    [emit],
  );

  const toLobby = useCallback(async () => {
    const ack = await emit('toLobby', {});
    if (!ack.ok) setError(ack.error!);
  }, [emit]);

  return {
    connected,
    state,
    me,
    error,
    create,
    join,
    rejoin,
    configure,
    startGame,
    send,
    toLobby,
  };
}
