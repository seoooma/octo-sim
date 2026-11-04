// サソリの動きを数値で確かめる: 足のすべり・脚が届くか・はさみが届くか・体が床に沈まないか・箱がはさむ瞬間に跳ばないか
//   node tools/check/scorpion_gait.mjs
import * as THREE from 'three';
import { bodyPoseAt, footAt, legPhase, GAIT, STRIDE } from '../../src/creatures/scorpion/path.js';
import { LEGS, SEG, PALP, T, FLOOR_Y, TAIL_BASE, TAIL_LEN, TELSON } from '../../src/creatures/scorpion/layout.js';
import { clawFrameAt, boxPoseAt } from '../../src/creatures/scorpion/claws.js';
import { tailAt } from '../../src/creatures/scorpion/tail.js';

const p = new THREE.Vector3(), q = new THREE.Quaternion(), f = new THREE.Vector3(), hip = new THREE.Vector3();
const up = new THREE.Vector3(), lA = new THREE.Vector3(), ankle = new THREE.Vector3();
let slip = 0, slipAt = '', maxReach = 0, minReach = 9, minAt = '', maxAt = '';
let clawMax = 0, clawAt = '', lowest = 9, lowAt = '';
const prev = LEGS.map(() => null);
const fr = {};
// 体の下の点(頭胸部・中体の腹の底)
const under = [[0, -0.2, 0.2], [0, -0.21, -0.3], [0, -0.21, -0.8], [0, -0.19, -1.25], [0, -0.12, -1.55]].map((a) => new THREE.Vector3(...a));
const w = new THREE.Vector3();
for (let t = 0; t < T.end; t += 1 / 60) {
  bodyPoseAt(t, p, q);
  LEGS.forEach((L, i) => {
    footAt('floor', i, t, f);
    const ph = legPhase('floor', i, t);
    if (ph.stance && prev[i] && prev[i].stance && prev[i].n === ph.n) {
      const d = f.distanceTo(prev[i].f);
      if (d > slip) { slip = d; slipAt = `${t.toFixed(2)} ${L.name}`; }
    }
    prev[i] = { stance: ph.stance, n: ph.n, f: f.clone() };
    hip.fromArray(L.hip).applyQuaternion(q).add(p);
    // model.js の poseLeg(ankleUp 0.6)と同じ足首: 足から上へ・付け根の側へ。腿 + 脛で届くか
    up.set(0, 1, 0).applyQuaternion(q);
    lA.subVectors(hip, f);
    lA.addScaledVector(up, -lA.dot(up)).normalize();
    ankle.copy(f).addScaledVector(up, SEG[2] * 0.6).addScaledVector(lA, SEG[2] * 0.8);
    const d = hip.distanceTo(ankle);
    if (d > maxReach) { maxReach = d; maxAt = `${t.toFixed(2)} ${L.name}`; }
    if (d < minReach) { minReach = d; minAt = `${t.toFixed(2)} ${L.name}`; }
  });
  for (const s of [1, -1]) {
    clawFrameAt(s, t, p, q, fr);
    const d = fr.hip.distanceTo(fr.wrist);
    if (d > clawMax) { clawMax = d; clawAt = `${t.toFixed(2)} ${s > 0 ? 'L' : 'R'}`; }
  }
  for (const u of under) {
    w.copy(u).applyQuaternion(q).add(p);
    if (w.y - FLOOR_Y < lowest) { lowest = w.y - FLOOR_Y; lowAt = t.toFixed(2); }
  }
}
console.log('立脚のすべり(最大)', slip.toFixed(4), 'at', slipAt);
console.log('付け根〜足首', minReach.toFixed(2), '..', maxReach.toFixed(2), ' 腿 + 脛', (SEG[0] + SEG[1]).toFixed(2), ' 最小', minAt, ' 最大', maxAt);
console.log('はさみ 付け根〜手首 最大', clawMax.toFixed(3), ' 届く長さ', (PALP[0] + PALP[1]).toFixed(2), 'at', clawAt);
console.log('体の底と床のすき間(最小)', lowest.toFixed(3), 'at', lowAt);
// 箱: はさむ瞬間の前後で位置が跳ばないか
const a = new THREE.Vector3(), b = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
boxPoseAt(T.close - 1e-4, a, qa);
boxPoseAt(T.close + 1e-4, b, qb);
console.log('箱の跳び(はさむ瞬間)', a.distanceTo(b).toFixed(4), ' 回転', (2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb))))).toFixed(4));
// 尾の先(針)の位置: 体の座標
const tl = { yaw: 0, a: new Array(6).fill(0) };
for (const t of [2.4, 7.3, 11.4, T.strike1 + 0.18, 14.3, T.strike2 + 0.18, 17.3, 23, 28.6]) {
  tailAt(t, tl);
  let y = TAIL_BASE[1], z = TAIL_BASE[2], cum = 0;
  for (let k = 0; k < 5; k++) { cum += tl.a[k]; y += Math.sin(cum) * TAIL_LEN[k]; z -= Math.cos(cum) * TAIL_LEN[k]; }
  cum += tl.a[5]; y += Math.sin(cum) * TELSON.len; z -= Math.cos(cum) * TELSON.len;
  console.log('t', t.toFixed(2).padStart(6), '針の先(体の座標) y', y.toFixed(2), 'z', z.toFixed(2));
}
for (const [a0, b0] of [[0.5, 3.5], [20.2, 21.2], [25.2, 26.4], [27.5, 30.5]]) console.log(a0, b0, '歩/秒', ((GAIT.floor.gAt(b0) - GAIT.floor.gAt(a0)) / (b0 - a0) / STRIDE.floor).toFixed(2));
