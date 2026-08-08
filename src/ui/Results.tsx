import { useEffect, useState } from 'react';
import type { Action, GameState, Haiku } from '../engine/types';
import { activePlayer, playerById, ranking, totalRounds } from '../engine/reducer';
import { gradeFor } from '../engine/types';
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
        <div className="board">
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
      <div className="board">
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
      {/* つまみを動かして決める。決め打ちのボタンは置かない。
          押せる数字があると全員そこに寄って平均が偏るため */}
      <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
      <div className="score-scale">
        <span>0</span><span>50</span><span>100</span>
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
  // 独断と偏見は選ばれた句、コンテストは唯一の提出句を主役にする
  const won =
    r?.mode === 'contest' ? r.submissions[0] : r?.submissions.find((h) => h.authorId === r.winnerId);
  const stamp = r?.mode === 'contest' && r.average !== undefined ? gradeFor(r.average) : '一';
  // 選ばれた瞬間だけ、画面中央で大きく見せる。数秒で引くか、触れば飛ばせる
  const [revealing, setRevealing] = useState(Boolean(won));

  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(() => setRevealing(false), 2200);
    return () => clearTimeout(t);
  }, [revealing]);

  if (!r) return null;
  const name = (id: string) => playerById(s, id)?.name ?? '?';
  const last = s.round + 1 >= totalRounds(s);

  return (
    <>
      {revealing && won && (
        <div className="reveal" onClick={() => setRevealing(false)}>
          <div>
            <div className="reveal-inner">
              <HaikuView haiku={won} stamp={stamp} />
            </div>
            <div className="reveal-name">
              {r.mode === 'contest' ? `${r.average!.toFixed(1)}点` : name(r.winnerId!)}
            </div>
            <div className="reveal-hint">タップで結果へ</div>
          </div>
        </div>
      )}

      <h2>第{s.round + 1}ラウンド 結果</h2>

      {r.mode === 'dokudan' ? (
        <>
          <p className="sub center">{activePlayer(s).name} が選んだのは</p>
          {/* 勝ち句を先頭に、負け句を小さくして横一列に並べる */}
          <div className="board">
            <HaikuView
              haiku={won!}
              author={`${name(r.winnerId!)} ＋1ポイント`}
              variant="won"
              stamp="一"
            />
            {r.submissions
              .filter((h) => h.authorId !== r.winnerId)
              .map((h) => (
                <HaikuView key={h.authorId} haiku={h} author={name(h.authorId)} variant="lost" />
              ))}
          </div>
        </>
      ) : (
        <>
          <div className="board">
            <HaikuView
              haiku={r.submissions[0]}
              author={name(r.submissions[0].authorId)}
              variant="won"
              stamp={gradeFor(r.average!)}
            />
          </div>
          <div className="score-display">{r.average!.toFixed(1)}</div>
          <p className="sub center">平均点 — {gradeFor(r.average!)}</p>
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

export function GameOver({
  s,
  canAdvance,
  dispatch,
  onRestart,
}: {
  s: GameState;
  canAdvance: boolean;
  dispatch: (a: Action) => void;
  onRestart?: () => void;
}) {
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
      {/* 同じ顔ぶれのまま、得点を捨ててもう一戦する */}
      {canAdvance ? (
        <button className="primary wide" onClick={() => dispatch({ type: 'RESTART' })}>
          続けて遊ぶ
        </button>
      ) : (
        <p className="sub center">ホストが次の一戦を始めるのを待っています</p>
      )}
      {onRestart && (
        <button className="ghost wide" onClick={onRestart}>
          タイトルへ
        </button>
      )}
    </>
  );
}
