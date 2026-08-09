import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Card, Haiku } from '../engine/types';

export function CardView({
  card,
  selected,
  discarding,
  onClick,
  variant,
}: {
  card: Card;
  selected?: boolean;
  discarding?: boolean;
  onClick?: () => void;
  variant?: 'hand' | 'slot' | 'static';
}) {
  const is7 = card.mora === 7;
  // 押せない札にポインタやホバー浮きを出さない。variant で明示されていなくても
  // onClick が無ければ静止札として扱う
  const cls = [
    'card',
    is7 ? 'm7' : 'm5',
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
export function DeadlineBar({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  return <TimerBar left={Math.max(0, Math.ceil((deadline - now) / 1000))} total={300} />;
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
