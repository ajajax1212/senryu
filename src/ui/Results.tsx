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

      <div className="score-display">{score}点</div>
      <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
      <div className="score-scale">
        <span>0点</span><span>50点</span><span>100点</span>
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
  const won =
    r?.mode === 'contest' ? r.submissions[0] : r?.submissions.find((h) => h.authorId === r.winnerId);
  const stamp = r?.mode === 'contest' && r.average !== undefined ? gradeFor(r.average) : '選';
  const [revealing, setRevealing] = useState(Boolean(won));

  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(() => setRevealing(false), 5000);
    return () => clearTimeout(t);
  }, [revealing]);

  if (!r) return null;
  const name = (id: string) => playerById(s, id)?.name ?? '?';
  const last = s.round + 1 >= totalRounds(s);

  return (
    <>
      {revealing && won && (
        <div className="reveal" onClick={() => setRevealing(false)}>
          <div className="reveal-box">
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
          <div className="board">
            <HaikuView
              haiku={won!}
              author={`${name(r.winnerId!)} ＋1pt`}
              variant="won"
              stamp="選"
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
          <div className="score-display">{r.average!.toFixed(1)}点</div>
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
  onReplay,
  onExit,
}: {
  s: GameState;
  canAdvance: boolean;
  onReplay?: () => void;
  onExit?: () => void;
}) {
  const table = ranking(s);
  const top = table[0].score;
  const unit = s.mode === 'dokudan' ? '勝' : '点';
  const name = (id: string) => playerById(s, id)?.name ?? '?';

  // 1. 今大会の「最高傑作（特選句）」を抽出
  let bestHaiku: Haiku | null = null;
  let bestAuthorName = '';
  let bestBadge = '';

  if (s.mode === 'dokudan') {
    // 勝利数が最も多かった短冊（または最後の勝利句）
    const winningResults = s.history.filter((r) => r.winnerId);
    if (winningResults.length > 0) {
      const topWinner = winningResults[winningResults.length - 1];
      bestHaiku = topWinner.submissions.find((h) => h.authorId === topWinner.winnerId) ?? null;
      bestAuthorName = name(topWinner.winnerId!);
      bestBadge = '特選';
    }
  } else {
    // コンテストモードで最高得点を得た句
    let maxAvg = -1;
    for (const r of s.history) {
      if (r.average !== undefined && r.average > maxAvg && r.submissions[0]) {
        maxAvg = r.average;
        bestHaiku = r.submissions[0];
        bestAuthorName = name(r.submissions[0].authorId);
        bestBadge = `${maxAvg.toFixed(1)}点`;
      }
    }
  }

  // 2. プレイヤーごとの作品マップ（独断: 選ばれた句一覧 / コンテスト: 詠んだ句と点数一覧）
  const playerPoems: Record<string, { haiku: Haiku; detail: string }[]> = {};
  s.players.forEach((p) => { playerPoems[p.id] = []; });

  s.history.forEach((r) => {
    if (r.mode === 'dokudan' && r.winnerId) {
      const wonHaiku = r.submissions.find((h) => h.authorId === r.winnerId);
      if (wonHaiku) {
        playerPoems[r.winnerId].push({ haiku: wonHaiku, detail: '選' });
      }
    } else if (r.mode === 'contest' && r.submissions[0]) {
      const h = r.submissions[0];
      if (playerPoems[h.authorId]) {
        playerPoems[h.authorId].push({
          haiku: h,
          detail: r.average !== undefined ? `${r.average.toFixed(1)}点` : '',
        });
      }
    }
  });

  return (
    <div className="gameover-container col">
      <h1>総合結果</h1>
      
      {/* 🏆 今大会の特選・最高傑作表彰 */}
      {bestHaiku && (
        <div className="best-haiku-showcase col center">
          <div className="label-mark center" style={{ justifyContent: 'center' }}>
            🏆 今大会の最高傑作句
          </div>
          <HaikuView
            haiku={bestHaiku}
            author={`${bestAuthorName} の句`}
            variant="won"
            stamp={bestBadge}
          />
        </div>
      )}

      {/* 順位テーブル */}
      <div className="panel col">
        <h3>順位表</h3>
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
                <td>{p.score === top ? '👑 ★' : i + 1}</td>
                <td>{p.name}</td>
                <td className="num">
                  {s.mode === 'dokudan' ? p.score : p.score.toFixed(1)}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sub center" style={{ marginTop: 8, fontWeight: 'bold' }}>
          {table.filter((p) => p.score === top).length > 1 ? '🎉 同率優勝！' : `🎉 ${table[0].name} の勝利！`}
        </p>
      </div>

      {/* 📜 プレイヤー別作品鑑賞ギャラリー（これ面白かった！となる振り返り） */}
      <div className="panel col gallery-panel">
        <div className="label-mark">📜 句の鑑賞ギャラリー</div>
        <p className="sub">
          {s.mode === 'dokudan'
            ? '大会中に親に選ばれた名句集です'
            : '各プレイヤーが詠んだ句と獲得点数です'}
        </p>

        <div className="gallery-list col">
          {table.map((p) => {
            const poems = playerPoems[p.id] ?? [];
            return (
              <div key={p.id} className="player-gallery-card col">
                <div className="player-gallery-header row">
                  <span className="player-name">{p.name}</span>
                  <span className="badge">{s.mode === 'dokudan' ? `${p.score}勝` : `${p.score.toFixed(1)}点`}</span>
                </div>
                {poems.length === 0 ? (
                  <p className="sub" style={{ fontSize: 12 }}>（選ばれた句はありません）</p>
                ) : (
                  <div className="gallery-haiku-row">
                    {poems.map((item, idx) => (
                      <div key={idx} className="gallery-item">
                        <HaikuView haiku={item.haiku} stamp={item.detail} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grow" />
      {canAdvance && onReplay ? (
        <button className="primary wide" onClick={onReplay}>
          もう一度遊ぶ
        </button>
      ) : (
        <p className="sub center">ホストが次の一戦を始めるのを待っています</p>
      )}
      {canAdvance && onReplay && (
        <p className="sub center">モードや使う札を選び直せます</p>
      )}
      {onExit && (
        <button className="ghost wide" onClick={onExit}>
          タイトルへ
        </button>
      )}
    </div>
  );
}
