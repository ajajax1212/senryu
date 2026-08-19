import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Card, Haiku } from '../engine/types';
import { FREE_CARD_MAX } from '../engine/types';

export function CardView({
  card,
  selected,
  discarding,
  onClick,
  onEdit,
  variant,
}: {
  card: Card;
  selected?: boolean;
  discarding?: boolean;
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
