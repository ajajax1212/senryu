import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { reducer } from '../src/engine/reducer';
import { viewFor } from '../src/engine/view';
import { DEFAULT_TIME_LIMITS, type Action, type DeckId, type Mode } from '../src/engine/types';
import { EV, clampRounds } from '../src/net/events';
import {
  ARCHIVE_MAX,
  type ArchivedHaiku,
  addPlayer,
  createRoom,
  getRoom,
  markDisconnected,
  reattach,
  removeFromLobby,
  sweepIdleRooms,
  type Room,
} from './rooms';

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// ページは1枚だけ。/r/<code> も同じアプリを返し、クライアントがURLから
// 部屋コードを読む。部屋のURLがそのまま招待状になる。
const clientDir = path.join(dir, '..', 'dist');
app.get(['/', '/r/:code'], (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
app.use(express.static(clientDir));

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

/** ロビー情報。ゲーム開始前はこれだけを配る */
function lobbyState(room: Room) {
  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    decks: room.decks,
    // ラウンド数も配る。配らないとホスト以外の画面が既定値のままになり、
    // 「5ラウンドで始めたのに3と表示されている」というズレが出る
    rounds: room.rounds,
    freeCardPerTurn: room.freeCardPerTurn,
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
    started: room.game !== null,
    // 感想戦はロビーに戻ったときだけ見る。ゲーム中まで配ると
    // 1手ごとに数十KBを全員へ送ることになるので、そのときだけ載せる
    archive: room.game ? [] : room.archive,
  };
}

/**
 * 終わった一戦の句を部屋に残す。ロビーで感想戦をするため。
 * 名前はこの時点で解決しておく。あとで誰かが抜けると id から引けなくなる。
 */
function archiveGame(room: Room): void {
  if (!room.game) return;
  const nameOf = (id: string) => room.game!.players.find((p) => p.id === id)?.name ?? '?';
  room.games += 1;
  const added: ArchivedHaiku[] = [];
  for (const r of room.game.history) {
    for (const h of r.submissions) {
      added.push({
        game: room.games,
        mode: r.mode,
        authorName: nameOf(h.authorId),
        upper: h.upper.text,
        middle: h.middle.text,
        lower: h.lower.text,
        // 民主主義は勝者が複数ありうるので winnerIds を見る。
        // ここを winnerId だけで判定していると感想戦で1句も「選」が付かない
        ...((r.mode === 'democracy'
          ? (r.winnerIds ?? []).includes(h.authorId)
          : r.winnerId === h.authorId)
          ? { won: true }
          : {}),
        ...(r.average !== undefined ? { average: r.average } : {}),
      });
    }
  }
  room.archive = [...room.archive, ...added].slice(-ARCHIVE_MAX);
}

/**
 * 全員に同じ状態を送るのではなく、1人ずつ中身を絞って送る。
 * 手札や山札や乱数シードは、通信を覗かれても分からないようここで落とす。
 */
function broadcast(room: Room): void {
  scheduleTimeout(room);
  const lobby = lobbyState(room);
  for (const player of room.players) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit(EV.state, {
      lobby,
      game: room.game ? viewFor(room.game, player.id) : null,
      deadline: room.deadline,
    });
  }
}

/**
 * 制限時間はサーバーが持つ。クライアント側のタイマーに任せると、
 * そのブラウザが閉じられた瞬間に進行が止まって誰も先に進めなくなる。
 */
function scheduleTimeout(room: Room): void {
  const game = room.game;
  const limit =
    game?.phase === 'turn'
      ? game.settings.timeLimits.turn
      : game?.phase === 'judge' || game?.phase === 'rate' || game?.phase === 'vote'
        ? game.settings.timeLimits.judge
        : null;

  // 同じ局面で時計を張り替えると、状態が更新されるたびに残り時間が巻き戻ってしまう
  const key = game && limit ? `${game.turn}:${game.phase}` : null;
  if (key === room.timerKey) return;

  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.timerKey = key;
  room.deadline = null;
  if (!key || !limit) return;

  room.deadline = Date.now() + limit * 1000;
  room.timer = setTimeout(() => {
    room.timer = null;
    room.timerKey = null;
    if (!room.game) return;
    room.game = reducer(room.game, { type: 'TIMEOUT' });
    broadcast(room);
  }, limit * 1000);
}

/**
 * ロビーで誰かが抜けると席番号が振り直される。各接続が覚えている
 * playerId は古いままなので、ここで貼り直す。放置すると残った人の
 * 操作が「参加していません」で弾かれるようになる。
 */
function resyncSeats(room: Room): void {
  for (const player of room.players) {
    if (!player.socketId) continue;
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.data.playerId = player.id;
  }
}

function dispatch(room: Room, action: Action): void {
  if (!room.game) return;
  room.game = reducer(room.game, action);
}

function requireHost(room: Room, socket: Socket, ack?: Ack): boolean {
  if (socket.data.playerId !== room.hostId) {
    ack?.({ ok: false, error: 'ホストのみ操作できます' });
    return false;
  }
  return true;
}

/** 部屋を引くところまでは全ハンドラで同じなので1か所にまとめる */
function withRoom(
  socket: Socket,
  code: string | undefined,
  ack: Ack | undefined,
  fn: (room: Room, playerId: string) => void,
): void {
  const room = getRoom(code);
  if (!room) return ack?.({ ok: false, error: 'このURLの部屋は見つかりませんでした' });
  const playerId = socket.data.playerId as string | undefined;
  if (!playerId) return ack?.({ ok: false, error: '参加していません' });
  fn(room, playerId);
}

io.on('connection', (socket) => {
  const seat = (room: Room, playerId: string) => {
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
  };

  socket.on(EV.create, ({ name }: { name: string }, ack?: Ack) => {
    const trimmed = (name ?? '').trim().slice(0, 12);
    if (!trimmed) return ack?.({ ok: false, error: '名前を入力してください' });
    const room = createRoom();
    const player = addPlayer(room, trimmed, socket.id);
    seat(room, player.id);
    ack?.({ ok: true, code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on(EV.join, ({ code, name }: { code: string; name: string }, ack?: Ack) => {
    const room = getRoom(code);
    if (!room) return ack?.({ ok: false, error: 'このURLの部屋は見つかりませんでした' });
    if (room.game) return ack?.({ ok: false, error: 'このゲームはもう始まっています' });
    if (room.players.length >= 8) return ack?.({ ok: false, error: '定員（8人）に達しています' });
    const trimmed = (name ?? '').trim().slice(0, 12);
    if (!trimmed) return ack?.({ ok: false, error: '名前を入力してください' });

    const player = addPlayer(room, trimmed, socket.id);
    seat(room, player.id);
    ack?.({ ok: true, code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on(EV.rejoin, ({ code, token }: { code: string; token: string }, ack?: Ack) => {
    const room = getRoom(code);
    if (!room) return ack?.({ ok: false, error: 'このURLの部屋は見つかりませんでした' });
    const player = token ? reattach(room, token, socket.id) : null;
    if (!player) return ack?.({ ok: false, error: 'プレイヤー情報が見つかりませんでした' });
    seat(room, player.id);
    ack?.({ ok: true, code: room.code, playerId: player.id, token: player.token });
    broadcast(room);
  });

  socket.on(
    EV.configure,
    (
      {
        code,
        mode,
        decks,
        rounds,
        freeCardPerTurn,
      }: {
        code: string;
        mode?: Mode;
        decks?: DeckId[];
        rounds?: number;
        freeCardPerTurn?: boolean;
      },
      ack?: Ack,
    ) => {
      withRoom(socket, code, ack, (room) => {
        if (!requireHost(room, socket, ack)) return;
        if (room.game) return ack?.({ ok: false, error: 'もう始まっています' });
        if (mode) room.mode = mode;
        if (decks) room.decks = ['standard', ...decks.filter((d) => d !== 'standard')];
        if (freeCardPerTurn !== undefined) room.freeCardPerTurn = Boolean(freeCardPerTurn);
        if (rounds !== undefined) {
          // クライアントの言い値をそのまま入れない。1〜5以外を通すと
          // totalTurns がその数×人数を返し、終わらないゲームができてしまう
          const valid = clampRounds(rounds);
          if (valid === null) return ack?.({ ok: false, error: 'ラウンド数は1〜5で指定してください' });
          room.rounds = valid;
        }
        ack?.({ ok: true });
        broadcast(room);
      });
    },
  );

  /**
   * 切れた人を席から外す。
   *
   * ロビーにいる間だけに限る。ゲーム中に外すと players の並びとエンジンの
   * p0..pn の対応が崩れて盤面ごと壊れるため。
   * 繋がっている人は外せない。追い出しの道具ではなく、落ちた人が席を
   * 占めたまま次を始められなくなるのを解くためのもの。
   */
  socket.on(EV.kick, ({ code, playerId }: { code: string; playerId: string }, ack?: Ack) => {
    withRoom(socket, code, ack, (room) => {
      if (!requireHost(room, socket, ack)) return;
      if (room.game) return ack?.({ ok: false, error: 'ゲーム中は外せません' });
      const target = room.players.find((p) => p.id === playerId);
      if (!target) return ack?.({ ok: false, error: 'その人はもういません' });
      if (target.connected) return ack?.({ ok: false, error: '繋がっている人は外せません' });
      if (target.id === room.hostId) return ack?.({ ok: false, error: 'ホストは外せません' });

      removeFromLobby(room, playerId);
      resyncSeats(room);
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.start, ({ code }: { code: string }, ack?: Ack) => {
    withRoom(socket, code, ack, (room) => {
      if (!requireHost(room, socket, ack)) return;
      if (room.game) return ack?.({ ok: false, error: 'もう始まっています' });
      if (room.players.length < 3) return ack?.({ ok: false, error: '3人以上必要です' });

      room.game = reducer({} as never, {
        type: 'START_GAME',
        mode: room.mode,
        names: room.players.map((p) => p.name),
        settings: {
          decks: room.decks as DeckId[],
          rounds: room.rounds,
          freeCardPerTurn: room.freeCardPerTurn,
          exchangeLimit: 2,
          anonymousSubmission: true,
          revealRaters: true,
          timeLimits: DEFAULT_TIME_LIMITS,
          passAndPlay: false,
        },
      });
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  /**
   * 総合結果からロビーへ戻す。もう一戦するときにモードや札を変えられるよう、
   * 同じ設定で配り直すのではなく設定画面まで巻き戻す。顔ぶれと席はそのまま残る。
   */
  socket.on(EV.toLobby, ({ code }: { code: string }, ack?: Ack) => {
    withRoom(socket, code, ack, (room) => {
      if (!requireHost(room, socket, ack)) return;
      if (!room.game) return ack?.({ ok: false, error: 'まだ始まっていません' });
      if (room.game.phase !== 'gameover') {
        return ack?.({ ok: false, error: 'まだ終わっていません' });
      }
      // 句を残してから捨てる。ロビーで感想戦をするため
      archiveGame(room);
      room.game = null;
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.action, ({ code, action }: { code: string; action: Action }, ack?: Ack) => {
    withRoom(socket, code, ack, (room, playerId) => {
      if (!room.game) return ack?.({ ok: false, error: 'まだ始まっていません' });

      // クライアントが名乗る playerId は信用せず、接続に紐づいた席で上書きする
      const owned: Action =
        'playerId' in action ? ({ ...action, playerId } as Action) : action;

      // 進行系（次のラウンドへ）はホストだけ。ほかは本人の行動として通す
      if (owned.type === 'NEXT_TURN' && !requireHost(room, socket, ack)) return;
      if (owned.type === 'START_GAME' || owned.type === 'TIMEOUT' || owned.type === 'TAKE_SEAT') {
        return ack?.({ ok: false, error: 'この操作はできません' });
      }

      const before = room.game;
      dispatch(room, owned);
      if (room.game === before) return ack?.({ ok: false, error: 'いまその操作はできません' });
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on(EV.leave, ({ code }: { code: string }, ack?: Ack) => {
    withRoom(socket, code, ack, (room, playerId) => {
      removeFromLobby(room, playerId);
      resyncSeats(room);
      socket.leave(room.code);
      socket.data.playerId = undefined;
      ack?.({ ok: true });
      broadcast(room);
    });
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.code);
    if (!room || !socket.data.playerId) return;
    // 開始前ならロビーから消す。開始後は席を残す（時間切れで自動処理される）
    if (room.game) {
      markDisconnected(room, socket.data.playerId);
    } else {
      removeFromLobby(room, socket.data.playerId);
      resyncSeats(room);
    }
    broadcast(room);
  });
});

setInterval(() => sweepIdleRooms(), 30 * 60 * 1000);

// 3300 は ranking-tote が使っているので避ける。本番は Render が PORT を渡す
const PORT = Number(process.env.PORT) || 3400;
httpServer.listen(PORT, () => {
  console.log(`senryu server listening on http://localhost:${PORT}`);
});
