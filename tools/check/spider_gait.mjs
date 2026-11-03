import * as THREE from 'three';
import { travelAt, bodyPoseAt, footAt, legPhase, GAIT, T, STRIDE } from '../../src/creatures/spider/path.js';
import { LEGS, SEG } from '../../src/creatures/spider/layout.js';
console.log('gait totals floor', GAIT.floor.total.toFixed(2), 'web', GAIT.web.total.toFixed(2));
const p = new THREE.Vector3(), q = new THREE.Quaternion(), f = new THREE.Vector3(), hip = new THREE.Vector3();
let slip = 0, maxReach = 0, minReach = 9;
const prev = LEGS.map(() => null);
let minAt = 0;
for (let t = 0; t < T.end; t += 1/60) {
  const sb = bodyPoseAt(t, p, q);
  if (sb === 'air') continue;
  LEGS.forEach((L, i) => {
    footAt(sb, i, t, f);
    const ph = legPhase(sb, i, t);
    if (ph.stance && prev[i] && prev[i].stance && prev[i].n === ph.n && prev[i].surf === sb) slip = Math.max(slip, f.distanceTo(prev[i].f));
    prev[i] = { stance: ph.stance, n: ph.n, f: f.clone(), surf: sb };
    hip.fromArray(L.hip).applyQuaternion(q).add(p);
    const d = hip.distanceTo(f);
    maxReach = Math.max(maxReach, d); if (d < minReach) { minReach = d; minAt = t + ' ' + L.name; }
  });
}
console.log('stance slip max', slip.toFixed(4), ' hip-foot dist', minReach.toFixed(2), '..', maxReach.toFixed(2), ' leg max', (SEG[0]+SEG[1]+SEG[2]).toFixed(2), ' min at', minAt);
for (const t of [0, 2, 4.9, 6, 9, 12, 14.5, 16, 19.5, 23, 26.9, 28, 29.9]) { const tr = travelAt(t, {}); bodyPoseAt(t, p, q); const g = tr.surface==='floor'?GAIT.floor.gAt(t):tr.surface==='web'?GAIT.web.gAt(t):0; console.log(t.toString().padStart(5), tr.surface.padEnd(5), 'body', p.toArray().map(v=>v.toFixed(2)).join(','), 'yaw', (tr.yaw??0).toFixed(2), 'g', g.toFixed(2)); }
for (const [a,b,s] of [[1,3,'floor'],[5.2,7.2,'floor'],[15,18,'web'],[20,27,'web'],[27.9,28.5,'web'],[29,30,'web']]) console.log(a,b,s,'steps/s', ((GAIT[s].gAt(b)-GAIT[s].gAt(a))/(b-a)/STRIDE[s]).toFixed(2));
