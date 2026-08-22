import { useState } from 'react';
import type { Mode } from '../engine/types';
import { codeFromUrl } from '../net/useRoom';
import { Local } from './Local';
import { Online } from './Online';
import { FavoritesSheet, SoundToggle } from './parts';

type Route = { kind: 'title' } | { kind: 'local'; mode: Mode } | { kind: 'online' };

export function App() {
  // 招待URLで開かれたときは、いきなりオンラインの参加画面に入る
  const [route, setRoute] = useState<Route>(codeFromUrl() ? { kind: 'online' } : { kind: 'title' });

  return (
    <>
      {route.kind === 'local' && <Local mode={route.mode} onBack={() => setRoute({ kind: 'title' })} />}
      {route.kind === 'online' && <Online onBack={() => setRoute({ kind: 'title' })} />}
      {route.kind === 'title' && <Title onPick={setRoute} />}
    </>
  );
}

function Title({ onPick }: { onPick: (r: Route) => void }) {
  // お気に入りは部屋ではなくこのブラウザに紐づくので、部屋の外＝タイトルから開く
  const [favs, setFavs] = useState(false);

  return (
    <>
      {favs && <FavoritesSheet onClose={() => setFavs(false)} />}
      <div className="title-block">
        {/* 効果音は既定でオフ。始める前に入れておけるよう、題字の脇に置く */}
        <div className="title-sfx">
          <button className="ghost tiny" onClick={() => setFavs(true)}>
            ★ お気に入りの句
          </button>
          <SoundToggle />
        </div>
        {/* 題字は縦書きかるた短冊モチーフ。落款スタンプ付き */}
        <div className="title-mark">五七五</div>
        <p className="sub center">配られた札で川柳を作り、人間の主観だけで勝敗を決めるデジタルかるた</p>
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
        <p className="sub center">スマホ・PC1台を手渡しで回す。手番のたびに手札を隠す</p>
        <div className="row">
          <button className="grow" onClick={() => onPick({ kind: 'local', mode: 'dokudan' })}>
            独断と偏見モード
          </button>
          <button className="grow" onClick={() => onPick({ kind: 'local', mode: 'contest' })}>
            コンテストモード
          </button>
          <button className="grow" onClick={() => onPick({ kind: 'local', mode: 'democracy' })}>
            民主主義モード
          </button>
        </div>
      </div>
    </>
  );
}
