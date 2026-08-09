import { useEffect, useState } from 'react';
import type { Action, GameState, Haiku } from '../engine/types';
import { activePlayer, playerById, ranking, roundNumber, seatNumber, totalTurns } from '../engine/reducer';
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
  const last = s.turn + 1 >= totalTurns(s);

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

      <h2>{activePlayer(s).name} の番 — 結果</h2>
      <p className="sub center">
        第{roundNumber(s)}ラウンド ／ {seatNumber(s)}人目 ／ {s.players.length}人
      </p>

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
        <button className="primary wide" onClick={() => dispatch({ type: 'NEXT_TURN' })}>
          {last ? '総合結果へ' : '次のプレイヤーに進む'}
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
  // 順位と振り返りを1枚に積むとスクロールが長くなり、勝敗が一目で分からない
  const [tab, setTab] = useState<'result' | 'gallery'>('result');

  const featured = featuredHaiku(s, table[0]?.id);
  const poems = poemsByPlayer(s);

  return (
    <div className="gameover-container col">
      <h1>総合結果</h1>

      <div className="tabs">
        <button className={tab === 'result' ? 'on' : ''} onClick={() => setTab('result')}>
          順位
        </button>
        <button className={tab === 'gallery' ? 'on' : ''} onClick={() => setTab('gallery')}>
          みんなの句を見る
        </button>
      </div>

      {tab === 'result' ? (
        // 表彰句と順位表を横に並べる。縦に積むと勝敗を見るのにスクロールが要る
        <div className="result-grid">
          {featured && (
            <div className="best-haiku-showcase col center">
              <div className="label-mark centered">{featured.title}</div>
              <HaikuView
                haiku={featured.haiku}
                author={`${name(featured.authorId)} の句`}
                variant="won"
                stamp={featured.badge}
              />
            </div>
          )}

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
            <p className="sub center verdict">
              {table.filter((p) => p.score === top).length > 1 ? '同率優勝' : `${table[0].name} の勝ち`}
            </p>
          </div>
        </div>
      ) : (
        <div className="panel col gallery-panel">
          <div className="label-mark">句の鑑賞ギャラリー</div>
          <p className="sub">
            {s.mode === 'dokudan'
              ? '大会中に親に選ばれた名句集です'
              : '各プレイヤーが詠んだ句と獲得点数です'}
          </p>

          <div className="gallery-list col">
            {table.map((p) => {
              const mine = poems[p.id] ?? [];
              return (
                <div key={p.id} className="player-gallery-card col">
                  <div className="player-gallery-header row">
                    <span className="player-name">{p.name}</span>
                    <span className="badge">
                      {s.mode === 'dokudan' ? `${p.score}勝` : `${p.score.toFixed(1)}点`}
                    </span>
                  </div>
                  {mine.length === 0 ? (
                    <p className="sub empty-note">（選ばれた句はありません）</p>
                  ) : (
                    <div className="gallery-haiku-row">
                      {mine.map((item, idx) => (
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
      )}

      <div className="grow" />
      {canAdvance && onReplay ? (
        <>
          <button className="primary wide" onClick={onReplay}>
            もう一度遊ぶ
          </button>
          <p className="sub center">モードや使う札を選び直せます</p>
        </>
      ) : (
        <p className="sub center">ホストが次の一戦を始めるのを待っています</p>
      )}
      {onExit && (
        <button className="ghost wide" onClick={onExit}>
          タイトルへ
        </button>
      )}
    </div>
  );
}

/**
 * 表彰する1句。
 *
 * コンテストは平均点という物差しがあるので最高得点の句をそのまま出せる。
 * 独断と偏見は句どうしを比べる数字が無いので「一番いい句」は決められない。
 * 決められないものを「最高傑作」と名乗ると嘘になるので、優勝者の勝ち句を
 * 「優勝者の句」として出す。
 */
function featuredHaiku(
  s: GameState,
  winnerId: string | undefined,
): { haiku: Haiku; authorId: string; title: string; badge: string } | null {
  if (s.mode === 'contest') {
    let best: { haiku: Haiku; average: number } | null = null;
    for (const r of s.history) {
      const h = r.submissions[0];
      if (!h || r.average === undefined) continue;
      if (!best || r.average > best.average) best = { haiku: h, average: r.average };
    }
    if (!best) return null;
    return {
      haiku: best.haiku,
      authorId: best.haiku.authorId,
      title: `最高得点の句 — ${best.average.toFixed(1)}点`,
      badge: gradeFor(best.average),
    };
  }

  if (!winnerId) return null;
  // 優勝者が最後に選ばれた句。複数勝っていてもどれが上とは言えないので最新を出す
  for (let i = s.history.length - 1; i >= 0; i--) {
    const r = s.history[i];
    if (r.winnerId !== winnerId) continue;
    const h = r.submissions.find((x) => x.authorId === winnerId);
    if (h) return { haiku: h, authorId: winnerId, title: '優勝者の句', badge: '優勝' };
  }
  return null;
}

/** プレイヤーごとの振り返り。独断は選ばれた句、コンテストは詠んだ句と点数 */
function poemsByPlayer(s: GameState): Record<string, { haiku: Haiku; detail: string }[]> {
  const out: Record<string, { haiku: Haiku; detail: string }[]> = {};
  for (const p of s.players) out[p.id] = [];

  for (const r of s.history) {
    if (r.mode === 'dokudan' && r.winnerId) {
      const won = r.submissions.find((h) => h.authorId === r.winnerId);
      // 席が入れ替わった等で見覚えのないIDが来ても落ちないようにする
      if (won && out[r.winnerId]) out[r.winnerId].push({ haiku: won, detail: '選' });
    } else if (r.mode === 'contest') {
      const h = r.submissions[0];
      if (h && out[h.authorId]) {
        out[h.authorId].push({
          haiku: h,
          detail: r.average !== undefined ? `${r.average.toFixed(1)}点` : '',
        });
      }
    }
  }
  return out;
}
