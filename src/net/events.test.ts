import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EV, clampRounds, ROUND_CHOICES } from './events';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * イベント名の食い違いは型でもテストでも捕まらず、ボタンが黙って効かなくなるだけ。
 * 実際に一度、クライアントだけ 'create'、サーバーは 'room:create' という状態で
 * オンライン対戦が全滅した。両側がリテラルを直書きしていないことを機械で見張る。
 */
describe('通信イベント名', () => {
  const server = readFileSync(join(root, 'server/index.ts'), 'utf8');
  const client = readFileSync(join(root, 'src/net/useRoom.ts'), 'utf8');

  it('サーバーは EV 定数だけを購読している', () => {
    const literals = [...server.matchAll(/socket\.on\(\s*'([^']+)'/g)].map((m) => m[1]);
    // connection / disconnect は Socket.IO 組み込みなので対象外
    const builtin = new Set(['connection', 'disconnect']);
    expect(literals.filter((n) => !builtin.has(n))).toEqual([]);
  });

  it('クライアントは EV 定数だけを送っている', () => {
    const literals = [...client.matchAll(/\bemit\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(literals).toEqual([]);
  });

  it('サーバーが購読する EV とクライアントが送る EV が一致する', () => {
    const used = (src: string, re: RegExp) =>
      new Set([...src.matchAll(re)].map((m) => m[1]).filter((k) => k !== 'state'));
    const listens = used(server, /socket\.on\(\s*EV\.(\w+)/g);
    const sends = used(client, /\bemit\(\s*EV\.(\w+)/g);

    // クライアントが送るものは、必ずサーバーが待っている
    for (const k of sends) expect(listens.has(k), `サーバーが EV.${k} を待っていない`).toBe(true);
  });

  it('すべてのイベント名が名前空間付きで一意', () => {
    const names = Object.entries(EV).filter(([k]) => k !== 'state');
    for (const [, v] of names) expect(v).toMatch(/^(room|host|game):/);
    expect(new Set(Object.values(EV)).size).toBe(Object.values(EV).length);
  });
});

describe('ラウンド数の検証', () => {
  it('1〜5だけを通す', () => {
    for (const n of ROUND_CHOICES) expect(clampRounds(n)).toBe(n);
  });

  it('範囲外・整数以外・数値以外は弾く', () => {
    for (const n of [0, 6, 999, -1, 2.5, NaN, '3', null, undefined]) {
      expect(clampRounds(n)).toBeNull();
    }
  });
});
