// カニの足の運びを数値で確かめる: 足を置いているあいだのすべり・付け根から足までの距離(脚が届くか)・歩く速さ・はさみが届くか。
//   node tools/check/crab_gait.mjs
import * as THREE from 'three';
import { travelAt, bodyPoseAt, footAt, legPhase, GAIT, T, STRIDE } from '../../src/creatures/crab/path.js';
import { LEGS, SEG, CLAWS } from '../../src/creatures/crab/layout.js';
import { clawTargetAt } from '../../src/creatures/crab/claws.js';

console.log('gait total', GAIT.floor.total.toFixed(2), 'stride', STRIDE.floor);
const p = new THREE.Vector3(), q = new THREE.Quaternion(), f = new THREE.Vector3(), hip = new THREE.Vector3();
let slip = 0, maxReach = 0, minReach = 9, minAt = '', maxAt = '';
const prev = LEGS.map(() => null);
for (let t = 0; t < T.end; t += 1 / 60) {
  bodyPoseAt(t, p, q);
  LEGS.forEach((L, i) => {
    footAt('floor', i, t, f);
    const ph = legPhase('floor', i, t);
    if (ph.stance && prev[i] && prev[i].stance && prev[i].n === ph.n) slip = Math.max(slip, f.distanceTo(prev[i].f));
    prev[i] = { stance: ph.stance, n: ph.n, f: f.clone() };
    hip.fromArray(L.hip).applyQuaternion(q).add(p);
    const d = hip.distanceTo(f);
    if (d > maxReach) { maxReach = d; maxAt = `${t.toFixed(2)} ${L.name}`; }
    if (d < minReach) { minReach = d; minAt = `${t.toFixed(2)} ${L.name}`; }
  });
}
console.log('stance slip max', slip.toFixed(4), ' hip-foot', minReach.toFixed(2), `(${minAt})`, '..', maxReach.toFixed(2), `(${maxAt})`, ' leg max', (SEG[0] + SEG[1] + SEG[2]).toFixed(2));
for (const t of [0, 1, 2.4, 4, 4.6, 6.3, 7.6, 10, 14, 20, 26, 27, 29, 30.9]) {
  const tr = travelAt(t, {});
  bodyPoseAt(t, p, q);
  console.log(t.toFixed(1).padStart(5), 'body', p.toArray().map((v) => v.toFixed(2)).join(','), 'yaw', tr.yaw.toFixed(2), 'g', GAIT.floor.gAt(t).toFixed(2));
}
for (const [a, b] of [[0, 2], [2, 4.6], [5.5, 8.4], [26, 28], [28, 31]]) console.log(a, b, 'steps/s', ((GAIT.floor.gAt(b) - GAIT.floor.gAt(a)) / (b - a) / STRIDE.floor).toFixed(2));

// はさみ: 付け根から手首まで(台本の値で、腕の長さに収まるか)
const tg = { P: new THREE.Vector3(), D: new THREE.Vector3() };
for (const name of ['R', 'L']) {
  const c = CLAWS[name];
  let lo = 9, hi = 0;
  for (let t = 0; t < T.end; t += 0.05) {
    clawTargetAt(name, t, tg);
    const W = tg.P.clone().addScaledVector(tg.D, -c.reach);
    const d = W.distanceTo(new THREE.Vector3(...c.shoulder));
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  console.log('claw', name, 'shoulder-wrist', lo.toFixed(2), '..', hi.toFixed(2), ' arm', (c.arm[0] + c.arm[1]).toFixed(2), 'min', Math.abs(c.arm[0] - c.arm[1]).toFixed(2));
}
