import { useEffect, useRef, useState } from 'react';
import type { Card, Haiku } from '../engine/types';

/**
 * 残り時間バー。setInterval の刻みを数えるのではなく開始時刻との差を見ているので、
 * タブが非アクティブになって間引かれてもズレない。
 */
export function Countdown({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
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

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={`timer${left <= 30 ? ' urgent' : ''}`}>
      <div className="timer-bar" style={{ width: `${(left / seconds) * 100}%` }} />
      <span className="timer-label">
        残り {mm}:{ss}
      </span>
    </div>
  );
}

export function CardView({
  card,
  state,
  onClick,
}: {
  card: Card;
  state?: 'selected' | 'discarding';
  onClick?: () => void;
}) {
  const cls = ['card', card.mora === 7 ? 'm7' : '', state ?? '', onClick ? '' : 'static']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} onClick={onClick}>
      <div className="text">{card.text}</div>
      <div className="reading">{card.reading}</div>
    </div>
  );
}

export function HaikuView({
  haiku,
  author,
  onClick,
}: {
  haiku: Haiku;
  author?: string;
  onClick?: () => void;
}) {
  return (
    <div className={`haiku${onClick ? ' pickable' : ''}`} onClick={onClick}>
      <div>{haiku.upper.text}</div>
      <div>{haiku.middle.text}</div>
      <div>{haiku.lower.text}</div>
      {author && <div className="author">{author}</div>}
    </div>
  );
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

  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className={`timer${left <= 30 ? ' urgent' : ''}`}>
      <div className="timer-bar" style={{ width: `${Math.min(100, (left / 300) * 100)}%` }} />
      <span className="timer-label">
        残り {mm}:{ss}
      </span>
    </div>
  );
}
