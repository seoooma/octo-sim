import * as THREE from 'three';
import { keys } from '../../core/timeline.js';
import { smoothstep, smootherstep } from '../../util.js';
import { solve2 } from '../../core/limbs.js';
import { T, PALP, PALP_HIP, HAND, BOX, FLOOR_Y } from './layout.js';
import { bodyPoseAt, strikeAt, GAIT, STRIDE, activityAt } from './path.js';

// はさみ(触肢)の動き。どれも時刻 t だけで決まる。
// 形は「つかむ点 G(指のあいだ)・手の向き D・手のひねり roll・指の開き open」(体の座標、左のはさみ)で決め、
// 手首 = G − D × HAND.grip。付け根〜手首は 2 本の骨の IK(肘は横の外・上へ)。右は左右を反対にする。

// [Gx, Gy, Gz, Dx, Dy, Dz, roll, open](左のはさみ。x は外向きが正)
const P = {
  REST: [0.64, -0.1, 1.62, -0.2, -0.12, 1, 0, 0.14],       // 歩くとき: 前に低く構える
  THREAT: [1.0, 0.5, 1.5, 0.42, 0.4, 1, -0.3, 0.95],       // 威嚇: 持ち上げて大きく開く
  ARCH: [0.8, 0.16, 1.6, 0.08, 0.08, 1, -0.1, 0.4],
  STING: [0.98, 0.04, 1.42, 0.3, 0.05, 1, -0.1, 0.55],      // 刺すあいだは横へ広げる(針の通り道をあける)
  SCAN: [0.68, -0.02, 1.62, -0.1, 0, 1, 0, 0.22],
  BRACE: [0.8, 0.06, 1.5, 0.15, 0.05, 1, -0.1, 0.3],        // 反対のはさみが箱をはさむあいだ
};
const KEYS = [
  [0, P.REST], [5.2, P.REST], [6.1, P.THREAT], [8.7, P.THREAT], [9.8, P.ARCH],
  [12.5, P.ARCH], [12.9, P.STING], [15.8, P.STING], [16.6, P.SCAN], [19.8, P.SCAN],
  [21.6, P.BRACE], [25.2, P.BRACE], [26.4, P.REST],
];
// 威嚇のときの、はさみを鳴らす時刻(左右で少しずらす)
const SNAPS = { 1: [6.45, 7.55, 8.25], [-1]: [6.75, 7.9] };

// 右のはさみが箱をはさむ: 箱の上へ → 下ろす → 閉じる(T.close)→ 持ち上げる → 持って歩く
const D_GRIP = [0.12, -0.62, 1];       // 箱をつかむときの手の向き(前下)
const OPEN_HOLD = 0.3;                 // 箱をはさんだときの開き
export const BOX_CENTER = new THREE.Vector3(BOX.x, FLOOR_Y + BOX.size[1] / 2, BOX.z);

const bp = new THREE.Vector3(), bq = new THREE.Quaternion(), bqi = new THREE.Quaternion();
// 世界の点 → 時刻 t の体の座標
function toBody(t, world, out) {
  bodyPoseAt(t, bp, bq);
  bqi.copy(bq).invert();
  return out.copy(world).sub(bp).applyQuaternion(bqi);
}
// はさんだ瞬間の、箱の真ん中(体の座標)。これより後は体の座標で持ち上げる
const ATTACH = toBody(T.close, BOX_CENTER, new THREE.Vector3());
const A = [-ATTACH.x, ATTACH.y, ATTACH.z];   // 左の向きにそろえた値(x の符号を反対に)
const CARRY_KEYS = [
  [T.close, [A[0], A[1], A[2], -D_GRIP[0], D_GRIP[1], D_GRIP[2], 0, OPEN_HOLD]],
  [T.close + 0.15, [A[0], A[1] + 0.02, A[2], -D_GRIP[0], D_GRIP[1], D_GRIP[2], 0, OPEN_HOLD]],
  [T.lift1, [0.64, 0.6, 1.42, -0.12, -0.05, 1, 0.12, OPEN_HOLD]],      // 持ち上げて顔の右前へ(箱が手に隠れない)
  [24.9, [0.6, 0.64, 1.4, -0.18, 0.0, 1, -0.2, OPEN_HOLD]],             // ひねって見る
  [26.2, [0.56, 0.22, 1.46, -0.15, -0.1, 1, 0, OPEN_HOLD]],             // 持って歩く
];

const tmp = new THREE.Vector3();
// 体の座標の目標(左のはさみの向きにそろえて書き、side で左右を決める)。out = { G, D, roll, open }
export function clawTargetAt(side, t, out) {
  out.G ??= new THREE.Vector3();
  out.D ??= new THREE.Vector3();
  let v = keys(t, KEYS);
  if (side < 0 && t >= T.close) v = keys(t, CARRY_KEYS);
  out.G.set(side * v[0], v[1], v[2]);
  out.D.set(side * v[3], v[4], v[5]);
  out.roll = side * v[6];
  out.open = v[7];
  if (side < 0 && t > T.reach0 && t < T.close) {
    // 箱へ: 上へ運ぶ(reach0〜reach1)→ 下ろす(〜close の少し前)。箱は床に固定なので、今の体の座標に直して追う
    const w = smootherstep(T.reach0, T.reach1, t);
    const hover = 0.3 * (1 - smootherstep(T.reach1, T.close - 0.12, t));
    toBody(t, BOX_CENTER, tmp);
    tmp.y += hover;
    tmp.z -= hover * 0.25;
    out.G.lerp(tmp, w);
    tmp.set(D_GRIP[0], D_GRIP[1], D_GRIP[2]);
    out.D.lerp(tmp, w);
    out.roll *= 1 - w;
    // 下ろしながら開き、触れたら閉じる
    out.open = out.open + (0.75 - out.open) * w;
    out.open += (OPEN_HOLD - out.open) * smoothstep(T.close - 0.22, T.close, t);
  }
  // 威嚇: はさみを鳴らす(閉じてすぐ開く)
  for (const ts of SNAPS[side]) {
    const k = t < ts ? smoothstep(ts - 0.09, ts, t) : 1 - smoothstep(ts + 0.05, ts + 0.32, t);
    out.open *= 1 - 0.92 * k;
  }
  // 刺す瞬間に、両方のはさみを内へ寄せて閉じる(獲物を押さえる)
  const st = strikeAt(t);
  out.G.x -= side * 0.14 * st;
  out.G.z += 0.06 * st;
  out.open *= 1 - 0.7 * st;
  // 生きている揺れと、歩く揺れ
  const act = activityAt('floor', t);
  const g = GAIT.floor.gAt(t) / STRIDE.floor;
  const calm = side < 0 && t > T.reach0 && t < T.lift1 ? 0.3 : 1;   // 箱をはさむ手は揺らさない
  out.G.x += calm * 0.018 * Math.sin(1.3 * t + side);
  out.G.y += calm * (0.02 * Math.sin(1.7 * t + 2 * side) + 0.03 * act * Math.sin(2 * Math.PI * g + (side > 0 ? 0 : Math.PI)));
  out.G.z += calm * 0.04 * act * Math.sin(2 * Math.PI * g + (side > 0 ? 0.5 : 0.5 + Math.PI));
  out.D.normalize();
  return out;
}

// ---- 関節を解く: 付け根・肘・手首・つかむ点(世界)と、手の向き(四元数。手の +z が前、+y が上、+x が体の左)
const upW = new THREE.Vector3(), pole = new THREE.Vector3(), zA = new THREE.Vector3(), xA = new THREE.Vector3(), yA = new THREE.Vector3();
const M = new THREE.Matrix4(), qRoll = new THREE.Quaternion();
const tg = {};
export function clawFrameAt(side, t, bodyPos, bodyQuat, out) {
  out.hip ??= new THREE.Vector3();
  out.elbow ??= new THREE.Vector3();
  out.wrist ??= new THREE.Vector3();
  out.grip ??= new THREE.Vector3();
  out.quat ??= new THREE.Quaternion();
  clawTargetAt(side, t, tg);
  out.open = tg.open;
  out.hip.set(side * PALP_HIP[0], PALP_HIP[1], PALP_HIP[2]).applyQuaternion(bodyQuat).add(bodyPos);
  out.grip.copy(tg.G).applyQuaternion(bodyQuat).add(bodyPos);
  zA.copy(tg.D).applyQuaternion(bodyQuat);
  // 手の向き: 前 = D、上 = 体の上を D のまわりに roll だけひねる
  upW.set(0, 1, 0).applyQuaternion(bodyQuat);
  qRoll.setFromAxisAngle(zA, tg.roll);
  upW.applyQuaternion(qRoll);
  xA.crossVectors(upW, zA).normalize();
  yA.crossVectors(zA, xA);
  out.quat.setFromRotationMatrix(M.makeBasis(xA, yA, zA));
  // 手首: つかむ点から手の軸に沿って戻る(つかむ点は動く指の側へ少し寄っている)
  out.wrist.copy(out.grip).addScaledVector(zA, -HAND.grip).addScaledVector(xA, -side * HAND.off);
  // 肘は横の外・上・少し後ろへ
  pole.set(side, 0.7, -0.25).applyQuaternion(bodyQuat);
  solve2(out.hip, out.wrist, PALP[0], PALP[1], pole, out.elbow);
  return out;
}

// 箱の世界の位置と向き: はさむまでは床、はさんだあとは手にくっついて動く
const fr = {}, bp2 = new THREE.Vector3(), bq2 = new THREE.Quaternion();
const attachLocal = (() => {
  bodyPoseAt(T.close, bp2, bq2);
  clawFrameAt(-1, T.close, bp2, bq2, fr);
  // 手の座標で見た箱(位置は G = 箱の真ん中、向きは床に置いたままの向き)
  const qi = fr.quat.clone().invert();
  return { pos: BOX_CENTER.clone().sub(fr.grip).applyQuaternion(qi), quat: qi.clone() };
})();
export function boxPoseAt(t, outPos, outQuat) {
  if (t < T.close) {
    outPos.copy(BOX_CENTER);
    outQuat.identity();
    return false;
  }
  bodyPoseAt(t, bp2, bq2);
  clawFrameAt(-1, t, bp2, bq2, fr);
  outPos.copy(attachLocal.pos).applyQuaternion(fr.quat).add(fr.grip);
  outQuat.copy(fr.quat).multiply(attachLocal.quat);
  return true;
}
