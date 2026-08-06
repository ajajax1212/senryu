import { defineConfig } from 'vite';

// サーバーは1ファイルにバンドルする。エンジンと札データ(JSON)をそのまま取り込めるので、
// Node の ESM に拡張子付きの import を書いて回る必要がなくなる。
// express / socket.io は node_modules から読むので Vite が自動で外す。
export default defineConfig({
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    target: 'node20',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
});
