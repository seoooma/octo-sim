// 動かしたときの速さ(コマ/秒)とエラーを見る。 node tools/fps.mjs ['クエリ'] [秒]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { acquireBrowserLock } from './lib/lock.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [query = '', seconds = '5'] = process.argv.slice(2);
await acquireBrowserLock();   // ブラウザの道具は同時に 1 つだけ
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}]`, m.text()); });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`${server.resolvedUrls.local[0]}?${query}`);
  await page.waitForTimeout(1500);
  const fps = await page.evaluate((ms) => new Promise((done) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done((n * 1000) / (performance.now() - t0)); };
    requestAnimationFrame(tick);
  }), Number(seconds) * 1000);
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas').getContext('webgl2');
    const ext = c.getExtension('WEBGL_debug_renderer_info');
    return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?';
  });
  console.log(`${fps.toFixed(1)} コマ/秒  (${gl})`);
} finally {
  await browser.close();
  await server.close();
}
