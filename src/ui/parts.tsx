import { useEffect, useState } from 'react';
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
  const cls = [
    'card',
    is7 ? 'm7' : 'm5',
    selected ? 'selected' : '',
    discarding ? 'discarding' : '',
    variant ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={{ '--len': card.text.length } as React.CSSProperties}
      onClick={onClick}
    >
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

export function Countdown({
  seconds,
  onExpire,
}: {
  seconds: number;
  onExpire: () => void;
}) {
  const [rem, setRem] = useState(seconds);

  useEffect(() => {
    setRem(seconds);
    const t = setInterval(() => {
      setRem((r) => {
        if (r <= 1) {
          clearInterval(t);
          onExpire();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [seconds, onExpire]);

  const min = Math.floor(rem / 60);
  const sec = String(rem % 60).padStart(2, '0');

  return (
    <div className="timer">
      <div className="timer-track">
        <div
          className="timer-bar"
          style={{ width: `${Math.min(100, (rem / seconds) * 100)}%` }}
        />
      </div>
      <div className="timer-label">残り {min}:{sec}</div>
    </div>
  );
}

export function DeadlineBar({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const rem = Math.max(0, Math.ceil((deadline - now) / 1000));
  const min = Math.floor(rem / 60);
  const sec = String(rem % 60).padStart(2, '0');

  return (
    <div className="timer">
      <div className="timer-track">
        <div
          className="timer-bar"
          style={{ width: `${Math.min(100, (rem / 300) * 100)}%` }}
        />
      </div>
      <div className="timer-label">残り {min}:{sec}</div>
    </div>
  );
}
