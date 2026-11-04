import * as THREE from 'three';
import { smoothstep, smootherstep } from '../../util.js';
import { keys } from '../../core/timeline.js';
import { makePath, makeProgress, bezierPoints, headingOn, wrapAngle, makeGait, makeWalker, FLOOR } from '../../core/walk.js';
import { T, RIDE, STOP, STOP2, GRIP_YAW, LEGS } from './layout.js';

// サソリの体の道と足の運び。どれも時刻 t だけで決まる(足の運びの仕組みは core/walk.js)。
// 面は床だけ。体は「位置 + 向き」で動き、その上に姿勢(持ち上げ・前後の傾き・突き出し・首振り)を足す。
// 姿勢は脚の付け根だけを動かし、足は床に置いたまま(関節で受ける)。

export const STRIDE = { floor: 0.62 };

// 床を歩いて入る道(右から左へ。止まったらその場で回ってこちらを向く)。床の (x, z)
const WALK_IN = makePath(bezierPoints([[5.8, 1.2], [3.7, 1.1], [1.6, STOP[1]], STOP]));
const walkInProgress = makeProgress(0, T.walkEnd, (t) => smoothstep(0, 0.5, t) * (1 - smootherstep(2.4, T.walkEnd, t)) ** 0.8 + 0.03);
// 後ろの箱へ 1 歩寄る
const approachProgress = makeProgress(T.turn1 - 0.2, T.approach1, (t) => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - T.turn1 + 0.2) / (T.approach1 - T.turn1 + 0.2)))) + 0.05);
// 箱を持って歩き去る(左の奥へ曲がっていく)
const dirG = [Math.sin(GRIP_YAW), Math.cos(GRIP_YAW)];
const WALK_OUT = makePath(bezierPoints([STOP2, [STOP2[0] + dirG[0] * 1.8, STOP2[1] + dirG[1] * 1.8], [-3.0, -3.3], [-6.4, -3.6]]));
const walkOutProgress = makeProgress(T.depart0, T.end, (t) => smoothstep(T.depart0, T.depart0 + 1.4, t) + 0.04);

const tmp = [0, 0];
const yawOf = (h) => Math.atan2(h[0], h[1]);
const WALK_IN_END_YAW = yawOf(headingOn(WALK_IN, WALK_IN.total - 0.3));

// 面の上の「進む位置と向き」(core/walk.js の travelAt の決めごと)
export function travelAt(t, out = {}) {
  out.surface = 'floor';
  if (t <= T.walkEnd) {
    const s = walkInProgress(t) * WALK_IN.total;
    WALK_IN.at(s, tmp);
    out.p = [tmp[0], tmp[1]];
    out.yaw = yawOf(headingOn(WALK_IN, Math.max(0.3, s)));
  } else if (t < T.turn0) {
    out.p = [STOP[0], STOP[1]];
    out.yaw = WALK_IN_END_YAW * (1 - smootherstep(T.walkEnd, T.pivot1, t));
  } else if (t < T.depart0) {
    // 後ろの箱へ向きを変え(右回り)、1 歩寄る
    const u = t < T.turn1 - 0.2 ? 0 : approachProgress(t);
    out.p = [STOP[0] + (STOP2[0] - STOP[0]) * u, STOP[1] + (STOP2[1] - STOP[1]) * u];
    out.yaw = GRIP_YAW * smootherstep(T.turn0, T.turn1, t);
  } else {
    const s = walkOutProgress(t) * WALK_OUT.total;
    WALK_OUT.at(s, tmp);
    out.p = [tmp[0], tmp[1]];
    const h = headingOn(WALK_OUT, Math.max(0.3, s));
    const w = smoothstep(0, 0.6, s);
    out.yaw = GRIP_YAW + wrapAngle(yawOf(h) - GRIP_YAW) * w;
  }
  return out;
}

// ---- 歩数の元(床だけ)と足の運び
export const GAIT = { floor: makeGait(travelAt, 0, T.end, 1.1) };
const WALKER = makeWalker({ travelAt, surfaces: { floor: FLOOR }, gaits: GAIT, stride: STRIDE, legs: LEGS, duty: 0.62, lift: 0.17 });
export const { activityAt, legPhase, footAt } = WALKER;

// ---- 姿勢(時刻だけで決まる)。lift: 体を持ち上げる高さ、pitch: 頭を上げる角度(正で頭が上)、
// lunge: 前へ突き出す量、yaw: 首振り(足は動かさずに体だけ回す)
// 刺す瞬間のふくらみ(ts の少し前に立ち上がり、ゆっくり戻る)
export function pulseAt(t, ts, rise = 0.14, fall = 0.5) {
  return t < ts ? smoothstep(ts - rise, ts, t) : 1 - smoothstep(ts, ts + fall, t);
}
export const strikeAt = (t, delay = 0) => Math.max(pulseAt(t, T.strike1 + delay), pulseAt(t, T.strike2 + delay));

export function stanceAt(t) {
  const strike = strikeAt(t);
  const lift = keys(t, [[5.1, 0], [6.0, 0.09], [8.7, 0.09], [9.6, 0.04], [12.2, 0.05], [16.2, 0.05], [16.8, 0], [22.0, 0], [22.8, -0.03], [23.4, -0.03], [24.3, 0.04], [25.2, 0.04], [26.2, 0]]) + 0.04 * strike;
  const pitch = keys(t, [[5.1, 0], [6.0, 0.13], [8.7, 0.13], [9.6, 0.05], [12.2, 0.05], [16.2, 0.03], [16.8, 0], [22.0, 0], [22.8, -0.09], [23.4, -0.09], [24.3, 0.03], [25.2, 0.03], [26.2, 0]]) - 0.15 * strike;
  const lunge = 0.12 * strike;
  // 首振り: 威嚇で相手を追う、UV で左右を見る
  const yaw =
    0.09 * Math.sin((t - 5.6) * 1.6) * smoothstep(5.4, 6.2, t) * (1 - smoothstep(8.4, 9.0, t)) +
    0.08 * Math.sin((t - 16.6) * 1.25) * smoothstep(16.4, 17.0, t) * (1 - smoothstep(19.2, 19.8, t));
  return { lift, pitch, lunge, yaw };
}

// ---- 体の位置と向き(体の座標 → 世界)
const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
const XA = new THREE.Vector3(1, 0, 0), YA = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1);
const fwd = new THREE.Vector3();

export function bodyPoseAt(t, outPos, outQuat) {
  const st = stanceAt(t);
  WALKER.bodyOnSurface(t, RIDE + st.lift, outPos, outQuat, 0.014);
  // 歩くと体が左右に少しよじれる(1 歩に 1 回)
  const g = GAIT.floor.gAt(t) / STRIDE.floor;
  const act = activityAt('floor', t);
  const wobble = 0.035 * Math.sin(2 * Math.PI * g) * act;
  const roll = 0.025 * Math.sin(2 * Math.PI * g + 1.2) * act;
  qy.setFromAxisAngle(YA, st.yaw + wobble);
  qx.setFromAxisAngle(XA, -st.pitch);
  qz.setFromAxisAngle(ZA, roll);
  outQuat.multiply(qy).multiply(qx).multiply(qz);
  fwd.set(0, 0, 1).applyQuaternion(outQuat);
  outPos.addScaledVector(fwd, st.lunge);
  return 'floor';
}
