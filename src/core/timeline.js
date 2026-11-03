import { smootherstep, clamp } from '../util.js';

// 台本の共通の道具。生き物の状態は「時刻 t だけで決まる」ようにする(どこへ飛んでも同じ絵になる)。

// 区間の緩急: 既定は出だしと止まりをやわらかく、'in' はだんだん速く(飛び出す)、'out' はだんだん遅く(着く)
const EASE = {
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
};

// [時刻, 値, 緩急?] の並びをなめらかにつなぐ(値は数か配列。端の外は端の値。緩急はその点へ向かう区間に効く)
export function keys(t, list) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1, ease] = list[i];
    if (t > t1) continue;
    const [t0, v0] = list[i - 1];
    const x = clamp((t - t0) / (t1 - t0));
    const u = ease ? EASE[ease](x) : smootherstep(0, 1, x);
    return Array.isArray(v0) ? v0.map((a, j) => a + (v1[j] - a) * u) : v0 + (v1 - v0) * u;
  }
  return list[list.length - 1][1];
}

// 操作の並び(ACTIONS: { t, key, peak, mode, log, assembly, labels })から、時刻 → 何番目の操作か などを作る
export function makeScript(ACTIONS, DURATION) {
  const actionIndex = (t) => {
    let i = 0;
    while (i + 1 < ACTIONS.length && t >= ACTIONS[i + 1].t) i++;
    return i;
  };
  const actionByKey = (key) => ACTIONS.findIndex((a) => a.key === key);
  return { ACTIONS, DURATION, actionIndex, actionByKey };
}

// 引き出し線の濃さ: 操作が始まって少ししてから出し、次の操作の少し前に消す
export function labelFadeAt(script, t, i) {
  const act = script.ACTIONS[i];
  if (!act.labels) return 0;
  const next = script.ACTIONS[i + 1]?.t ?? script.DURATION;
  const u = clamp((t - act.t - 0.7) / 0.6);
  const d = clamp((t - (next - 0.5)) / 0.4);
  return u * u * (3 - 2 * u) * (1 - d * d * (3 - 2 * d));
}
