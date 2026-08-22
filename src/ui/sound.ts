/**
 * 効果音。
 *
 * 生音源（`public/sfx/*.mp3`）を鳴らし、読めなかったときだけ Web Audio の
 * 合成音に落ちる。出どころは効果音ラボ（商用無料・クレジット不要）。
 * FAQ で「アプリに同梱して GitHub で公開するのは再配布とみなさない」と
 * 明記されているので、音源ファイルをリポジトリに置いてよい。
 * ただし**直リンクは禁止**なので、必ず自分のところから配る（だから public/ に置く）。
 *
 * **ページを開いただけでは1バイトも読まない。** 音を入れる操作をした人が
 * 初めてトグルを押したときにまとめて取りに行く。部屋に入った直後の
 * 一番大事な数秒でネットワークを取り合わない、という元の方針は変えていない。
 *
 * **合成音は消さない。** 取得に失敗しても・オフラインでも鳴るようにするため、
 * 下の tone / noise / taiko と `synth()` は fallback として残してある。
 *
 * **既定はオフ。** 音の好みは割れるうえ、通話しながら遊ぶことが多いので、
 * 黙って鳴り出すほうが害が大きい。明示的に入れた人にだけ鳴らす。
 */

const KEY = 'senryu.sfx';

export type SfxName =
  /** 札を置く／外す。木の札が触れる音 */
  | 'place'
  /** 交換で札を手放す。紙が擦れる音 */
  | 'toss'
  /** 交換で札を引く */
  | 'draw'
  /** 提出。判を押す直前の「ぽん」 */
  | 'submit'
  /** 発表の幕開け。太鼓の二つ打ち（ドドン） */
  | 'chime'
  /** 落款が押される。低い一撃 */
  | 'stamp'
  /** 総合結果。短い上昇音 */
  | 'fanfare';

/**
 * 音源ごとの鳴らし方。
 *
 * `gain` は「狙いのピーク ÷ その音源の実測ピーク」で出した値。生音源は素の
 * ピークがまちまち（0.35〜0.65）なので、同じ数字を掛けると音ごとに大きさが
 * 揃わない。ブラウザで decode して測った実測値から逆算してある。
 *
 * `at` はその音源の頭にある無音を飛ばす秒数。押した瞬間に鳴ってほしい音で
 * 数十ms待たされると、反応が鈍いように感じる。
 *
 * `dur` / `fade` は長すぎる音源を切り詰めるため。素材をそのまま鳴らすと
 * 次の操作に被る場合だけ入れている。
 */
type SfxSpec = {
  /** 実測ピーク（0〜1）。gain を見直すときの根拠として残す */
  peak: number;
  gain: number;
  at?: number;
  dur?: number;
  fade?: number;
};

const SFX: Record<SfxName, SfxSpec> = {
  // カードを台の上に出す（0.46秒）
  place: { peak: 0.467, gain: 0.214 },
  // カードをきる1（4.98秒）。シャッフル全体は長すぎるので、
  // 手放した一瞬だけを切り出す。最後まで鳴らすと次の操作に被る
  toss: { peak: 0.402, gain: 0.249, at: 0.09, dur: 0.45, fade: 0.12 },
  // カードをめくる（0.45秒）。頭に30msの無音がある
  draw: { peak: 0.37, gain: 0.27, at: 0.03 },
  // 決定ボタン「ポン」（1.0秒）
  submit: { peak: 0.481, gain: 0.27 },
  // 和太鼓でドン（3.35秒）。1.85秒後に落款の小鼓が入るので、
  // そこへ残響が伸びて被らないよう手前で抜く
  chime: { peak: 0.345, gain: 0.45, dur: 1.8, fade: 0.5 },
  // 小鼓（0.97秒）
  stamp: { peak: 0.651, gain: 0.338 },
  // ドーン（2.47秒）。密度があって同じピークでも大きく聞こえるので、
  // 他より深めに絞る。総合結果は一番派手でよいが、ここだけ浮くと耳につく
  fanfare: { peak: 0.461, gain: 0.22, at: 0.015 },
};

/**
 * 全体の音量。生音源は合成音より密度があって同じピークでも大きく聞こえるので、
 * ここで一段落とす。音量の調整はまずこの数字だけ動かす
 */
const MASTER = 0.75;

const FILES = '/sfx/';

let enabled = readStored();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let loading: Promise<void> | null = null;
/** 音源の読み込みが終わったか。終わる前は合成音に落とさない（下の play を見よ） */
let ready = false;
const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    // プライベートモード等で localStorage が触れないことがある。音は無くても遊べる
    return false;
  }
}

export function sfxEnabled(): boolean {
  return enabled;
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* 保存できなくてもこの回だけは効かせる */
  }
  // 入れた合図に1音鳴らす。無音のままだと音量が適正か分からない。
  // 音源を読み終えてから鳴らす。先に鳴らすと1音目だけ合成音になって、
  // 「入れた音」と「実際に鳴る音」が食い違う
  if (on) void load().then(() => play('place'));
  for (const fn of listeners) fn();
}

export function subscribeSfx(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * AudioContext は最初に鳴らすときまで作らない。
 * ページを開いただけで作るとブラウザに suspended のまま抱えられ、
 * 「音を出さない人のために黙って資源を持つ」ことになる。
 */
function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 合成音も生音源も、音量調整を一か所に通すため必ずここへ挿す */
function out(ac: AudioContext): AudioNode {
  return master ?? ac.destination;
}

/**
 * 音源をまとめて読む。
 *
 * 1つ失敗しても他は鳴らしたいので、Promise.all では待たずに1本ずつ握り潰す。
 * 落ちたものは buffers に入らないので、その音だけ自動的に合成音に落ちる。
 */
function load(): Promise<void> {
  if (loading) return loading;
  const ac = audio();
  if (!ac) return Promise.resolve();

  loading = Promise.all(
    (Object.keys(SFX) as SfxName[]).map(async (name) => {
      try {
        const res = await fetch(`${FILES}${name}.mp3`);
        if (!res.ok) return;
        buffers.set(name, await ac.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // 読めなければ合成音で鳴る。ここで止める理由はない
      }
    }),
  ).then(() => {
    ready = true;
  });
  return loading;
}

/** 単発の音。type と周波数の滑り、長さ、音量だけで作る */
function tone(
  ac: AudioContext,
  opt: { type: OscillatorType; from: number; to?: number; dur: number; gain: number; at?: number },
): void {
  const t0 = ac.currentTime + (opt.at ?? 0);
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = opt.type;
  osc.frequency.setValueAtTime(opt.from, t0);
  if (opt.to !== undefined) osc.frequency.exponentialRampToValueAtTime(opt.to, t0 + opt.dur);
  // 立ち上がりを0にすると「プツッ」と鳴るので、2msだけ持ち上げてから落とす
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(opt.gain, t0 + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
  osc.connect(amp).connect(out(ac));
  osc.start(t0);
  osc.stop(t0 + opt.dur + 0.02);
}

/** 紙や布の擦れ。正弦波では作れないのでホワイトノイズを帯域で削る */
function noise(ac: AudioContext, opt: { dur: number; freq: number; q: number; gain: number; at?: number }): void {
  const t0 = ac.currentTime + (opt.at ?? 0);
  const frames = Math.max(1, Math.floor(ac.sampleRate * opt.dur));
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = opt.freq;
  bp.Q.value = opt.q;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(opt.gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
  src.connect(bp).connect(amp).connect(out(ac));
  src.start(t0);
}

/** 太鼓の一打。胴の鳴りと皮の当たりを重ねる */
function taiko(
  ac: AudioContext,
  opt: { at: number; gain: number; from: number; to: number; dur: number },
): void {
  tone(ac, { type: 'sine', from: opt.from, to: opt.to, dur: opt.dur, gain: opt.gain, at: opt.at });
  // 倍音を少しだけ足すと「ボッ」ではなく「ドッ」になる
  tone(ac, {
    type: 'triangle',
    from: opt.from * 2,
    to: opt.to * 2,
    dur: opt.dur * 0.35,
    gain: opt.gain * 0.3,
    at: opt.at,
  });
  noise(ac, { dur: 0.06, freq: 320, q: 0.5, gain: opt.gain * 0.5, at: opt.at });
}

/** 生音源を1発鳴らす。頭の無音を飛ばし、長い素材は途中で絞る */
function playBuffer(ac: AudioContext, name: SfxName, buf: AudioBuffer): void {
  const spec = SFX[name];
  const t0 = ac.currentTime;
  const at = spec.at ?? 0;
  const dur = spec.dur ?? Math.max(0, buf.duration - at);

  const src = ac.createBufferSource();
  src.buffer = buf;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(spec.gain, t0);

  // 途中で切る素材は、そのまま止めると「ブツッ」と鳴る。終わりだけ落とす
  if (spec.fade) {
    const from = Math.max(0.001, dur - spec.fade);
    amp.gain.setValueAtTime(spec.gain, t0 + from);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  src.connect(amp).connect(out(ac));
  src.start(t0, at, dur);
}

export function play(name: SfxName): void {
  const ac = audio();
  if (!ac) return;

  const buf = buffers.get(name);
  if (buf) return playBuffer(ac, name, buf);

  void load();
  // **読み込み中は黙る。** ここで合成音を鳴らすと、1音目だけ「ピッ」という
  // 別の音が出て驚く（実際にそうなった）。数十msで音源が来るので待つ。
  // 読み終えたのに無いものだけ、合成音の保険に落とす
  if (!ready) return;
  synth(ac, name);
}

/** 音源が無いときの合成音。生音源が入る前の五七五はこの音で遊べていた */
function synth(ac: AudioContext, name: SfxName): void {
  switch (name) {
    case 'place':
      // かるたを盤に置く音。木は倍音が短く落ちるので矩形波を一瞬だけ
      tone(ac, { type: 'square', from: 660, to: 300, dur: 0.06, gain: 0.06 });
      noise(ac, { dur: 0.05, freq: 2200, q: 1.2, gain: 0.05 });
      break;
    case 'toss':
      noise(ac, { dur: 0.16, freq: 1400, q: 0.7, gain: 0.07 });
      break;
    case 'draw':
      noise(ac, { dur: 0.13, freq: 2600, q: 0.9, gain: 0.05 });
      tone(ac, { type: 'triangle', from: 520, to: 880, dur: 0.09, gain: 0.03 });
      break;
    case 'submit':
      tone(ac, { type: 'triangle', from: 440, to: 660, dur: 0.11, gain: 0.09 });
      tone(ac, { type: 'sine', from: 880, dur: 0.22, gain: 0.05, at: 0.08 });
      break;
    case 'chime':
      // 太鼓の二つ打ち「ドドン」。
      // 鈴（高い正弦の重ね）は耳に刺さるので、低い胴の鳴りに寄せた。
      // 胴＝周波数を急に落とす正弦、皮の当たり＝低めに絞ったノイズ。
      // 二打目を強く長くすると「ドドン」と締まって聞こえる
      taiko(ac, { at: 0, gain: 0.18, from: 150, to: 52, dur: 0.26 });
      taiko(ac, { at: 0.17, gain: 0.26, from: 132, to: 42, dur: 0.55 });
      break;
    case 'stamp':
      tone(ac, { type: 'sine', from: 180, to: 60, dur: 0.16, gain: 0.16 });
      noise(ac, { dur: 0.07, freq: 700, q: 0.6, gain: 0.1 });
      break;
    case 'fanfare':
      // 都節ではなく素直な陽音階。祝いの席の空気に寄せる
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(ac, { type: 'triangle', from: f, dur: 0.34, gain: 0.07, at: i * 0.13 });
      });
      break;
  }
}

/**
 * 前回「音を入れる」を選んでいた人は、開いた時点で読み込んでおく。
 *
 * 待つと1音目（たいてい札を置く音）だけ間に合わず、そこだけ違う音が鳴る。
 * **オフの人は何も読まない**ので、「開いただけで取りに行かない」という
 * 元の狙いは保たれている。取りに行くのは自分で音を入れた人の分だけ。
 */
if (enabled) void load();
