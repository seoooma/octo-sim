import { keys, makeScript, labelFadeAt } from '../../core/timeline.js';
import { T } from './layout.js';
import { venomAt } from './tail.js';

// サソリの 31 秒の台本(7 回の操作)。体の道と足は path.js、尾は tail.js、はさみと箱は claws.js。どれも時刻 t だけで決まる
export const DURATION = T.end;

export const ACTIONS = [
  { t: 0.0, key: 'walk', peak: 2.4, mode: 'WALKING', log: 'INBOUND · TETRAPOD GAIT', assembly: 'HERO', labels: 'walk' },
  { t: T.threat0, key: 'threat', peak: 7.3, mode: 'CLAW THREAT', log: 'OPERATOR · CHELAE · DISPLAY', assembly: 'CHELAE', labels: 'threat' },
  { t: T.arch0, key: 'arch', peak: 11.4, mode: 'TAIL ARCH', log: 'METASOMA · DORSAL ARCH', assembly: 'METASOMA', labels: 'arch' },
  { t: T.sting0, key: 'sting', peak: 13.82, mode: 'STING STRIKE', log: 'TELSON · STRIKE × 2', assembly: 'TELSON', labels: 'sting' },
  { t: T.uv0, key: 'uv', peak: 17.3, mode: 'UV SCAN', log: 'OPERATOR · UV 365 NM · CUTICLE', assembly: 'CUTICLE', labels: 'uv' },
  { t: T.grip0, key: 'grip', peak: 24.5, mode: 'PINCER GRIP', log: 'CHELA R · SECURE SAMPLE', assembly: 'PINCER', labels: 'grip' },
  { t: T.depart0, key: 'depart', peak: 28.4, mode: 'DEPARTING', log: 'OUTBOUND · SAMPLE SECURED', assembly: 'HERO', labels: null },
];
export const SCRIPT = makeScript(ACTIONS, DURATION);
export const { actionIndex, actionByKey } = SCRIPT;
export const ASSEMBLY_JUMP = { HERO: 'walk', CHELAE: 'threat', METASOMA: 'arch', TELSON: 'sting', CUTICLE: 'uv', PINCER: 'grip' };

export function evaluate(t) {
  const i = actionIndex(t);
  const act = ACTIONS[i];
  return {
    t,
    index: i,
    act,
    since: t - act.t,
    labelFade: labelFadeAt(SCRIPT, t, i),
    // 紫外線の強さと、光の帯が前から後ろへ流れる位置(0〜1。2 回流す)
    uv: keys(t, [[T.uv0 + 0.2, 0], [T.uv0 + 0.8, 1], [T.uv1 - 0.6, 1], [T.uv1, 0]]),
    uvSweep: keys(t, [[T.uv0 + 0.6, -0.2], [T.uv0 + 2.0, 1.2], [T.uv0 + 2.01, -0.2], [T.uv1 - 0.4, 1.2]]),
    // 目の縁が光る(威嚇・刺す)
    alert: keys(t, [[5.2, 0], [5.8, 1], [8.6, 1], [9.2, 0.3], [12.6, 0.3], [13.0, 1], [15.6, 1], [16.2, 0]]),
    // 鋏角を動かす(威嚇・箱)
    chew: keys(t, [[5.4, 0], [5.9, 1], [8.4, 1], [8.9, 0], [23.1, 0], [23.4, 1], [24.8, 1], [25.2, 0]]),
    venom: venomAt(t),
  };
}
