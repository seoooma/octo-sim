import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../util.js';

// 外套の中の機械(外套を開いたときだけ見える)。
// 上: 黒い配線の束(ところどころオレンジの差し込み口)、中: 反応炉の輪、下: 7 本のピストン、横: 駆動の歯車。

// 歯車の輪郭(歯の数・外と内の半径)。穴あき
export function gearShape(teeth, rOut, rIn, hole = 0) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [a, rIn], [a + step * 0.12, rOut], [a + step * 0.45, rOut], [a + step * 0.57, rIn],
    ];
    pts.forEach(([ang, r], j) => {
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0 && j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  if (hole > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, hole, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  return shape;
}

export function gearGeometry(teeth, rOut, rIn, depth, hole = 0) {
  const g = new THREE.ExtrudeGeometry(gearShape(teeth, rOut, rIn, hole), { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// 配線の束: 球の中を縫うような曲線をたくさん作って 1 つにまとめる(種を決めて毎回同じ形)
function cableBundle(center, radius, count, seed) {
  const rnd = mulberry32(seed);
  const inSphere = (r) => {
    for (;;) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (v.lengthSq() <= 1) return v.multiplyScalar(r).add(center);
    }
  };
  const dark = [];
  const ends = [];
  for (let i = 0; i < count; i++) {
    const pts = [];
    for (let j = 0; j < 5; j++) pts.push(inSphere(radius * (j === 0 || j === 4 ? 1 : 0.85)));
    const curve = new THREE.CatmullRomCurve3(pts);
    dark.push(new THREE.TubeGeometry(curve, 28, 0.009 + rnd() * 0.009, 4, false).toNonIndexed());
    // 端の差し込み口(一部だけオレンジ)
    if (i % 9 === 0) {
      const p = curve.getPoint(1);
      const tan = curve.getTangent(1);
      const plug = new THREE.CylinderGeometry(0.03, 0.03, 0.07, 8);
      plug.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan));
      plug.translate(p.x, p.y, p.z);
      ends.push(plug.toNonIndexed());
    }
  }
  return { cables: mergeGeometries(dark), plugs: mergeGeometries(ends) };
}

export function buildCore(m) {
  const core = new THREE.Group();
  const anchors = {};

  // 配線の束
  const bundle = cableBundle(new THREE.Vector3(0, 0.38, 0), 0.6, 220, 7);   // 細い線が密な玉(見本どおり)
  const cables = new THREE.Mesh(bundle.cables, m.cable);
  const plugs = new THREE.Mesh(bundle.plugs, m.orange);
  core.add(cables, plugs);

  // 反応炉の輪(黒い太い輪に、白とオレンジの区切り)
  const ring = new THREE.Group();
  ring.position.y = 0.02;
  const ringBody = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.24, 64, 1, true), m.dark);
  ringBody.material = m.darkDS;
  const ringLip = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 8, 64), m.metal);
  ringLip.rotation.x = Math.PI / 2;
  ringLip.position.y = 0.12;
  ring.add(ringBody, ringLip);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.05), i % 3 === 0 ? m.orange : m.shell);
    block.position.set(Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8);
    block.rotation.y = a;
    ring.add(block);
  }
  core.add(ring);
  anchors.reactor = new THREE.Object3D();
  anchors.reactor.position.set(0.55, 0, 0.58);
  ring.add(anchors.reactor);

  // 7 本のピストン(噴射に合わせて上下する)
  const pistons = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * 0.42, -0.34, Math.cos(a) * 0.42);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 16), m.shell);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), m.metal);
    rod.position.y = 0.18;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), m.orange);
    head.position.y = 0.33;
    g.add(sleeve, rod, head);
    g.userData = { rod, head, phase: (i / 7) * Math.PI * 2 };
    pistons.push(g);
    core.add(g);
  }
  anchors.pump = new THREE.Object3D();
  anchors.pump.position.copy(pistons[0].position).add(new THREE.Vector3(0, 0.2, 0));
  core.add(anchors.pump);

  // 駆動の歯車(大 44 歯・小 18 歯がかみ合う)
  const gears = new THREE.Group();
  gears.position.set(-0.5, 0.05, 0.45);
  gears.rotation.y = -0.7;
  const big = new THREE.Mesh(gearGeometry(44, 0.26, 0.235, 0.05, 0.06), m.orange);
  const small = new THREE.Mesh(gearGeometry(18, 0.12, 0.097, 0.06, 0.03), m.metal);
  small.position.set(0.36, 0.0, 0.0);
  gears.add(big, small);
  core.add(gears);
  anchors.gears = new THREE.Object3D();
  anchors.gears.position.set(0, 0.2, 0.05);
  gears.add(anchors.gears);

  // open: 見せる量(0 なら隠す)、jet: 噴射の強さ
  function update(t, open, jet) {
    core.visible = open > 0.005;
    if (!core.visible) return;
    const speed = 1 + jet * 4;
    big.rotation.z = t * 0.6 * speed;
    small.rotation.z = -t * 0.6 * speed * (44 / 18) + 0.08;
    ring.rotation.y = t * 0.15;
    for (const p of pistons) {
      const y = 0.05 * Math.sin(t * (3 + jet * 8) + p.userData.phase);
      p.userData.rod.position.y = 0.18 + y;
      p.userData.head.position.y = 0.33 + y;
    }
    // 配線の束は外套が開くにつれて少し持ち上がる
    const lift = 0.25 * open;
    cables.position.y = lift;
    plugs.position.y = lift;
  }

  return { group: core, anchors, update };
}
