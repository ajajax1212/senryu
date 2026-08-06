import { useState } from 'react';
import type { Action, GameState, Haiku } from '../engine/types';
import { activePlayer, playerById, ranking, totalRounds } from '../engine/reducer';
import { HaikuView } from './parts';

export function Judge({
  s,
  me,
  board,
  dispatch,
}: {
  s: GameState;
  me: string;
  board: Haiku[];
  dispatch: (a: Action) => void;
}) {
  const host = activePlayer(s);
  if (me !== host.id) {
    return (
      <>
        <h2>{host.name} が選んでいます</h2>
        <p className="sub center">全員の句が出そろいました。親の独断と偏見をお待ちください。</p>
        <div className="col">
          {board.map((h, i) => (
            <HaikuView key={i} haiku={h} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h2>{host.name} の独断と偏見</h2>
      <p className="sub">
        一番良かった句をタップして選んでください。理由は要りません。好みで決めてください。
      </p>
      <div className="col">
        {board.map((h, i) => (
          <HaikuView
            key={i}
            haiku={h}
            onClick={() => dispatch({ type: 'JUDGE', playerId: me, index: i })}
          />
        ))}
      </div>
    </>
  );
}

export function Rate({
  s,
  me,
  dispatch,
}: {
  s: GameState;
  me: string;
  dispatch: (a: Action) => void;
}) {
  const [score, setScore] = useState(50);
  const haiku = s.submissions[0];
  const author = activePlayer(s);
  const done = me in s.ratings;

  if (!haiku) return null;

  if (done || me === author.id) {
    const waiting = s.turnQueue.map((id) => playerById(s, id)?.name ?? '?');
    return (
      <>
        <h2>{author.name} の句</h2>
        <HaikuView haiku={haiku} />
        <div className="panel col center">
          <h3>{me === author.id ? '採点されています' : `${s.ratings[me]}点を入れました`}</h3>
          {waiting.length > 0 && <p className="sub">まだ入れていない人: {waiting.join('、')}</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <h2>{playerById(s, me)?.name} の採点</h2>
      <HaikuView haiku={haiku} author={`${author.name} の句`} />

      <div className="score-display">{score}</div>
      <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
      <div className="quick-scores">
        {[0, 25, 50, 75, 100].map((v) => (
          <button key={v} onClick={() => setScore(v)}>
            {v}
          </button>
        ))}
      </div>

      <div className="grow" />
      <button className="primary wide" onClick={() => dispatch({ type: 'RATE', playerId: me, score })}>
        {score}点で確定する
      </button>
      <p className="sub center">他の人の点数は全員が入れ終わるまで見えません</p>
    </>
  );
}

export function RoundResult({
  s,
  canAdvance,
  dispatch,
}: {
  s: GameState;
  canAdvance: boolean;
  dispatch: (a: Action) => void;
}) {
  const r = s.lastResult;
  if (!r) return null;
  const name = (id: string) => playerById(s, id)?.name ?? '?';
  const last = s.round + 1 >= totalRounds(s);

  return (
    <>
      <h2>第{s.round + 1}ラウンド 結果</h2>

      {r.mode === 'dokudan' ? (
        <>
          <p className="sub">{activePlayer(s).name} が選んだのは</p>
          <HaikuView
            haiku={r.submissions.find((h) => h.authorId === r.winnerId)!}
            author={`${name(r.winnerId!)} ＋1ポイント`}
          />
          {r.submissions.length > 1 && (
            <>
              <h3>選ばれなかった句</h3>
              <div className="col">
                {r.submissions
                  .filter((h) => h.authorId !== r.winnerId)
                  .map((h) => (
                    <HaikuView key={h.authorId} haiku={h} author={name(h.authorId)} />
                  ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <HaikuView haiku={r.submissions[0]} author={name(r.submissions[0].authorId)} />
          <div className="score-display">{r.average!.toFixed(1)}</div>
          <p className="sub center">平均点</p>
          {s.settings.revealRaters && (
            <table>
              <tbody>
                {Object.entries(r.ratings ?? {}).map(([id, v]) => (
                  <tr key={id}>
                    <td>{name(id)}</td>
                    <td className="num">{v}点</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <div className="grow" />
      {canAdvance ? (
        <button className="primary wide" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>
          {last ? '総合結果へ' : `第${s.round + 2}ラウンドへ`}
        </button>
      ) : (
        <p className="sub center">ホストが次に進めるのを待っています</p>
      )}
    </>
  );
}

export function GameOver({ s, onRestart }: { s: GameState; onRestart?: () => void }) {
  const table = ranking(s);
  const top = table[0].score;
  const unit = s.mode === 'dokudan' ? '勝' : '点';

  return (
    <>
      <h1>総合結果</h1>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>名前</th>
            <th className="num">{s.mode === 'dokudan' ? '選ばれた回数' : '平均点'}</th>
          </tr>
        </thead>
        <tbody>
          {table.map((p, i) => (
            <tr key={p.id} className={p.score === top ? 'winner' : ''}>
              <td>{p.score === top ? '★' : i + 1}</td>
              <td>{p.name}</td>
              <td className="num">
                {s.mode === 'dokudan' ? p.score : p.score.toFixed(1)}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub center">
        {table.filter((p) => p.score === top).length > 1 ? '同率優勝' : `${table[0].name} の勝ち`}
      </p>
      <div className="grow" />
      {onRestart && (
        <button className="primary wide" onClick={onRestart}>
          もう一度遊ぶ
        </button>
      )}
    </>
  );
}
