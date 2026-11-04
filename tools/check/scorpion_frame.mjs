// サソリのカメラの構図を数値で確かめる(ブラウザなし): 操作の見どころの時刻で、体が画面のどこに映るか。
//   node tools/check/scorpion_frame.mjs [W H]
// director.js と同じ置き方(shots の pos・target + 体の位置 × follow)で、モデルの頂点を 1600×900 に写して、
// 映る四角(左・上・右・下の画素)と、計器のない真ん中(330〜1270, 100〜750)からはみ出す量、
// 左下の OPERATING MODE の見出し(340〜620, 660〜750)に重なる頂点の割合を出す。
import * as THREE from 'three';
import { Scorpion } from '../../src/creatures/scorpion/model.js';
import { evaluate, ACTIONS } from '../../src/creatures/scorpion/timeline.js';
import { SHOTS } from '../../src/creatures/scorpion/shots.js';

const W = Number(process.argv[2] ?? 1600), H = Number(process.argv[3] ?? 900);
const model = new Scorpion();
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
const v = new THREE.Vector3(), tg = new THREE.Vector3();
const FREE = { x0: 330, y0: 100, x1: 1270, y1: 750 };
const TITLE = { x0: 340, y0: 660, x1: 620, y1: 750 };
const times = process.argv[4] ? process.argv[4].split(',').map(Number) : ACTIONS.map((a) => a.peak);
for (const t of times) {
  const s = evaluate(t);
  model.update(s, { spin: 0, uv: false, labels: true, turntable: false });
  const shot = SHOTS[s.act.key];
  const f = model.focus;
  tg.fromArray(shot.target).addScaledVector(f, shot.follow);
  cam.position.fromArray(shot.pos).addScaledVector(f, shot.follow);
  // 縦長の画面は遠ざける(director.js と同じ)
  const k = Math.min(1.8, Math.max(1, 1.15 / cam.aspect));
  cam.position.sub(tg).multiplyScalar(k).add(tg);
  cam.fov = shot.fov;
  cam.updateProjectionMatrix();
  cam.lookAt(tg);
  cam.updateMatrixWorld();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0, inTitle = 0, out = 0;
  model.group.updateMatrixWorld(true);
  let boxOn = false;
  model.box.updateMatrixWorld(true);
  v.setFromMatrixPosition(model.box.matrixWorld).project(cam);
  boxOn = Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1;
  model.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p; p = p.parent) if (p === model.box) return;   // 箱は数えない(別に映るかだけ見る)
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 60));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(cam);
      const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      n++;
      if (x > TITLE.x0 && x < TITLE.x1 && y > TITLE.y0 && y < TITLE.y1) inTitle++;
      if (x < FREE.x0 || x > FREE.x1 || y < FREE.y0 || y > FREE.y1) out++;
    }
  });
  const over = [FREE.x0 - x0, y0 - FREE.y0 < 0 ? FREE.y0 - y0 : 0, x1 - FREE.x1, y1 - FREE.y1].map((a) => Math.max(0, Math.round(a)));
  console.log(
    `t ${t.toFixed(2).padStart(6)} ${s.act.key.padEnd(7)} 四角 ${[x0, y0, x1, y1].map((a) => Math.round(a)).join(',').padEnd(20)}` +
      ` はみ出し 左${over[0]} 上${over[1]} 右${over[2]} 下${over[3]}  外 ${((out / n) * 100).toFixed(0)}%  見出し ${((inTitle / n) * 100).toFixed(1)}%  箱 ${boxOn ? '映る' : '-'}  体 ${f.toArray().map((a) => a.toFixed(2)).join(',')}`,
  );
}
