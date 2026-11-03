// ブラウザ(Chrome)を使う道具は、Mac の上で同時に 1 つだけ動かす(M2・8GB。並べると重い)。
// 別のフォルダ(git worktree)で作業していても、/tmp の同じロックを順番に取る。
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const LOCK = '/tmp/octo-sim-browser.lock';

function holderAlive() {
  try {
    const pid = Number(readFileSync(`${LOCK}/pid`, 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export async function acquireBrowserLock() {
  let waited = false;
  for (;;) {
    try {
      mkdirSync(LOCK);
      writeFileSync(`${LOCK}/pid`, String(process.pid));
      break;
    } catch {
      // 持ち主が死んでいたら外す
      if (!holderAlive()) {
        rmSync(LOCK, { recursive: true, force: true });
        continue;
      }
      if (!waited) {
        console.log('(ほかの撮影が終わるのを待っています)');
        waited = true;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  const release = () => {
    try {
      if (Number(readFileSync(`${LOCK}/pid`, 'utf8')) === process.pid) rmSync(LOCK, { recursive: true, force: true });
    } catch {}
  };
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
  return release;
}
