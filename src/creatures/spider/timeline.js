import { keys, makeScript, labelFadeAt } from '../../core/timeline.js';
import { T } from './path.js';

// 蜘蛛の 32 秒の台本(7 回の操作)。体の道と足の運びは path.js、糸は web.js。どれも時刻 t だけで決まる
export const DURATION = T.end;

export const ACTIONS = [
  { t: 0.0, key: 'walk', peak: 2.4, mode: 'WALKING', log: 'INBOUND · TETRAPOD GAIT', assembly: 'HERO', labels: 'legs' },
  { t: 5.0, key: 'turn', peak: 6.6, mode: 'PIVOT SCAN', log: 'OPERATOR · ISOLATE OPTICS', assembly: 'OPTICS', labels: 'optics' },
  { t: 7.6, key: 'spin', peak: 9.6, mode: 'SPINNERETS', log: 'OPERATOR · ISOLATE SPINNERETS', assembly: 'SPINNERETS', labels: 'spin' },
  { t: 10.3, key: 'climb', peak: 12.2, mode: 'ASCENDING', log: 'DRAGLINE · REEL IN', assembly: 'DRAGLINE', labels: 'climb' },
  { t: 14.0, key: 'radial', peak: 17.0, mode: 'RADIAL LINES', log: 'WEB · FIRE RADIALS', assembly: 'RADIALS', labels: 'radial' },
  { t: 18.4, key: 'spiral', peak: 23.0, mode: 'SPIRAL WEAVE', log: 'WEB · LAY CAPTURE SPIRAL', assembly: 'SPIRAL', labels: 'spiral' },
  { t: 27.8, key: 'home', peak: 31.4, mode: 'WEB COMPLETE', log: 'OPERATOR · HUB · HOLD', assembly: 'HERO', labels: null },
];
export const SCRIPT = makeScript(ACTIONS, DURATION);
export const { actionIndex, actionByKey } = SCRIPT;
export const ASSEMBLY_JUMP = { HERO: 'walk', OPTICS: 'turn', SPINNERETS: 'spin', DRAGLINE: 'climb', RADIALS: 'radial', SPIRAL: 'spiral' };

export function evaluate(t) {
  const i = actionIndex(t);
  const act = ACTIONS[i];
  return {
    t,
    index: i,
    act,
    since: t - act.t,
    labelFade: labelFadeAt(SCRIPT, t, i),
    scan: keys(t, [[5.2, 0], [5.7, 1], [7.0, 1], [7.5, 0]]),                    // 目の走査
    fang: keys(t, [[5.9, 0], [6.2, 1], [6.5, 0.2], [6.8, 1], [7.2, 0]]),         // 牙を開く
    raise: keys(t, [[7.8, 0], [8.6, 1], [10.4, 1], [11.6, 0.35], [27.8, 0.35], [29, 0]]),   // おなかを持ち上げる
    spin: keys(t, [[8.0, 0], [8.8, 1], [27.8, 1], [28.8, 0.2]]),               // 糸いぼを開く
  };
}
