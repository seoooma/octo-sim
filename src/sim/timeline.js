import { smoothstep, smootherstep, clamp, fract } from '../util.js';

// 25 秒の台本(8 回の操作)。ロボットの状態は「時刻 t だけで決まる」ようにする。
// どこへ飛んでも(シーク・?t= の静止画)同じ絵になる。
export const DURATION = 25;

// peak: 見どころの時刻(止めているとき ASSEMBLIES を押すとここへ飛ぶ)、mode: 画面の大きな文字、log: 下のタイムラインの文字、
// assembly: 右の ASSEMBLIES のどれが光るか、labels: 引き出し線の組
export const ACTIONS = [
  { t: 0.0, key: 'inbound', peak: 1.0, mode: 'JETTING', log: 'INBOUND · JET ASSIST', assembly: 'HERO', labels: null },
  { t: 3.5, key: 'hold', peak: 5.2, mode: 'HOLDING', log: 'OPERATOR · HOLD STATION', assembly: 'HERO', labels: null },
  { t: 6.0, key: 'mantle', peak: 7.9, mode: 'MANTLE OPEN', log: 'OPERATOR · ISOLATE MANTLE', assembly: 'MANTLE', labels: 'mantle' },
  { t: 9.0, key: 'arm', peak: 11.0, mode: 'ARM R2 APART', log: 'OPERATOR · ISOLATE ARM R2', assembly: 'ARM R2', labels: 'arm' },
  { t: 12.2, key: 'optics', peak: 13.6, mode: 'OPTICS SCAN', log: 'OPERATOR · ISOLATE OPTICS', assembly: 'OPTICS', labels: 'optics' },
  { t: 14.6, key: 'beak', peak: 16.6, mode: 'BEAK OPEN', log: 'OPERATOR · ISOLATE BEAK', assembly: 'BEAK', labels: 'beak' },
  { t: 18.2, key: 'siphon', peak: 19.8, mode: 'SIPHON TEST', log: 'OPERATOR · ISOLATE SIPHON', assembly: 'SIPHON', labels: 'siphon' },
  { t: 21.2, key: 'depart', peak: 23.5, mode: 'DEPARTING', log: 'OPERATOR · HERO · RELEASE', assembly: 'HERO', labels: null },
];

// 右の ASSEMBLIES ボタン → 飛ぶ先の操作
export const ASSEMBLY_JUMP = { HERO: 'inbound', OPTICS: 'optics', MANTLE: 'mantle', 'ARM R2': 'arm', SIPHON: 'siphon', BEAK: 'beak' };

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

export function actionIndex(t) {
  let i = 0;
  while (i + 1 < ACTIONS.length && t >= ACTIONS[i + 1].t) i++;
  return i;
}

export const actionByKey = (key) => ACTIONS.findIndex((a) => a.key === key);

// 噴射の強さ(0〜1)。入ってくるとき・噴射口の試験・出ていくとき
export const jetAt = (t) =>
  keys(t, [[0, 1], [2.6, 1], [3.7, 0], [19.0, 0], [19.3, 0.7], [20.3, 0.7], [20.6, 0], [21.65, 0], [21.8, 1]]);

// 出ていく前の「吸い込み」(腕を開いて先を巻く、0.45 秒ためて一気に噴く)
export const windupAt = (t) => keys(t, [[21.15, 0], [21.6, 1], [21.85, 0]]);

// ふだんの「ひとかき」: 4.6 秒に 1 回、0.6 秒かけて腕を少し閉じる(体はそれに遅れて少し浮く)
export function strokeAt(t) {
  const x = fract(t / 4.6 + 0.3) / 0.13;
  return x < 1 ? Math.sin(Math.PI * x) ** 2 : 0;
}

// ロボットの位置と向き(x, y, z の回転)。入ってくるときは右下から左上へ、出ていくときは右上へ
// 入ってくるときはだんだん遅く(着く)、出ていくときはだんだん速く(画面の外まで)
const POS = [[0, [2.4, -1.3, 0.6]], [3.7, [0, 0, 0], 'out'], [21.7, [0, 0, 0]], [25, [8.5, 5.2, -2.4], 'in']];
const ROT = [
  [0, [0.38, -0.55, 0.95]], [3.9, [0, 0, 0], 'out'],
  [14.7, [0, 0, 0]], [15.6, [-0.65, 0.35, 0]], [17.6, [-0.65, 0.35, 0]], [18.4, [0, 0, 0]],
  [21.6, [0, 0, 0]], [22.9, [0.32, 0.5, -1.45]], [25, [0.32, 0.5, -1.45]],
];
export const posAt = (t) => keys(t, POS);
export const rotAt = (t) => keys(t, ROT);

// 腕の形の重み(なびく・放射状・ふだん)。腕ごとに少しずらした時刻で呼ぶと、形の変化が腕から腕へ波のように伝わる
export function poseAt(t) {
  const trail = keys(t, [[0, 1], [2.5, 1], [4.4, 0], [21.8, 0], [22.6, 1]]);
  const star = keys(t, [[14.7, 0], [15.8, 1], [17.4, 1], [18.5, 0]]);
  return { trail, star, hold: clamp(1 - trail - star) };
}

// 噴射の脈(0〜1)。1 のとき水を押し出す(圧力の山)
export const PULSE_HZ = 1.8;
export function pulseAt(t) {
  const f = fract(PULSE_HZ * t);
  return f < 0.3 ? smoothstep(0, 0.3, f) : 1 - smoothstep(0.3, 1, f);   // 速く押し出して、ゆっくり吸う
}

export function evaluate(t) {
  const i = actionIndex(t);
  const act = ACTIONS[i];
  const next = ACTIONS[i + 1]?.t ?? DURATION;
  const pose = poseAt(t);
  return {
    t,
    index: i,
    act,
    since: t - act.t,
    // 引き出し線: 操作が始まって少ししてから出し、次の操作の少し前に消す
    labelFade: act.labels ? smoothstep(0.7, 1.3, t - act.t) * (1 - smoothstep(next - 0.5, next - 0.1, t)) : 0,
    mantleOpen: keys(t, [[6.3, 0], [7.4, 1], [8.4, 1], [9.1, 0]]),
    armApart: keys(t, [[9.4, 0], [10.5, 1], [11.6, 1], [12.3, 0]]),
    opticsScan: keys(t, [[12.5, 0], [13.0, 1], [14.1, 1], [14.6, 0]]),
    beakOpen: keys(t, [[15.4, 0], [16.2, 1], [17.2, 1], [17.9, 0]]),
    siphonOpen: keys(t, [[18.4, 0], [18.9, 1], [20.5, 1], [21.0, 0]]),
    jet: jetAt(t),
    windup: windupAt(t),
    pose,
    pos: posAt(t),
    rot: rotAt(t),
  };
}
