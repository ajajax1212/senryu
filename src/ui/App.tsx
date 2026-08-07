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
      <div className="title-block">
        {/* 題字は縦書き。札と同じ和紙の枠に収める */}
        <div className="title-mark">五七五</div>
        <p className="sub center">配られた札で川柳を作り、人間の主観だけで勝敗を決める</p>
      </div>

      <div className="col title-actions">
        <button className="primary wide" onClick={() => onPick({ kind: 'online' })}>
          オンラインで遊ぶ
        </button>
        <p className="sub center">
          部屋を作ってURLを配る。各自が自分の画面で手札を見るので全員同時に作れる
        </p>

        <div className="divider">
          <span>1台をまわして遊ぶ</span>
        </div>
        <p className="sub center">スマホ1台を手渡しで回す。手番のたびに手札を隠す</p>
        <div className="row">
          <button className="grow" onClick={() => onPick({ kind: 'local', mode: 'dokudan' })}>
            独断と偏見
          </button>
          <button className="grow" onClick={() => onPick({ kind: 'local', mode: 'contest' })}>
            コンテスト
          </button>
        </div>
      </div>
    </>
  );
}
