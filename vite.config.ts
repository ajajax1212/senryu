import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 開発中は画面が 5173、ゲームサーバーが 3300 と別プロセスになる。
    // Socket.IO の通信をサーバーへ中継してやらないと、オンライン対戦が
    // 「サーバーに接続中…」から進まない。ws:true は WebSocket 用。
    proxy: {
      '/socket.io': { target: 'http://localhost:3300', ws: true },
    },
  },
});
