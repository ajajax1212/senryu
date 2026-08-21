import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Card, GameState, Haiku } from '../engine/types';
import { FREE_CARD_MAX } from '../engine/types';
import type { ArchivedHaiku } from '../net/useRoom';
import { activePlayer, roundNumber, seatNumber, totalRounds } from '../engine/reducer';
import { setSfxEnabled, sfxEnabled, subscribeSfx } from './sound';

export function CardView({
  card,
  selected,
  discarding,
  leaving,
  arriving,
  onClick,
  onEdit,
  variant,
}: {
  card: Card;
  selected?: boolean;
  discarding?: boolean;
  /** 交換で手放す札。抜けていく動き */
  leaving?: boolean;
  /** 引いてきたばかりの札。差し込まれる動き */
  arriving?: boolean;
  onClick?: () => void;
  /** 自由札の書き直し。渡すと札の隅に筆ボタンが出る */
  onEdit?: () => void;
  variant?: 'hand' | 'slot' | 'static';
}) {
  const is7 = card.mora === 7;
  // 押せない札にポインタやホバー浮きを出さない。variant で明示されていなくても
  // onClick が無ければ静止札として扱う
  const cls = [
    'card',
    is7 ? 'm7' : 'm5',
    card.free ? 'free' : '',
    selected ? 'selected' : '',
    discarding ? 'discarding' : '',
    leaving ? 'leaving' : '',
    arriving ? 'arriving' : '',
    variant ?? (onClick ? '' : 'static'),
  ]
    .filter(Boolean)
    .join(' ');

  // 字余り（6音・8音）の札は文字数が増えるので、既定の大きさのままだと札からはみ出す。
  // 文字数をCSSに渡して、収まらないときだけ自動で縮めてもらう
  const len = [...card.text].length;

  return (
    <div className={cls} style={{ '--len': len } as CSSProperties} onClick={onClick}>
      {discarding ? (
        <div className="status-badge toss-badge">捨</div>
      ) : selected ? (
        <div className="status-badge pick-badge">選</div>
      ) : null}

      <div className="text">{card.text}</div>
      <div className="reading">{card.reading}</div>
      <div className="mora-badge">{card.mora}</div>
      {onEdit && (
        <button
          type="button"
          className="free-edit"
          title="書き直す"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          筆
        </button>
      )}
    </div>
  );
}

export function HaikuView({
  haiku,
  author,
  onClick,
  variant,
  stamp,
}: {
  haiku: Haiku;
  author?: string;
  onClick?: () => void;
  variant?: 'won' | 'lost';
  stamp?: string;
}) {
  const cls = ['haiku', onClick ? 'pickable' : '', variant ?? ''].filter(Boolean).join(' ');
  const isSmallStamp = Boolean(stamp && stamp.length >= 4);

  return (
    <div className={cls} onClick={onClick}>
      <div className="haiku-body">
        <div>{haiku.upper.text}</div>
        <div>{haiku.middle.text}</div>
        <div>{haiku.lower.text}</div>
      </div>
      {author && <div className="author">{author}</div>}
      {stamp && <div className={`hanko${isSmallStamp ? ' small' : ''}`}>{stamp}</div>}
    </div>
  );
}

/**
 * 1台版の残り時間。
 *
 * 刻みを数えるのではなく「開始時刻との差」を見る。setInterval のカウントダウンだと
 * タブが裏に回ったときに間引かれて実時間とズレる。
 *
 * onExpire は ref に逃がして依存配列に入れない。呼び出し側は毎レンダー新しい関数を
 * 渡してくるので、依存に入れると再描画のたびに effect が張り直され、残り時間が
 * 満タンに戻ってしまう（札を1枚選ぶだけで時間切れが起きなくなる）。
 */
export function Countdown({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    fired.current = false;
    setLeft(seconds);
    const startedAt = Date.now();
    const id = setInterval(() => {
      const remain = seconds - Math.floor((Date.now() - startedAt) / 1000);
      setLeft(Math.max(0, remain));
      if (remain <= 0 && !fired.current) {
        fired.current = true;
        clearInterval(id);
        expire.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [seconds]);

  return <TimerBar left={left} total={seconds} />;
}

/**
 * オンライン用の残り時間。締切そのものをサーバーから受け取って描くだけで、
 * 時間切れの処理はサーバーが行う。各ブラウザが勝手に判定すると結果がずれるため。
 */
export function DeadlineBar({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  return <TimerBar left={Math.max(0, Math.ceil((deadline - now) / 1000))} total={total} />;
}

/** 残り30秒を切ったら朱くする。見た目は1台版とオンラインで共通 */
function TimerBar({ left, total }: { left: number; total: number }) {
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={`timer${left <= 30 ? ' urgent' : ''}`}>
      <div className="timer-track">
        <div className="timer-bar" style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
      </div>
      <div className="timer-label">
        残り {mm}:{ss}
      </div>
    </div>
  );
}

/**
 * 自由札の記入。
 *
 * 音数は検証しない。自由に書けることがこの札の意味なので、
 * 「5音として使う」と宣言した言葉が実際に何音でも受け入れる。
 * 決めたあとは札に戻すだけで、句に置くのは別の操作。
 */
export function FreeCardEditor({
  initialText,
  initialMora,
  onDecide,
  onCancel,
}: {
  initialText: string;
  initialMora: 5 | 7 | null;
  onDecide: (text: string, mora: 5 | 7) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const trimmed = text.trim();
  const ready = trimmed.length > 0;

  return (
    <div className="announce" onClick={onCancel}>
      <div className="announce-card free-editor" onClick={(e) => e.stopPropagation()}>
        <div className="announce-round">自由札</div>
        <p className="announce-note">好きな言葉を書いて、どちらの位置で使うか決めてください。</p>

        <input
          ref={ref}
          type="text"
          value={text}
          maxLength={FREE_CARD_MAX}
          placeholder={`${FREE_CARD_MAX}文字まで`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="free-count">
          {[...trimmed].length} / {FREE_CARD_MAX}文字
        </div>

        <div className="free-choose">
          <button className="primary" disabled={!ready} onClick={() => onDecide(trimmed, 5)}>
            五音として使う
          </button>
          <button className="primary" disabled={!ready} onClick={() => onDecide(trimmed, 7)}>
            七音として使う
          </button>
        </div>
        {initialMora && (
          <p className="sub center">いまは{initialMora === 7 ? '七' : '五'}音の札になっています</p>
        )}
        <button className="ghost wide" onClick={onCancel}>
          やめる
        </button>
      </div>
    </div>
  );
}

/**
 * 効果音の入切。
 *
 * 既定はオフなので、押したことのない人には何も起きない。
 * ゲーム中どのフェーズからでも切れるように、見出し帯（PhaseBar）に常駐させる。
 * 「うるさいから止めたい」と思った瞬間に設定画面まで戻らせない。
 */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSfx, sfxEnabled, () => false);
  return (
    <button
      type="button"
      className={`sfx-toggle${on ? ' on' : ''}`}
      title={on ? '効果音を切る' : '効果音を入れる'}
      onClick={() => setSfxEnabled(!on)}
    >
      <span className="sfx-note">♪</span>
      {/* 切ってあることは音符に斜線を重ねて示す。音符だけだと入っているのか分からない */}
      {!on && <span className="sfx-slash" />}
    </button>
  );
}

/**
 * ゲーム中の見出し帯。
 *
 * 以前は作句画面だけがこの帯を持ち、審査・採点・結果は素の見出しだったので、
 * 画面が変わるたびに「いま何ラウンドの何人目か」を探し直すことになっていた。
 * 位置と形を固定しておけば、目が同じ場所を見るだけで済む。
 */
export function PhaseBar({
  s,
  title,
  right,
}: {
  s: GameState;
  title: string;
  /** その画面固有の指標（残り札・交換残りなど） */
  right?: ReactNode;
}) {
  return (
    <div className="hdr-bar">
      <div className="hdr-group">
        <span className="hdr-badge">
          ラウンド {roundNumber(s)}／{totalRounds(s)}
        </span>
        <span className="hdr-badge">
          {seatNumber(s)}人目／{s.players.length}人
        </span>
      </div>
      <div className="hdr-title">{title}</div>
      <div className="hdr-group">
        {right}
        <SoundToggle />
      </div>
    </div>
  );
}

type SeatState = 'done' | 'pending' | 'lead';

/**
 * 待っている間の座席表。
 *
 * 「まだ詠んでいる人: あかり、ぼたん」という羅列だと、名前を読んで人数を数えて
 * 自分の記憶にある顔ぶれと引き算する、という手間が要る。席を並べて印を変えれば
 * 見るだけで済むし、何も動かない画面に人の気配が出る。
 *
 * 出せるのは公開情報だけ（誰が終わったか）。何を出したかは含めない。
 */
export function Roster({
  s,
  leadLabel,
  doneLabel,
  pendingLabel,
}: {
  s: GameState;
  /** 親／詠み手など、その手番の中心にいる人の肩書き */
  leadLabel: string;
  doneLabel: string;
  pendingLabel: string;
}) {
  const lead = activePlayer(s);
  const seats = s.players.map((p) => {
    const state: SeatState =
      p.id === lead.id ? 'lead' : s.turnQueue.includes(p.id) ? 'pending' : 'done';
    return { id: p.id, name: p.name, state };
  });

  const label: Record<SeatState, string> = {
    lead: leadLabel,
    done: doneLabel,
    pending: pendingLabel,
  };

  return (
    <div className="roster">
      {seats.map((x) => (
        <div key={x.id} className={`seat ${x.state}`}>
          <span className="seat-dot" />
          <span className="seat-name">{x.name}</span>
          <span className="seat-state">{label[x.state]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 句をXに流す。
 *
 * 画像は作らず intent のURLを開くだけ。投稿するかどうかは向こうの画面で決められるので、
 * 押した瞬間に世に出ることはない。下ネタ札の句もそのまま本文に載るので、
 * 「押したら投稿される」ボタンには絶対にしないこと。
 */
export function shareOnX(poem: { upper: string; middle: string; lower: string }, author?: string): void {
  const lines = [`${poem.upper}／${poem.middle}／${poem.lower}`];
  if (author) lines.push('', `― ${author}`);
  lines.push('', '#五七五ゲーム');
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(lines.join('\n'))}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * その部屋で詠まれた句を並べる感想戦の画面。
 *
 * ロビーに戻るたびに開ける。ロビー自体は1画面に収める約束なので、
 * 常設の枠ではなく重ねて出す。ここは眺める画面なので縦に伸びてよい。
 */
export function PoemGallery({
  poems,
  onClose,
}: {
  poems: ArchivedHaiku[];
  onClose: () => void;
}) {
  // 新しい戦から見せる。直前の一戦の話をしたくて開くことがほとんど
  const games = [...new Set(poems.map((p) => p.game))].sort((a, b) => b - a);

  return (
    <div className="announce" onClick={onClose}>
      <div className="gallery-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gallery-head">
          <div className="label-mark">この部屋の句（{poems.length}）</div>
          <button className="ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        {poems.length === 0 ? (
          <p className="sub center">まだ一戦も終わっていません。</p>
        ) : (
          <div className="gallery-scroll">
            {games.map((g) => (
              <div key={g} className="gallery-game">
                <div className="gallery-game-label">{g}戦目</div>
                <div className="gallery-poems">
                  {poems
                    .filter((p) => p.game === g)
                    .map((p, i) => (
                      <div key={i} className={`gallery-poem${p.won ? ' won' : ''}`}>
                        <div className="gallery-lines">
                          <span>{p.upper}</span>
                          <span>{p.middle}</span>
                          <span>{p.lower}</span>
                        </div>
                        <div className="gallery-meta">
                          <span className="gallery-author">{p.authorName}</span>
                          {p.won && <span className="badge">選</span>}
                          {p.average !== undefined && (
                            <span className="badge">{p.average.toFixed(1)}点</span>
                          )}
                          <button
                            className="ghost share-x"
                            title="Xで共有する"
                            onClick={() => shareOnX(p, p.authorName)}
                          >
                            Xで共有
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
