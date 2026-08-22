/**
 * お気に入りの句。
 *
 * **保存先はそのブラウザの localStorage。** サーバーには置かない。
 * 置くにはアカウントの概念が要るが、このゲームは名前を打つだけで遊べることを
 * 前提にしていて、そこに認証を持ち込むと「部屋のURLを開けば遊べる」が壊れる。
 * 代わりに、部屋が変わってもそのブラウザからは同じ一覧が見える。
 *
 * 効果音（sound.ts）と同じ形にしてある。読めない環境（プライベートモード等）でも
 * その回だけは動く、という壊れ方に揃える。
 */

import type { ArchivedHaiku } from '../net/useRoom';

const KEY = 'senryu.favorites';
/** 上限。眺めるための一覧なので、無制限に貯めても探せなくなるだけ */
export const FAVORITES_MAX = 200;

export type Favorite = {
  /** 同じ句を二度入れないための鍵。作者名と本文から作る */
  id: string;
  upper: string;
  middle: string;
  lower: string;
  authorName: string;
  /** 入れた時刻（ミリ秒）。並べ替えにだけ使う */
  at: number;
};

let items = readStored();
const listeners = new Set<() => void>();

function readStored(): Favorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 手で書き換えられていることも、古い形が残っていることもある。
    // 落ちるより、読めた分だけ拾って先に進むほうがこの機能には合う
    return parsed.filter(isFavorite).slice(0, FAVORITES_MAX);
  } catch {
    return [];
  }
}

function isFavorite(x: unknown): x is Favorite {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.upper === 'string' &&
    typeof o.middle === 'string' &&
    typeof o.lower === 'string' &&
    typeof o.authorName === 'string' &&
    typeof o.at === 'number'
  );
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* 保存できなくてもこの回だけは効かせる */
  }
  for (const fn of listeners) fn();
}

/** 句の同一性。同じ人が同じ句を詠んだら同じもの、として扱う */
export function favoriteId(p: {
  upper: string;
  middle: string;
  lower: string;
  authorName: string;
}): string {
  return `${p.authorName}\u0000${p.upper}\u0000${p.middle}\u0000${p.lower}`;
}

export function favorites(): Favorite[] {
  return items;
}

export function isFavorited(id: string): boolean {
  return items.some((f) => f.id === id);
}

/** 入れる／外すを1つの操作にする。☆を押すたびに切り替わる */
export function toggleFavorite(p: ArchivedHaiku | Favorite): boolean {
  const id = favoriteId(p);
  if (items.some((f) => f.id === id)) {
    items = items.filter((f) => f.id !== id);
    save();
    return false;
  }
  const added: Favorite = {
    id,
    upper: p.upper,
    middle: p.middle,
    lower: p.lower,
    authorName: p.authorName,
    at: Date.now(),
  };
  // 新しいものを先頭に。古いものから溢れさせる
  items = [added, ...items].slice(0, FAVORITES_MAX);
  save();
  return true;
}

export function removeFavorite(id: string): void {
  items = items.filter((f) => f.id !== id);
  save();
}

export function subscribeFavorites(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
