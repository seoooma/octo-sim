// 短い動画を作る(1 コマずつ時刻を進めて撮り、ffmpeg でつなぐ)。動きの確かめ用。
//   node tools/clip.mjs out/a.mp4 <開始の秒> <長さの秒> ['追加のクエリ'] [コマ/秒]
//   大きさは CLIP_W / CLIP_H(既定 960×540)。並べた一覧(4×3)も out/a.sheet.png に作る
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquireBrowserLock } from './lib/lock.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [out, start = '0', secs = '4', extra = '', fpsArg = '30'] = process.argv.slice(2);
if (!out) {
  console.error("使い方: node tools/clip.mjs out/a.mp4 <開始の秒> <長さの秒> ['追加のクエリ'] [コマ/秒]");
  process.exit(1);
}
const fps = Number(fpsArg);
const W = Number(process.env.CLIP_W ?? 960), H = Number(process.env.CLIP_H ?? 540);
const frames = Math.round(Number(secs) * fps);
const dir = mkdtempSync(join(tmpdir(), 'octo-clip-'));
await acquireBrowserLock();   // ブラウザの道具は同時に 1 つだけ
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`${server.resolvedUrls.local[0]}?step=${start}&${extra}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  for (let i = 0; i < frames; i++) {
    if (i) await page.evaluate((dt) => window.__advance(dt), 1 / fps);
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, '0')}.png`) });
  }
  mkdirSync(dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  const every = Math.max(1, Math.floor(frames / 12));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf', `select=not(mod(n\\,${every})),scale=480:-1,tile=4x3`, '-frames:v', '1', out.replace(/\.mp4$/, '.sheet.png')]);
  console.log(`${out}  (${frames} コマ)`);
} finally {
  await browser.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}
