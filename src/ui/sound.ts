/**
 * 効果音。
 *
 * 音源ファイルは持たず Web Audio で合成する。依存を増やさないためでもあるが、
 * 数十msの木の音のために数十KBのmp3を読みに行くと、部屋に入った直後の
 * 一番大事な数秒でネットワークを取り合うことになるのが実際の理由。
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

let enabled = readStored();
let ctx: AudioContext | null = null;
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
  // 入れた合図に1音鳴らす。無音のままだと音量が適正か分からない
  if (on) play('place');
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
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
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
  osc.connect(amp).connect(ac.destination);
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
  src.connect(bp).connect(amp).connect(ac.destination);
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

export function play(name: SfxName): void {
  const ac = audio();
  if (!ac) return;

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
