// 静止画を撮る(Vite を立ち上げ、Mac の Chrome で開いて撮る)。
//   node tools/shot.mjs out/front.png 't=2' out/top.png 't=2&view=top' ...
// 出力とクエリを組で並べる。幅と高さは SHOT_W / SHOT_H(既定 1600×900)、人に見せる絵は SHOT_SCALE=2。
// 公開したページを撮るときは SHOT_BASE=https://seoooma.github.io/octo-sim/(Vite は立ち上げない)。
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 900);
const SCALE = Number(process.env.SHOT_SCALE ?? 1);
const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2) {
  console.error('使い方: node tools/shot.mjs <出力.png> <クエリ> [<出力.png> <クエリ> ...]');
  process.exit(1);
}

const server = process.env.SHOT_BASE ? null : await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server?.listen();
const base = process.env.SHOT_BASE ?? server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  for (let i = 0; i < args.length; i += 2) {
    const [out, query] = [args[i], args[i + 1]];
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
    page.on('console', (m) => { if (m.type() !== 'debug') console.log(`[page ${m.type()}]`, m.text()); });
    page.on('pageerror', (e) => console.log('[page error]', e.message));
    const t0 = Date.now();
    await page.goto(`${base}?${query}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    console.log(`${out}  (${query}, ${((Date.now() - t0) / 1000).toFixed(1)}秒)`);
    await page.close();
  }
} finally {
  await browser.close();
  await server?.close();
}
