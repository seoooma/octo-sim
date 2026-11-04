import { keys, makeScript, labelFadeAt } from '../../core/timeline.js';
import { T } from './path.js';

// カニの 31 秒の台本(7 回の操作)。体の道と足の運びは path.js、はさみの動きは claws.js。どれも時刻 t だけで決まる
export const DURATION = T.end;

// peak: 見どころの時刻、mode: 画面の大きな文字(12 文字まで)、log: タイムラインの文字、assembly: 光る ASSEMBLIES、labels: 引き出し線の組
export const ACTIONS = [
  { t: 0.0, key: 'walk', peak: 2.4, mode: 'SIDE WALK', log: 'INBOUND · LATERAL GAIT', assembly: 'HERO', labels: 'legs' },
  { t: T.eyes, key: 'eyes', peak: 6.9, mode: 'EYES UP', log: 'OPERATOR · RAISE EYE STALKS', assembly: 'OPTICS', labels: 'eyes' },
  { t: T.display, key: 'display', peak: 10.4, mode: 'CLAW DISPLAY', log: 'OPERATOR · CHELAE · THREAT DISPLAY', assembly: 'CHELAE', labels: 'claws' },
  { t: T.grab, key: 'grab', peak: 14.5, mode: 'GRAB SAMPLE', log: 'OPERATOR · PICK SAMPLE · FEED', assembly: 'MOUTH', labels: 'grab' },
  { t: T.open, key: 'open', peak: 19.6, mode: 'CARAPACE UP', log: 'OPERATOR · ISOLATE CARAPACE', assembly: 'CARAPACE', labels: 'open' },
  { t: T.bubbles, key: 'bubbles', peak: 24.2, mode: 'BUBBLE VENT', log: 'GILL PUMP · PURGE', assembly: 'GILLS', labels: 'vent' },
  { t: T.out, key: 'out', peak: 28.0, mode: 'DEPARTING', log: 'OPERATOR · HERO · RELEASE', assembly: 'HERO', labels: null },
];
export const SCRIPT = makeScript(ACTIONS, DURATION);
export const { actionIndex, actionByKey } = SCRIPT;
export const ASSEMBLY_JUMP = { HERO: 'walk', OPTICS: 'eyes', CHELAE: 'display', MOUTH: 'grab', CARAPACE: 'open', GILLS: 'bubbles' };

// 目の柄を立てる量(入ってくるときはたたんでいる)
export const eyesUpAt = (t) => keys(t, [[5.0, 0], [5.9, 1]]);
// 甲羅を開く量
export const shellAt = (t) => keys(t, [[17.35, 0], [18.8, 1], [21.4, 1], [22.6, 0]]);
// 泡の出る量(ふだんは少し、食べたあと・泡を吹くときは多く)
export const bubbleAt = (t) => 0.05 + keys(t, [[16.2, 0], [16.6, 0.35], [17.4, 0], [22.9, 0], [23.3, 1], [24.9, 1], [25.4, 0]]);
// 泡を吹く(エラのポンプ)
export const ventAt = (t) => keys(t, [[22.9, 0], [23.3, 1], [24.9, 1], [25.4, 0]]);
// 甲羅を開くとき、ふちのすき間から逃げる泡
export const rimBubbleAt = (t) => keys(t, [[17.35, 0], [17.6, 1], [18.3, 0.35], [19.0, 0]]);

export function evaluate(t) {
  const i = actionIndex(t);
  const act = ACTIONS[i];
  return {
    t,
    index: i,
    act,
    since: t - act.t,
    labelFade: labelFadeAt(SCRIPT, t, i),
    eyesUp: eyesUpAt(t),
    // 目の柄の向き(左右、外へ回すのが正)。見回す → はさみ → 拾う物を見る → ふだんの小さな動き
    lookL: keys(t, [[5.9, 0], [6.5, 0.62], [7.2, 0.62], [7.8, -0.5], [8.4, -0.1], [8.8, 0], [12.8, 0], [13.3, 0.45], [15.2, 0.2], [15.8, 0], [19.0, 0], [19.8, 0.4], [20.8, -0.3], [21.6, 0]]),
    lookR: keys(t, [[6.1, 0], [6.7, -0.55], [7.4, -0.55], [8.0, 0.55], [8.6, 0.1], [9.0, 0], [12.8, 0], [13.3, -0.35], [15.2, -0.15], [15.8, 0], [19.3, 0], [20.1, -0.45], [21.0, 0.25], [21.8, 0]]),
    eyeTilt: keys(t, [[12.8, 0], [13.3, 1], [15.0, 1], [15.6, 0]]),   // 目の柄を前へ倒す(拾う物を見る)
    scan: keys(t, [[5.6, 0], [6.0, 1], [8.2, 1], [8.6, 0]]),            // 目の縁が光る
    shell: shellAt(t),
    // 口の扉(第 3 顎脚)を開く量と、中の大顎を動かす量
    mouth: keys(t, [[15.15, 0], [15.5, 1], [16.35, 1], [16.75, 0], [23.0, 0], [23.4, 0.3], [25.0, 0.3], [25.4, 0]]),
    chew: keys(t, [[15.9, 0], [16.2, 1], [17.2, 1], [17.6, 0], [23.0, 0], [23.4, 0.5], [25.0, 0.5], [25.4, 0]]),
    vent: ventAt(t),
    bubbles: bubbleAt(t),
  };
}
