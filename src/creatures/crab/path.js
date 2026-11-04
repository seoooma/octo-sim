import * as THREE from 'three';
import { smootherstep, smoothstep, clamp } from '../../util.js';
import { keys } from '../../core/timeline.js';
import { makePath, makeProgress, bezierPoints, makeGait, makeWalker, FLOOR } from '../../core/walk.js';
import { STOP, RIDE, LEGS } from './layout.js';

// カニの体の道と足の運び。どれも時刻 t だけで決まる(仕組みは core/walk.js)。
// 横歩き: 体の向き yaw はほぼそのまま、道は横向き(walk.js は体の向きと進む向きが違っても足を運ぶ)

// 時刻の区切り
export const T = {
  in1: 4.6,                 // 横歩きで入り終える
  eyes: 4.8, display: 8.6, grab: 12.6, open: 17.0, bubbles: 22.8, out: 25.6,
  out0: 26.0,               // 横歩きで去り始める
  end: 31,
};

export const STRIDE = { floor: 0.78 };

// 入ってくる道(画面の右の奥から、止まる場所へ。床の x, z)と、去る道(左へ)
const WALK_IN = makePath(bezierPoints([[6.6, -0.55], [4.4, -0.4], [2.0, 0.05], [STOP.x, STOP.z]]));
const inProgress = makeProgress(0, T.in1, (t) => (1 - smootherstep(2.3, T.in1, t)) ** 0.7 + 0.02);
const WALK_OUT = makePath(bezierPoints([[STOP.x, STOP.z], [-2.0, 0.1], [-4.6, -0.15], [-7.6, -0.55]]));
const outProgress = makeProgress(T.out0, T.end, (t) => smootherstep(T.out0, T.out0 + 1.4, t) + 0.015);

// 体の向き: 入るときはこちらを少し向き、止まって正面へ。目で見回すあいだは少し左右へ回る。去るときはまた少し右を向く
const yawAt = (t) => keys(t, [[0, 0.38], [T.in1, 0.06], [5.2, 0], [6.3, 0.2], [7.6, -0.13], [8.4, 0], [25.8, 0], [26.8, 0.2]]);

const tmp = [0, 0];
export function travelAt(t, out = {}) {
  out.surface = 'floor';
  if (t <= T.in1) {
    WALK_IN.at(inProgress(t) * WALK_IN.total, tmp);
  } else if (t < T.out0) {
    tmp[0] = STOP.x;
    tmp[1] = STOP.z;
  } else {
    WALK_OUT.at(outProgress(t) * WALK_OUT.total, tmp);
  }
  out.p = [tmp[0], tmp[1]];
  out.yaw = yawAt(t);
  return out;
}

// ---- 歩数の元と足の運び(床だけ)
export const GAIT = { floor: makeGait(travelAt, 0, T.end, 1.1) };
const WALKER = makeWalker({ travelAt, surfaces: { floor: FLOOR }, gaits: GAIT, stride: STRIDE, legs: LEGS, duty: 0.6, lift: 0.24 });
export const { activityAt, legPhase, footAt } = WALKER;

// 横へ進む速さ(体の左 +x を正。床の単位/秒)
const ta = {}, tb = {};
export function sideSpeedAt(t) {
  travelAt(t - 0.08, ta);
  travelAt(t + 0.08, tb);
  const dx = (tb.p[0] - ta.p[0]) / 0.16, dz = (tb.p[1] - ta.p[1]) / 0.16;
  const y = (ta.yaw + tb.yaw) / 2;
  return dx * Math.cos(y) - dz * Math.sin(y);
}

// 体を持ち上げる量・前を上げる角度・左へ傾ける角度(足は床に置いたまま、脚の関節で吸収する)
// はさみを見せるときは立ち上がって前を上げ、拾うときは左前へかがむ。甲羅を開くあいだは少し沈む
export const riseAt = (t) => keys(t, [[8.7, 0], [9.4, 0.2], [11.9, 0.2], [12.6, 0], [13.0, 0], [13.5, -0.07], [14.6, -0.07], [15.3, 0], [17.2, 0], [17.8, -0.04], [21.8, -0.04], [22.6, 0]]);
export const pitchAt = (t) => keys(t, [[8.7, 0], [9.4, 0.17], [11.9, 0.17], [12.6, 0], [13.0, 0], [13.5, -0.09], [14.6, -0.09], [15.3, 0]]);
export const rollAt = (t) => keys(t, [[13.0, 0], [13.5, 0.06], [14.6, 0.06], [15.3, 0]]);

const qx = new THREE.Quaternion();
const eu = new THREE.Euler();
export function bodyPoseAt(t, outPos, outQuat) {
  const still = 1 - activityAt('floor', t);
  WALKER.bodyOnSurface(t, RIDE + riseAt(t) + 0.012 * still * Math.sin(1.7 * t), outPos, outQuat, 0.022);
  // 横へ進むときは進む側へ少し傾く(歩き出し・止まりで揺れる)
  const lean = clamp(sideSpeedAt(t) * 0.03, -0.06, 0.06);
  eu.set(-pitchAt(t) + 0.01 * still * Math.sin(1.1 * t + 1), 0, -(rollAt(t) + lean));
  outQuat.multiply(qx.setFromEuler(eu));
  return 'floor';
}

// 脚 i の時刻 t の様子: 'down'(足を置いている)・'swing'(運んでいる)
export const legStateAt = (i, t) => (legPhase('floor', i, t).stance ? 'down' : 'swing');

// 歩いている強さ(0〜1)
export const walkingAt = (t) => smoothstep(0.1, 0.6, activityAt('floor', t));
