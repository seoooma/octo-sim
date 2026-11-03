import { defineConfig } from 'vite';

// GitHub Pages は https://seoooma.github.io/octo-sim/ の下に置かれるので、読み込みは相対パスにする
export default defineConfig({
  base: './',
  cacheDir: '.vite-cache',   // 作業用のフォルダ(git worktree)ごとに分ける(node_modules を共有しても混ざらない)
  build: { chunkSizeWarningLimit: 1200 },   // three.js が 1 つで約 700kB
});
