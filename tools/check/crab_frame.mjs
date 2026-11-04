// カニの構図を数値で確かめる: 操作ごとの見どころの時刻で、体・脚・はさみが画面のどこに映るか(1600×900)。
// 画面の外へ切れていないか、左下の大きな文字(OPERATING MODE)や計器の板に大きく重なっていないかを見る。
//   node tools/check/crab_frame.mjs [幅 高さ]
import * as THREE from 'three';
import creature from '../../src/creatures/crab/index.js';
import { smoothstep, lerp } from '../../src/util.js';

const W = Number(process.argv[2] ?? 1600), H = Number(process.argv[3] ?? 900);
const model = creature.createModel();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
const { ACTIONS } = creature.script;
// 画面の板(1600×900 のとき): 左の計器・右の計器・左下の大きな文字・下のタイムライン
const RECTS = W === 1600 ? {
  left: [0, 100, 318, 750], right: [1282, 100, 1600, 750], mode: [340, 665, 600, 750], log: [528, 760, 1472, 860],
} : {};
const box = new THREE.Box3(), v = new THREE.Vector3(), c = new THREE.Vector3();
const posA = new THREE.Vector3(), posB = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
const place = (shot, robot, P, T) => {
  T.fromArray(shot.target).addScaledVector(robot, shot.follow);
  P.fromArray(shot.pos).addScaledVector(robot, shot.follow);
};

for (const [i, act] of ACTIONS.entries()) {
  const times = process.env.T ? process.env.T.split(',').map(Number) : [act.peak];
  for (const t of times) {
    if (t < act.t || (ACTIONS[i + 1] && t >= ACTIONS[i + 1].t)) continue;
    const s = creature.evaluate(t);
    model.update(s, { spin: 0, shell: true, bubbles: false, labels: true });
    const robot = model.focus;
    const cur = creature.shots[act.key], prev = creature.shots[ACTIONS[(i + ACTIONS.length - 1) % ACTIONS.length].key];
    const u = smoothstep(0, 1.6, s.since);
    place(prev, robot, posA, tA);
    place(cur, robot, posB, tB);
    const sa = new THREE.Spherical().setFromVector3(posA.clone().sub(tA));
    const sb = new THREE.Spherical().setFromVector3(posB.clone().sub(tB));
    let dTh = sb.theta - sa.theta;
    if (dTh > Math.PI) dTh -= Math.PI * 2;
    if (dTh < -Math.PI) dTh += Math.PI * 2;
    const sph = new THREE.Spherical(lerp(sa.radius, sb.radius, u) * Math.min(1.8, Math.max(1, 1.15 / camera.aspect)), lerp(sa.phi, sb.phi, u), sa.theta + dTh * u);
    const target = tA.clone().lerp(tB, u);
    camera.fov = lerp(prev.fov, cur.fov, u);
    camera.updateProjectionMatrix();
    camera.position.setFromSpherical(sph).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    model.group.updateMatrixWorld(true);
    // 体・脚・はさみの各部品の真ん中を画面へ
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    const hits = {};
    const out = [];
    model.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
      if (o.parent === model.fx.group || o.parent?.parent === model.fx.group) return;
      o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.getCenter(c);
      v.copy(c).project(camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      n++;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      if (px < 0 || px > W || py < 0 || py > H) out.push(o.name || o.geometry.type);
      for (const [k, [a, b, cc, d]] of Object.entries(RECTS)) if (px > a && px < cc && py > b && py < d) hits[k] = (hits[k] ?? 0) + 1;
    });
    // 足の先(部品の真ん中より外へ出る)
    for (const leg of model.legs) {
      v.copy(leg.foot).applyMatrix4(model.group.matrixWorld).project(camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      for (const [k, [a, b, cc, d]] of Object.entries(RECTS)) if (px > a && px < cc && py > b && py < d) hits['foot-' + k] = (hits['foot-' + k] ?? 0) + 1;
    }
    console.log(`${act.key.padEnd(8)} t=${t.toFixed(1).padStart(4)}  x ${x0.toFixed(0)}..${x1.toFixed(0)}  y ${y0.toFixed(0)}..${y1.toFixed(0)}  parts ${n}  off-screen ${out.length}  on-panels ${JSON.stringify(hits)}`);
  }
}
