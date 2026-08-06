import { useState } from 'react';
import type { Mode } from '../engine/types';
import { codeFromUrl } from '../net/useRoom';
import { Local } from './Local';
import { Online } from './Online';

type Route = { kind: 'title' } | { kind: 'local'; mode: Mode } | { kind: 'online' };

export function App() {
  // 招待URLで開かれたときは、いきなりオンラインの参加画面に入る
  const [route, setRoute] = useState<Route>(codeFromUrl() ? { kind: 'online' } : { kind: 'title' });

  if (route.kind === 'local') {
    return <Local mode={route.mode} onBack={() => setRoute({ kind: 'title' })} />;
  }
  if (route.kind === 'online') {
    return <Online onBack={() => setRoute({ kind: 'title' })} />;
  }
  return <Title onPick={setRoute} />;
}

function Title({ onPick }: { onPick: (r: Route) => void }) {
  return (
    <>
      <h1>五七五</h1>
      <p className="sub center">
        配られた札で川柳を作り、人間の主観だけで勝敗を決める。
      </p>

      <div className="col grow" style={{ justifyContent: 'center' }}>
        <button className="primary wide" onClick={() => onPick({ kind: 'online' })}>
          オンラインで遊ぶ
        </button>
        <p className="sub">
          部屋を作ってURLを配る。各自が自分のPCで手札を見るので、全員同時に作句できる。
        </p>

        <h3 style={{ marginTop: 20 }}>1台をまわして遊ぶ</h3>
        <p className="sub">
          スマホ1台を手渡しで回す。手番のたびに手札を隠す画面を挟む。
        </p>
        <button className="wide" onClick={() => onPick({ kind: 'local', mode: 'dokudan' })}>
          独断と偏見モード
        </button>
        <button className="wide" onClick={() => onPick({ kind: 'local', mode: 'contest' })}>
          コンテストモード
        </button>
      </div>
    </>
  );
}
