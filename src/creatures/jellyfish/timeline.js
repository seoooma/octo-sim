import { smoothstep, smootherstep, clamp } from '../../util.js';
import { keys, makeScript, labelFadeAt } from '../../core/timeline.js';

// クラゲ(Benthos JL-1)の 30 秒の台本(8 回の操作)。状態は時刻 t だけで決まる(core/timeline.js)。
// 体の道と向きは swim.js、傘の板は bell.js、触手は tentacles.js(どれも時刻から決める)。
export const DURATION = 30;

// peak: 見どころの時刻、mode: 画面の大きな文字(12 文字まで)、log: 下のタイムラインの文字、
// assembly: 右の ASSEMBLIES のどれが光るか、labels: 引き出し線の組
export const ACTIONS = [
  { t: 0.0, key: 'drift', peak: 2.6, mode: 'DRIFTING', log: 'INBOUND · PASSIVE DESCENT', assembly: 'HERO', labels: 'drift' },
  { t: 4.8, key: 'pulse', peak: 7.2, mode: 'PULSE SWIM', log: 'OPERATOR · BELL PULSE · 1.05 HZ', assembly: 'BELL', labels: 'pulse' },
  { t: 9.8, key: 'net', peak: 12.3, mode: 'TENTACLE NET', log: 'OPERATOR · DEPLOY TENTACLE NET', assembly: 'TENTACLES', labels: 'net' },
  { t: 13.9, key: 'oral', peak: 15.8, mode: 'ORAL ARMS', log: 'OPERATOR · ISOLATE ORAL ARMS', assembly: 'ORAL ARMS', labels: 'oral' },
  { t: 17.4, key: 'lumen', peak: 19.3, mode: 'LUMINESCENCE', log: 'OPERATOR · BIOLUMINESCENCE', assembly: 'RIM LIGHTS', labels: 'lumen' },
  { t: 20.8, key: 'open', peak: 22.8, mode: 'BELL OPEN', log: 'OPERATOR · ISOLATE CORE', assembly: 'CORE', labels: 'open' },
  { t: 24.6, key: 'recoil', peak: 25.4, mode: 'RECOIL', log: 'ALERT · ESCAPE BURST', assembly: 'HERO', labels: null },
  { t: 27.2, key: 'ascend', peak: 28.4, mode: 'ASCENDING', log: 'OPERATOR · HERO · RELEASE', assembly: 'HERO', labels: null },
];

// 右の ASSEMBLIES ボタン → 飛ぶ先の操作
export const ASSEMBLY_JUMP = { HERO: 'drift', BELL: 'pulse', TENTACLES: 'net', 'ORAL ARMS': 'oral', 'RIM LIGHTS': 'lumen', CORE: 'open' };

export const SCRIPT = makeScript(ACTIONS, DURATION);
export const { actionIndex, actionByKey } = SCRIPT;

// 傘のひと打ち: 板を速く閉じて(close 秒)水を押し出し、ゆっくり開いて(open 秒)惰性で滑る。amp は強さ
const S = (t0, amp, close = 0.3, open = 0.75) => ({ t0, amp, close, open });
export const STROKES = [
  // 沈みながら入る: ときどきゆるく打ち、止まる前に 2 回打ってブレーキ
  S(0.9, 0.16, 0.45, 1.0), S(2.3, 0.2, 0.45, 1.0), S(3.55, 0.65), S(4.4, 0.45),
  // 脈で泳ぐ(1.05 Hz)
  S(5.0, 1), S(5.95, 1), S(6.9, 1), S(7.85, 1), S(8.8, 1), S(9.7, 0.45),
  // 漂う: ときどきゆるく打って浮き直す(傘を大きく開くあいだは打たない)
  S(11.2, 0.3, 0.35, 0.95), S(13.5, 0.3, 0.35, 0.95), S(16.0, 0.3, 0.35, 0.95), S(18.5, 0.3, 0.35, 0.95), S(20.2, 0.25, 0.35, 0.95),
  // 驚いて強く 3 回(短い間隔)、そのあと 1 回
  S(24.75, 1.35, 0.17, 0.36), S(25.3, 1.35, 0.17, 0.36), S(25.85, 1.25, 0.17, 0.42), S(26.55, 0.85, 0.22, 0.5),
  // 上へ去る
  S(27.35, 1, 0.28, 0.62), S(28.2, 1, 0.28, 0.62), S(29.05, 1, 0.28, 0.62),
];
const OVERSHOOT = 0.1;    // 開ききる手前で少し行き過ぎて戻る(蝶番のばね)
const SPAN = 1.3;         // 開く時間の何倍で 1 打ちが終わるか(行き過ぎの戻りまで)

// 1 打ちの閉じ具合(0〜1、行き過ぎは負)。u: 打ち始めからの秒
function strokeShape(u, st) {
  if (u <= 0) return 0;
  if (u < st.close) return smoothstep(0, st.close, u);
  const x = (u - st.close) / st.open;
  if (x >= SPAN) return 0;
  return 1 - smootherstep(0, 1, x) - OVERSHOOT * Math.sin(Math.PI * clamp((x - 0.5) / (SPAN - 0.5))) ** 2;
}

// 傘の閉じ具合(0 = ふだん、1 = 閉じきる。強い打ちは 1 を超える)
export function contractionAt(t) {
  let c = 0;
  for (const st of STROKES) {
    const u = t - st.t0;
    if (u > 0 && u < st.close + st.open * SPAN) c += st.amp * strokeShape(u, st);
  }
  return c;
}

// 押す力(0〜): 閉じているあいだに強くなり、開くあいだは惰性でゆっくり減る。体の速さ(swim.js)の元
export function thrustAt(t) {
  let f = 0;
  for (const st of STROKES) {
    const u = t - st.t0;
    if (u <= 0) continue;
    f += st.amp * (u < st.close ? Math.sin((Math.PI / 2) * (u / st.close)) ** 2 : Math.exp(-(u - st.close) * 2.6));
  }
  return f;
}

// 今の打ちの間隔から決めた脈の速さ(Hz。間があいたら 0)と、これまでに打った回数
export function pulseInfoAt(t) {
  let i = -1;
  while (i + 1 < STROKES.length && STROKES[i + 1].t0 <= t) i++;
  if (i < 0) return { hz: 0, count: 0 };
  const last = STROKES[i], prev = STROKES[i - 1], next = STROKES[i + 1];
  const gap = Math.min(prev ? last.t0 - prev.t0 : 9, next ? next.t0 - last.t0 : 9);
  const hz = t - last.t0 < 1.4 && gap < 1.4 ? 1 / gap : 0;
  return { hz, count: i + 1 };
}

// 傘の板を大きく開く(中の機械を見せる)・触手の網・口腕を広げる・光の波・驚いたときの点滅
export const openAt = (t) => keys(t, [[21.1, 0], [22.1, 1], [23.6, 1], [24.45, 0]]);
export const netAt = (t) => keys(t, [[10.1, 0], [11.5, 1], [13.1, 1], [14.2, 0]]);
export const oralAt = (t) => keys(t, [[14.1, 0], [15.1, 1], [16.7, 1], [17.6, 0]]);
export const lumenAt = (t) => keys(t, [[17.5, 0], [18.1, 1], [20.4, 1], [21.0, 0]]);
export const flashAt = (t) => keys(t, [[24.62, 0], [24.72, 1], [24.95, 0.3], [25.25, 1], [25.5, 0.3], [25.8, 0.8], [26.4, 0]]);
// 口腕の操作のあいだは、触手を少し外へ広げて口腕を見せる
export const partAt = (t) => keys(t, [[14.1, 0], [15.0, 0.32], [16.8, 0.32], [17.6, 0]]);

export function evaluate(t) {
  const i = actionIndex(t);
  const act = ACTIONS[i];
  return {
    t,
    index: i,
    act,
    since: t - act.t,
    labelFade: labelFadeAt(SCRIPT, t, i),
    contraction: contractionAt(t),
    thrust: thrustAt(t),
    open: openAt(t),
    net: netAt(t),
    oral: oralAt(t),
    part: partAt(t),
    lumen: lumenAt(t),
    flash: flashAt(t),
  };
}
