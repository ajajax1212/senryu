import { useEffect, useState } from 'react';
import type { Action, GameState, Haiku, RoundResult } from '../engine/types';
import {
  activePlayer,
  playerById,
  predictionHits,
  ranking,
  totalTurns,
} from '../engine/reducer';
import { gradeFor } from '../engine/types';
import { HaikuView, PhaseBar, Roster, SoundToggle } from './parts';
import { ProgressBar } from './Turn';
import { play } from './sound';

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
    // 待っているだけの時間を、当てにいく時間に変える。得点には関わらない
    const guess = s.predictions[me];
    return (
      <>
        <PhaseBar s={s} title={`${host.name} が選んでいます`} />
        <p className="sub center">
          どれが選ばれるか予想してみてください。点数には関係ありません。
        </p>
        <div className="board">
          {board.map((h, i) => (
            <div key={i} className={`guess-slot${guess === i ? ' picked' : ''}`}>
              <HaikuView
                haiku={h}
                onClick={() => {
                  play('place');
                  dispatch({ type: 'PREDICT', playerId: me, index: i });
                }}
              />
              {guess === i && <div className="guess-mark">予想</div>}
            </div>
          ))}
        </div>
        <p className="sub center">
          {guess === undefined ? '句をタップすると予想できます' : '選び直せます'}
        </p>
      </>
    );
  }

  return (
    <>
      <PhaseBar s={s} title={`${host.name} の独断と偏見`} />
      <p className="sub center">
        一番良かった句をタップして選んでください。理由は要りません。好みで決めてください。
      </p>
      <div className="board">
        {board.map((h, i) => (
          <HaikuView
            key={i}
            haiku={h}
            onClick={() => {
              // ここで音を鳴らさない。選んだ瞬間そのまま発表に移るので、
              // タップ音と発表の太鼓が1ms差で重なって濁る。太鼓が返事になる
              dispatch({ type: 'JUDGE', playerId: me, index: i });
            }}
          />
        ))}
      </div>
    </>
  );
}

/**
 * 民主主義モードの投票画面。
 *
 * 見た目は勝ち句予想（guess-slot）と揃えてある。やることが同じ「1句を選ぶ」なのに
 * 別の見た目にすると、どちらの操作をしているのか分からなくなるため。
 */
export function Vote({
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
  const voted = s.votes[me];
  const done = me in s.votes;
  // 自分が最後の1人なら、投票した瞬間に開票へ移って太鼓が鳴る。
  // そこでタップ音も鳴らすと重なるので、最後の人だけ無音にする
  const last = s.turnQueue.length === 1 && s.turnQueue[0] === me;

  if (done) {
    return (
      <>
        <PhaseBar s={s} title="投票中" />
        <div className="wait-stage">
          <div className="wait-main">
            {voted !== undefined && board[voted] && <HaikuView haiku={board[voted]} />}
          </div>
          <div className="panel col wait-side">
            <div className="label-mark">投票しました</div>
            <ProgressBar s={s} />
            <Roster s={s} hasLead={false} leadLabel="" doneLabel="投票済" pendingLabel="投票中" />
          </div>
        </div>
        <p className="sub center">全員が入れ終わるまで、どこに票が集まっているかは見えません</p>
      </>
    );
  }

  return (
    <>
      <PhaseBar s={s} title="一番良かった句に投票" />
      <p className="sub center">
        句をタップすると投票できます。自分の句には入れられません。
      </p>
      <div className="board">
        {board.map((h, i) => {
          const mine = h.authorId === me;
          return (
            <div key={i} className={`guess-slot${mine ? ' mine' : ''}`}>
              <HaikuView
                haiku={h}
                onClick={
                  mine
                    ? undefined
                    : () => {
                        if (!last) play('stamp');
                        dispatch({ type: 'VOTE', playerId: me, index: i });
                      }
                }
              />
              {mine && <div className="guess-mark">あなたの句</div>}
            </div>
          );
        })}
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
    return (
      <>
        <PhaseBar s={s} title={`${author.name} の句`} />
        <div className="wait-stage">
          <div className="wait-main">
            <HaikuView haiku={haiku} author={`${author.name} の句`} />
          </div>
          <div className="panel col wait-side">
            <div className="label-mark">
              {me === author.id ? '採点されています' : `${s.ratings[me]}点を入れました`}
            </div>
            <ProgressBar s={s} />
            <Roster s={s} leadLabel="詠み手" doneLabel="採点済" pendingLabel="採点中" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PhaseBar s={s} title={`${playerById(s, me)?.name} の採点`} />
      <HaikuView haiku={haiku} author={`${author.name} の句`} />

      <div className="score-display">{score}点</div>
      <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
      <div className="score-scale">
        <span>0点</span><span>50点</span><span>100点</span>
      </div>

      <div className="grow" />
      <button
        className="primary wide"
        onClick={() => {
          play('submit');
          dispatch({ type: 'RATE', playerId: me, score });
        }}
      >
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
  // 民主主義は同票がありうる。落款を押して見せる1句は最多得票の先頭にする
  const won =
    r?.mode === 'contest'
      ? r.submissions[0]
      : r?.mode === 'democracy'
        ? r.submissions.find((h) => r.winnerIds?.includes(h.authorId))
        : r?.submissions.find((h) => h.authorId === r.winnerId);
  const stamp = r?.mode === 'contest' && r.average !== undefined ? gradeFor(r.average) : '選';
  const [revealing, setRevealing] = useState(Boolean(won));

  useEffect(() => {
    if (!revealing) return;
    // 発表は太鼓の一発だけにする。
    //
    // もとは太鼓のあと1.85秒で落款の音を重ねていた。合成音の太鼓は0.7秒で
    // 消えていたので間が空いたが、生音源の和太鼓は2.4秒鳴るので小鼓と
    // 被って濁る。落款は絵（styles.css の stamp-bounce）だけで十分伝わる。
    play('chime');
    const t = setTimeout(() => setRevealing(false), 5000);
    return () => clearTimeout(t);
  }, [revealing]);

  if (!r) return null;
  const name = (id: string) => playerById(s, id)?.name ?? '?';
  const hits = predictionHits(s, r);
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
              {r.mode === 'contest'
                ? `${r.average!.toFixed(1)}点`
                : r.mode === 'democracy'
                  ? (r.winnerIds ?? []).map(name).join('・')
                  : name(r.winnerId!)}
            </div>
            {/* 勝手に閉じるまでの残りを見せる。何秒眺めていられるのか分からないと、
                読み上げている途中で画面が変わったように感じる */}
            <div className="reveal-clock">
              <i />
            </div>
            <div className="reveal-hint">タップで結果へ</div>
          </div>
        </div>
      )}

      {/* 民主主義は誰の番でもない。親のいないモードで人名を出すと、
          その人が選んだように読めてしまう */}
      <PhaseBar
        s={s}
        title={r.mode === 'democracy' ? '投票の結果' : `${activePlayer(s).name} の番 — 結果`}
      />

      {r.mode === 'democracy' ? (
        <DemocracyResult s={s} r={r} />
      ) : r.mode === 'dokudan' ? (
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
          {r.predictions && Object.keys(r.predictions).length > 0 && (
            <p className="sub center guess-result">
              {hits.length > 0 ? `的中 — ${hits.join('、')}` : '当てた人はいませんでした'}
            </p>
          )}
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
      {/* ここまでの成績。1手番ごとに総合順位を思い出せないと、残りの手番で
          誰を追えばいいのか分からない。総合結果まで伏せておく理由がない */}
      <Standings s={s} />
      {canAdvance ? (
        <button
          className="primary wide"
          onClick={() => {
            play('place');
            dispatch({ type: 'NEXT_TURN' });
          }}
        >
          {last ? '総合結果へ' : '次のプレイヤーに進む'}
        </button>
      ) : (
        <p className="sub center">ホストが次に進めるのを待っています</p>
      )}
    </>
  );
}

/**
 * 民主主義の結果。票の集まり方そのものが見どころなので、
 * 勝ち句だけでなく全句に何票入ったかを並べる。同票なら全員が勝ち。
 */
function DemocracyResult({ s, r }: { s: GameState; r: RoundResult }) {
  const name = (id: string) => playerById(s, id)?.name ?? '?';
  const winners = r.winnerIds ?? [];
  const counts = r.voteCounts ?? {};
  const sorted = [...r.submissions].sort(
    (a, b) => (counts[b.authorId] ?? 0) - (counts[a.authorId] ?? 0),
  );

  return (
    <>
      <p className="sub center">
        {winners.length === 0
          ? '票が入りませんでした'
          : winners.length > 1
            ? `同票 — ${winners.map(name).join('・')} が揃って＋1pt`
            : `${name(winners[0])} が選ばれました`}
      </p>
      <div className="board">
        {sorted.map((h) => {
          const win = winners.includes(h.authorId);
          const n = counts[h.authorId] ?? 0;
          return (
            <HaikuView
              key={h.authorId}
              haiku={h}
              author={`${name(h.authorId)} ${n}票${win ? ' ＋1pt' : ''}`}
              variant={win ? 'won' : 'lost'}
              {...(win ? { stamp: '選' } : {})}
            />
          );
        })}
      </div>
    </>
  );
}

/**
 * 得点の見せ方。平均点で競うのはコンテストだけで、独断と偏見も民主主義も
 * 「選ばれた回数」を数える。ここを each 箇所で `=== 'dokudan'` と書くと、
 * モードが増えるたびに書き漏らした場所だけ表記が崩れる
 */
function isAverageScore(s: GameState): boolean {
  return s.mode === 'contest';
}
function scoreText(s: GameState, n: number): string {
  return isAverageScore(s) ? n.toFixed(1) : String(n);
}
function scoreUnit(s: GameState): string {
  return isAverageScore(s) ? '点' : '勝';
}

/** 途中経過の並び。1行に収める（結果画面の縦を食わないこと優先） */
function Standings({ s }: { s: GameState }) {
  const table = ranking(s);
  const top = table[0]?.score ?? 0;
  return (
    <div className="standings">
      <span className="standings-label">ここまで</span>
      {table.map((p) => (
        <span key={p.id} className={`standing${p.score === top && top > 0 ? ' lead' : ''}`}>
          {p.name}
          <b>
            {scoreText(s, p.score)}
            {scoreUnit(s)}
          </b>
        </span>
      ))}
    </div>
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
  const unit = scoreUnit(s);
  const name = (id: string) => playerById(s, id)?.name ?? '?';
  // 順位と振り返りを1枚に積むとスクロールが長くなり、勝敗が一目で分からない
  const [tab, setTab] = useState<'result' | 'gallery'>('result');

  const featured = featuredHaiku(s, table[0]?.id);
  const poems = poemsByPlayer(s);

  // 総合結果に着いた一度だけ鳴らす。タブ切り替えのたびに鳴ると祝いにならない
  useEffect(() => {
    play('fanfare');
  }, []);

  return (
    <div className="gameover-container col">
      <div className="gameover-head">
        <h1>総合結果</h1>
        <SoundToggle />
      </div>

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
                  <th className="num">{isAverageScore(s) ? '平均点' : '選ばれた回数'}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((p, i) => (
                  <tr key={p.id} className={p.score === top ? 'winner' : ''}>
                    <td>{p.score === top ? '★' : i + 1}</td>
                    <td>{p.name}</td>
                    <td className="num">
                      {scoreText(s, p.score)}
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
              : s.mode === 'democracy'
                ? '大会中に投票で選ばれた名句集です'
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
                      {`${scoreText(s, p.score)}${scoreUnit(s)}`}
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
    const chosen =
      r.mode === 'democracy' ? (r.winnerIds ?? []).includes(winnerId) : r.winnerId === winnerId;
    if (!chosen) continue;
    const h = r.submissions.find((x) => x.authorId === winnerId);
    if (h) return { haiku: h, authorId: winnerId, title: '優勝者の句', badge: '優勝' };
  }
  return null;
}

/**
 * プレイヤーごとの振り返り。独断と民主主義は選ばれた句、コンテストは詠んだ句と点数。
 * 民主主義は同票がありうるので、勝者が複数いてもすべて拾う
 */
function poemsByPlayer(s: GameState): Record<string, { haiku: Haiku; detail: string }[]> {
  const out: Record<string, { haiku: Haiku; detail: string }[]> = {};
  for (const p of s.players) out[p.id] = [];

  for (const r of s.history) {
    if (r.mode === 'dokudan' && r.winnerId) {
      const won = r.submissions.find((h) => h.authorId === r.winnerId);
      // 席が入れ替わった等で見覚えのないIDが来ても落ちないようにする
      if (won && out[r.winnerId]) out[r.winnerId].push({ haiku: won, detail: '選' });
    } else if (r.mode === 'democracy') {
      for (const id of r.winnerIds ?? []) {
        const won = r.submissions.find((h) => h.authorId === id);
        const n = r.voteCounts?.[id];
        if (won && out[id]) out[id].push({ haiku: won, detail: n ? `${n}票` : '選' });
      }
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
