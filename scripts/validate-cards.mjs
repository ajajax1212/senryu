// 全デッキの札を検証する（モーラ数・ID重複・読みの重複・表記）。
// 実行: node scripts/validate-cards.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deckDir = join(root, 'data/decks');

// 拗音は直前のかなと合わせて1モーラ。促音・撥音・長音は1モーラ。
const SMALL_KANA = new Set('ゃゅょぁぃぅぇぉゎ');
const HIRAGANA = /^[ぁ-ゖー]+$/;

// 5音札の末尾に来てはいけない助詞。名詞末尾にもよく現れる「と」「に」「で」「も」は
// 誤検出が多すぎるので入れない（「過去の人」「潮の跡」など）。長いものから順に判定する。
const TRAILING_PARTICLES = ['には', 'では', 'でも', 'にも', 'より', 'まで', 'から', 'とか', 'ので', 'のに', 'を', 'が', 'は', 'へ'];

// 表記と読みの食い違いを見つけるための、末尾に来がちなかな1文字
const KANA_PARTICLES = new Set(['で', 'に', 'と', 'も', 'を', 'が', 'は', 'へ', 'の', 'て']);

// 上のルールに引っかかるが名詞として正しい読みの例外。増えたらここに足す。
const NOUN_EXCEPTIONS = new Set([
  'ひんにゅうは', // 貧乳派
  'しょうすうは', // 少数派。「〜派」は助詞の「は」ではなく名詞の一部
  'えろどうが',   // エロ動画
]);

export function countMora(reading) {
  let n = 0;
  for (const ch of reading) if (!SMALL_KANA.has(ch)) n++;
  return n;
}

/**
 * 実際のモーラ数から、その札が入る枠（5音の位置か7音の位置か）を返す。
 * 1モーラだけ多い札は「字余り」として上の枠に収める。6音を5音の位置に、
 * 8音を7音の位置に置いても口に出したときのリズムは崩れないため。
 * 収まらなければ null。
 */
export function slotFor(mora) {
  if (mora === 5 || mora === 6) return 5;
  if (mora === 7 || mora === 8) return 7;
  return null;
}

/** 全デッキを検証する。問題があれば説明の配列を返す */
export function validateAll() {
const errors = [];
const seenIds = new Map();
const seenReadings = new Map();
const summary = [];

for (const file of readdirSync(deckDir).filter((f) => f.endsWith('.json')).sort()) {
  const deck = JSON.parse(readFileSync(join(deckDir, file), 'utf8'));
  const { cards } = deck;

  for (const card of cards) {
    const where = `[${deck.deck}] ${card.id} 「${card.text}」(${card.reading})`;

    const dupId = seenIds.get(card.id);
    if (dupId) errors.push(`ID重複: ${where} と ${dupId}`);
    seenIds.set(card.id, where);

    if (!HIRAGANA.test(card.reading)) {
      errors.push(`読みがひらがな+長音以外を含む: ${where}`);
      continue;
    }
    if (card.mora !== 5 && card.mora !== 7) {
      errors.push(`moraは5か7のみ: ${where}`);
    }

    // mora は「どちらの枠に置く札か」であって、読みの実測値とは限らない。
    // 字余り（枠+1モーラ）まで許す。それ以上ずれていれば読みか mora のどちらかが誤り
    const actual = countMora(card.reading);
    if (slotFor(actual) !== card.mora) {
      errors.push(`モーラ数が枠に合わない: ${where} → 枠 ${card.mora} / 実際 ${actual}`);
    }

    // 読みの重複は同一デッキ内だけでなく全デッキ横断で禁止する。
    // 同じ札が2枚あると「山札に1枚ずつ」の前提が崩れるため。
    const dupReading = seenReadings.get(card.reading);
    if (dupReading) errors.push(`読みが重複: ${where} と ${dupReading}`);
    seenReadings.set(card.reading, where);

    // 表記の末尾がかなの助詞なのに読みの末尾が違う＝どちらかの打ち間違い。
    // CSVで表記だけ直して読みを直し忘れると、画面には「〜で」と出るのに
    // 音数は助詞を数えないまま通ってしまうので機械で拾う
    const tailKana = [...card.text].pop();
    if (KANA_PARTICLES.has(tailKana) && [...card.reading].pop() !== tailKana) {
      errors.push(`表記と読みの末尾が食い違う: ${where} → 表記は「${tailKana}」で終わっている`);
    }

    // 5音札は上の句にも下の句にも置ける必要があるので、助詞で終わってはいけない。
    // 「〜が」「〜を」で終わる札は上の句にしか置けず、順不同という前提が壊れる。
    // idiom:true の札（「知らんけど」「草生える」など）は語形こそ述語だが一語の
    // 決まり文句として機能し、体言止めの位置でも句が閉じるので免除する。
    if (card.mora === 5 && !card.idiom && !NOUN_EXCEPTIONS.has(card.reading)) {
      const tail = TRAILING_PARTICLES.find((p) => card.reading.endsWith(p));
      if (tail) errors.push(`5音札が助詞「${tail}」で終わっている（名詞句にすること）: ${where}`);
    }
  }

  summary.push({
    deck: deck.deck,
    label: deck.label,
    rating: deck.rating,
    '5音': cards.filter((c) => c.mora === 5).length,
    '7音': cards.filter((c) => c.mora === 7).length,
    字余り: cards.filter((c) => countMora(c.reading) > c.mora).length,
    合計: cards.length,
  });
}

  return { errors, summary, total: seenIds.size };
}

// 直接実行されたときだけ結果を表示する。
// 他のスクリプトから countMora を import しても検証が走らないよう分けてある
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, summary, total } = validateAll();
  console.table(summary);
  console.log(`総計: ${total}枚`);

  if (errors.length) {
    console.error(`\n✗ ${errors.length}件のエラー:`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('✓ 全デッキの検証に成功しました');
}
