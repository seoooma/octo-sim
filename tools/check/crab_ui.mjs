// カニの画面の操作が効くかを見る(tools/ui_check.mjs のカニ版): CRAB へ切り替え → ASSEMBLIES で各操作へ、SHELL を消す、エラーなし。
//   node tools/check/crab_ui.mjs
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { acquireBrowserLock } from '../lib/lock.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await acquireBrowserLock();   // ブラウザの道具は同時に 1 つだけ
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
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
  page.on('console', (m) => { if ((m.type() === 'error' && !m.text().includes('404')) || m.type() === 'warning') { console.log(`[console ${m.type()}]`, m.text()); failed++; } });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForTimeout(1200);
  const text = (ref) => page.$eval(`[data-ref="${ref}"]`, (el) => el.textContent);

  await page.click('button[data-species="crab"]');
  await page.waitForURL(/creature=crab/);
  await page.waitForTimeout(1500);
  check('CRAB を押すとカニに切り替わる', (await page.$eval('h1', (el) => el.textContent)).includes('CR-10'), await page.$eval('h1', (el) => el.textContent));
  for (const [asm, mode] of [['OPTICS', 'EYES UP'], ['CHELAE', 'CLAW DISPLAY'], ['MOUTH', 'GRAB SAMPLE'], ['CARAPACE', 'CARAPACE UP'], ['GILLS', 'BUBBLE VENT'], ['HERO', 'SIDE WALK']]) {
    await page.click(`button[data-asm="${asm}"]`);
    await page.waitForTimeout(500);
    check(`${asm} を押すと ${mode} へ`, (await text('mode')) === mode, await text('mode'));
  }
  await page.click('button[data-disp="shell"]');
  await page.waitForTimeout(400);
  check('SHELL を消せる', !(await page.$eval('button[data-disp="shell"]', (el) => el.classList.contains('on'))), 'class');
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
