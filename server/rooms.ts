import type { GameState, Mode } from '../src/engine/types';

export type RoomPlayer = {
  /** エンジン側の players 配列の位置に対応する。p0, p1, ... */
  id: string;
  name: string;
  socketId: string | null;
  connected: boolean;
};

export type Room = {
  code: string;
  hostId: string | null;
  /** 席順。この並びがそのままエンジンの players の並びになる */
  players: RoomPlayer[];
  mode: Mode;
  decks: string[];
  game: GameState | null;
  /** 制限時間切れを発火させるハンドル。サーバー側で持つ */
  timer: ReturnType<typeof setTimeout> | null;
  /** 現在の時計が何に対するものか。張り替えの要否を判断する */
  timerKey: string | null;
  /** 時間切れになる時刻（epoch ms）。クライアントはこれを見て残り時間を描く */
  deadline: number | null;
  lastTouched: number;
};

const rooms = new Map<string, Room>();

// 部屋のURLがそのまま招待状になるので、打ち込む短縮コードではなく
// 口頭で伝えられる語呂のよいスラッグにする。
const HEAD = ['はるかぜ', 'なつのうみ', 'あきぞら', 'ふゆのあさ', 'つきあかり', 'ゆうやけ', 'よあけ', 'しぐれ'];
const TAIL = ['とら', 'つばめ', 'きつね', 'おおかみ', 'たか', 'くじら', 'かわうそ', 'ふくろう'];

function makeCode(): string {
  for (;;) {
    const head = HEAD[Math.floor(Math.random() * HEAD.length)];
    const tail = TAIL[Math.floor(Math.random() * TAIL.length)];
    const code = `${head}-${tail}-${Math.floor(100 + Math.random() * 900)}`;
    if (!rooms.has(code)) return code;
  }
}

export function createRoom(): Room {
  const room: Room = {
    code: makeCode(),
    hostId: null,
    players: [],
    mode: 'dokudan',
    decks: ['standard', 'meme'],
    game: null,
    timer: null,
    timerKey: null,
    deadline: null,
    lastTouched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code: string | undefined): Room | undefined {
  const room = rooms.get(code ?? '');
  if (room) room.lastTouched = Date.now();
  return room;
}

export function addPlayer(room: Room, name: string, socketId: string): RoomPlayer {
  // idは席順そのもの。エンジンが START_GAME で振る p0..pn と一致させる必要がある
  const player: RoomPlayer = { id: `p${room.players.length}`, name, socketId, connected: true };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

/** リロードして戻ってきたタブを、新しいプレイヤーを作らずに元の席へ繋ぎ直す */
export function reattach(room: Room, playerId: string, socketId: string): RoomPlayer | null {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return null;
  player.socketId = socketId;
  player.connected = true;
  return player;
}

export function markDisconnected(room: Room, playerId: string): void {
  const player = room.players.find((p) => p.id === playerId);
  if (player) {
    player.connected = false;
    player.socketId = null;
  }
}

/**
 * ロビーで抜けた人を席から外す。開始後は席順とエンジンの players が対応しなくなるので消さない
 * （落ちた人は connected:false のまま残し、時間切れで自動処理させる）。
 */
export function removeFromLobby(room: Room, playerId: string): void {
  if (room.game) return;
  room.players = room.players.filter((p) => p.id !== playerId);
  room.players.forEach((p, i) => (p.id = `p${i}`));
  if (room.hostId === playerId) room.hostId = room.players[0]?.id ?? null;
}

/** 誰も繋いでいない部屋を掃除する。放っておくとメモリに溜まり続けるため */
export function sweepIdleRooms(maxAgeMs = 6 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const alive = room.players.some((p) => p.connected);
    if (!alive && now - room.lastTouched > maxAgeMs) {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(code);
    }
  }
}

export function roomCount(): number {
  return rooms.size;
}
