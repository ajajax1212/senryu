/*
 * 札データを CSV と JSON の間で往復させる。
 *
 *   node scripts/cards-csv.mjs export   data/decks/*.json → data/cards.csv
 *   node scripts/cards-csv.mjs import   data/cards.csv    → data/decks/*.json
 *
 * CSV を編集するときに気にしなくてよいこと:
 *   - mora（音数）は reading から自動計算して入れ直す。手で直す必要はない
 *   - 6音は5音の枠、8音は7音の枠に字余りとして収める。振り分けも自動
 *   - id は空のままでよい。取り込み時に空いている番号を振る
 * 気にすること:
 *   - deck は standard / meme / spicy のどれか
 *   - reading はひらがなと長音符だけ
 *   - 5音の枠に入る札は助詞で終わらせない（idiom に TRUE を入れれば免除）
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countMora, slotFor } from './validate-cards.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deckDir = join(root, 'data/decks');
const csvPath = join(root, 'data/cards.csv');

const COLUMNS = ['deck', 'id', 'mora', 'text', 'reading', 'idiom', 'tags'];

/** CSVの1セル。区切り・引用符・改行を含むなら引用して包む */
function cell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 引用符に対応したCSVパーサ。Excelが吐く形をそのまま読めるようにする */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function loadDecks() {
  return readdirSync(deckDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, ...JSON.parse(readFileSync(join(deckDir, file), 'utf8')) }));
}

// ── 書き出し ──
function exportCsv() {
  const decks = loadDecks();
  const lines = [COLUMNS.join(',')];
  // 読みやすいよう deck → 音数 → id の順に並べる
  const order = { standard: 0, meme: 1, spicy: 2 };
  const all = decks.flatMap((d) => d.cards.map((c) => ({ ...c, deck: d.deck })));
  all.sort(
    (a, b) =>
      (order[a.deck] ?? 9) - (order[b.deck] ?? 9) || a.mora - b.mora || a.id.localeCompare(b.id),
  );
  for (const c of all) {
    // mora 列には読みの実測値を出す。5音の枠に入っている6音の札（字余り）が
    // 一目で分かるように。取り込み時はどのみち読みから数え直す
    lines.push(
      [c.deck, c.id, countMora(c.reading), c.text, c.reading, c.idiom ? 'TRUE' : '', (c.tags ?? []).join(';')]
        .map(cell)
        .join(','),
    );
  }
  // ExcelがUTF-8と分かるようBOMを付ける。付けないと日本語が化ける
  writeFileSync(csvPath, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');

  const byDeck = {};
  for (const c of all) byDeck[c.deck] = (byDeck[c.deck] ?? 0) + 1;
  console.log(`data/cards.csv に ${all.length}枚を書き出しました`);
  for (const [d, n] of Object.entries(byDeck)) console.log(`  ${d}: ${n}枚`);
  console.log('\nExcel やスプレッドシートで開いて編集し、書き戻すには:');
  console.log('  npm.cmd run cards:import');
}

// ── 取り込み ──
function importCsv() {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = rows.shift().map((h) => h.trim());
  const idx = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)]));
  const missing = COLUMNS.filter((c) => c !== 'mora' && idx[c] === -1);
  if (missing.length) {
    console.error(`見出し行に必要な列がありません: ${missing.join(', ')}`);
    process.exit(1);
  }

  const decks = loadDecks();
  const known = new Set(decks.map((d) => d.deck));
  const prefix = { standard: 'm', meme: 'n', spicy: 's' };
  const errors = [];
  const buckets = Object.fromEntries(decks.map((d) => [d.deck, []]));
  const usedIds = new Set();

  rows.forEach((r, i) => {
    const line = i + 2; // 見出し行のぶん
    const get = (k) => (idx[k] === -1 ? '' : (r[idx[k]] ?? '').trim());
    const deck = get('deck');
    const text = get('text');
    const reading = get('reading');

    if (!known.has(deck)) return errors.push(`${line}行目: deck が不明です → "${deck}"`);
    if (!text) return errors.push(`${line}行目: text が空です`);
    if (!/^[ぁ-ゖー]+$/.test(reading)) {
      return errors.push(`${line}行目: reading はひらがなと長音符だけにしてください → "${reading}"`);
    }

    // 音数は必ず読みから数え直す。CSV上の値は参考表示でしかない。
    // 6音は5音の枠へ、8音は7音の枠へ字余りとして収める
    const actual = countMora(reading);
    const mora = slotFor(actual);
    if (mora === null) {
      return errors.push(
        `${line}行目: 「${text}」(${reading}) は ${actual}音です。5〜6音か7〜8音にしてください`,
      );
    }

    let id = get('id');
    if (id && usedIds.has(id)) return errors.push(`${line}行目: id が重複しています → ${id}`);
    if (id) usedIds.add(id);

    buckets[deck].push({
      id,
      mora,
      ...(get('idiom').toUpperCase() === 'TRUE' ? { idiom: true } : {}),
      text,
      reading,
      tags: get('tags').split(';').map((t) => t.trim()).filter(Boolean),
    });
  });

  if (errors.length) {
    console.error(`✗ ${errors.length}件の問題があります。書き戻していません:\n`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  // id が空の札に、そのデッキで空いている番号を振る
  for (const [deck, cards] of Object.entries(buckets)) {
    const counters = { 5: 0, 7: 0 };
    for (const c of cards) {
      if (c.id) continue;
      let id;
      do {
        counters[c.mora] += 1;
        id = `${prefix[deck]}${c.mora}-${String(counters[c.mora]).padStart(3, '0')}`;
      } while (usedIds.has(id));
      c.id = id;
      usedIds.add(id);
    }
    // 5音を先に、その中はid順で並べ直す
    cards.sort((a, b) => a.mora - b.mora || a.id.localeCompare(b.id));
  }

  for (const d of decks) {
    const { file, cards: _old, ...meta } = d;
    const next = { ...meta, cards: buckets[d.deck] };
    writeFileSync(join(deckDir, file), JSON.stringify(next, null, 2) + '\n', 'utf8');
    const c5 = buckets[d.deck].filter((c) => c.mora === 5).length;
    const c7 = buckets[d.deck].length - c5;
    console.log(`${file}: 5音 ${c5} / 7音 ${c7} = ${buckets[d.deck].length}枚`);
  }
  console.log('\n書き戻しました。最後に検証してください:');
  console.log('  npm.cmd run validate');
}

const mode = process.argv[2];
if (mode === 'export') exportCsv();
else if (mode === 'import') importCsv();
else {
  console.error('使い方: node scripts/cards-csv.mjs export|import');
  process.exit(1);
}
