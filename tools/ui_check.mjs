// 画面の操作が効くかを見る: ASSEMBLIES を押す → その操作へ飛ぶ、タイムラインを押す → その時刻へ、再生/一時停止。
//   node tools/ui_check.mjs [out.png]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = process.argv[2] ?? 'out/ui_check.png';
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (name, ok, got) => {
  console.log(`${ok ? 'OK ' : 'NG '} ${name}  (${got})`);
  if (!ok) failed++;
};
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => { console.log('[page error]', e.message); failed++; });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) { console.log('[console error]', m.text()); failed++; } });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForTimeout(1200);
  const text = (ref) => page.$eval(`[data-ref="${ref}"]`, (el) => el.textContent);

  await page.click('button[data-asm="MANTLE"]');
  await page.waitForTimeout(1500);
  check('MANTLE を押すと外套を開く操作へ', (await text('mode')) === 'MANTLE OPEN', await text('mode'));

  await page.click('button[data-asm="BEAK"]');
  await page.waitForTimeout(400);
  check('BEAK を押すとくちばしの操作へ', (await text('logText')).includes('BEAK'), await text('logText'));

  await page.click('[data-ref="play"]');
  const t1 = await text('time');
  await page.waitForTimeout(800);
  check('一時停止で時刻が止まる', (await text('time')) === t1, `${t1} → ${await text('time')}`);

  const box = await page.$eval('[data-ref="track"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.click(box.x + box.w * (11 / 25), box.y + box.h / 2);
  await page.waitForTimeout(300);
  check('タイムラインの 11 秒あたりを押すと ARM R2 へ', (await text('mode')) === 'ARM R2 APART', `${await text('time')} ${await text('mode')}`);

  await page.click('button[data-disp="exploded"]');
  await page.waitForTimeout(1500);
  check('EXPLODED が点く', await page.$eval('button[data-disp="exploded"]', (el) => el.classList.contains('on')), 'class');
  await page.screenshot({ path: out });
  console.log(out);

  // 生き物の切り替え: SPIDER を押すと蜘蛛のページに変わり、RADIALS で縦糸の操作へ
  await page.click('button[data-species="spider"]');
  await page.waitForURL(/creature=spider/);
  await page.waitForTimeout(1500);
  check('SPIDER を押すと蜘蛛に切り替わる', (await page.$eval('h1', (el) => el.textContent)).includes('AX-8'), await page.$eval('h1', (el) => el.textContent));
  await page.click('button[data-asm="RADIALS"]');
  await page.waitForTimeout(600);
  check('RADIALS を押すと縦糸の操作へ', (await text('mode')) === 'RADIAL LINES', await text('mode'));
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
