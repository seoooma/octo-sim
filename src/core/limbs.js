import * as THREE from 'three';

// 体と脚の形の共通の部品(蜘蛛・サソリ・カニなど)と、関節を解く道具。
// 材質 m は materials.js の makeMaterials()。e = { c: 中心 [x, y, z], r: 半径 [x, y, z] } は楕円体

// 楕円体の表面の点と向き(az: 前 +z から横 +x へ、el: 上へ)
export function onEllipsoid(e, az, el, outP, outN) {
  const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  outP.set(e.c[0] + e.r[0] * d.x, e.c[1] + e.r[1] * d.y, e.c[2] + e.r[2] * d.z);
  outN.set(d.x / e.r[0], d.y / e.r[1], d.z / e.r[2]).normalize();
  return outP;
}

// 楕円体の殻を板に分けたもの(下の暗い楕円体の上に、すき間をあけて白い板)
export function plates(e, m, { bands, segs, theta0 = 0, theta1 = Math.PI, axis = 'y', seam = 0.022, mat = m.shell }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.985, 40, 24), m.dark);
  const add = (mesh) => {
    if (axis === 'z') mesh.geometry.rotateX(Math.PI / 2);
    mesh.scale.set(e.r[0], e.r[1], e.r[2]);
    mesh.position.fromArray(e.c);
    g.add(mesh);
  };
  add(base);
  const dt = (theta1 - theta0) / bands, dp = (Math.PI * 2) / segs;
  for (let i = 0; i < bands; i++) {
    for (let k = 0; k < segs; k++) {
      add(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, k * dp + seam, dp - 2 * seam, theta0 + i * dt + seam, dt - 2 * seam), mat));
    }
  }
  return g;
}

export function rivets(points, m, r = 0.012) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 6, 4), m.dark, points.length);
  const mat = new THREE.Matrix4();
  points.forEach((p, i) => mesh.setMatrixAt(i, mat.makeTranslation(p.x, p.y, p.z)));
  return mesh;
}

export function makeEye(m, r) {
  // 目は +z が外向き
  const eye = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.38, r * 1.1, 32), m.shell);
  housing.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.18, r * 0.16, 12, 40), m.eyeRim);
  rim.position.z = r * 0.55;
  const lens = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, 1.2), m.glass);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = r * 0.3;
  eye.add(housing, rim, lens);
  return eye;
}

// 脚の 1 節(+y へ長さ len)。shell: 白い殻の太さ [付け根, 先]、joint: 付け根の関節の太さ
export function segment(m, len, { shell, joint, dark = false, piston = false, claw = false, band = false }) {
  const g = new THREE.Group();
  const prof = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const r = shell[0] + (shell[1] - shell[0]) * u;
    const cap = Math.sin(Math.PI * Math.min(1, Math.min(u, 1 - u) * 6)) ** 0.5;   // 両端を丸める
    prof.push(new THREE.Vector2(Math.max(0.004, r * (0.55 + 0.45 * cap)), u * len));
  }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 18), dark ? m.darkMetal : m.shell));
  // 関節(体の横向きの軸 = +z)
  const j = new THREE.Mesh(new THREE.CylinderGeometry(joint, joint, joint * 2.4, 20), m.darkMetal);
  j.rotation.x = Math.PI / 2;
  g.add(j);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(joint * 0.5, joint * 0.5, joint * 2.5, 16), m.orange);
  cap.rotation.x = Math.PI / 2;
  g.add(cap);
  if (band) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(shell[0] * 1.04, shell[0] * 1.04, len * 0.08, 18, 1, true), m.orange);
    b.position.y = len * 0.32;
    g.add(b);
  }
  if (piston) {
    // 油圧の筒と棒(殻の内側 -x に沿わせる)
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len * 0.4, 10), m.darkMetal);
    sleeve.position.set(-shell[0] * 1.05, len * 0.32, 0);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len * 0.45, 8), m.metal);
    rod.position.set(-shell[0] * 1.05, len * 0.72, 0);
    g.add(sleeve, rod);
  }
  if (claw) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(shell[1] * 1.6, 0.09, 12), m.orange);
    c.position.y = len + 0.02;
    g.add(c);
  }
  g.userData.len = len;
  return g;
}

// 2 本の骨の IK: 付け根 H から先 A へ、長さ l1・l2。膝は pole の向きへ曲げる。膝の位置を K に書く
const tD = new THREE.Vector3(), tP = new THREE.Vector3();
export function solve2(H, A, l1, l2, pole, K) {
  tD.subVectors(A, H);
  let d = tD.length();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
  tD.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const b = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  tP.copy(pole).addScaledVector(tD, -pole.dot(tD)).normalize();
  return K.copy(H).addScaledVector(tD, a).addScaledVector(tP, b);
}

// 節 obj を P から Q へ置く(+y を P→Q、+z を N に)。長さが違えば縦に伸ばす
const sY = new THREE.Vector3(), sZ = new THREE.Vector3(), sX = new THREE.Vector3(), sM = new THREE.Matrix4();
export function place(obj, P, Q, N) {
  sY.subVectors(Q, P);
  const len = sY.length();
  sY.divideScalar(len || 1);
  sZ.copy(N).addScaledVector(sY, -N.dot(sY));
  if (sZ.lengthSq() < 1e-8) sZ.set(0, 0, 1).addScaledVector(sY, -sY.z);
  sZ.normalize();
  sX.crossVectors(sY, sZ);
  obj.position.copy(P);
  obj.quaternion.setFromRotationMatrix(sM.makeBasis(sX, sY, sZ));
  obj.scale.set(1, len / obj.userData.len, 1);
}


// ---- 3 節の脚(腿・脛・先)。蜘蛛・サソリ・カニの歩く脚
// seg: 節の長さ [腿, 脛, 先]、size: 太さの倍率。group に部品を足し、脚の物を返す
export function buildLeg(m, group, seg, size = 1) {
  const coxa = new THREE.Mesh(new THREE.SphereGeometry(0.085 * size, 20, 12), m.darkMetal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085 * size, 0.022 * size, 8, 24), m.shell);
  ring.rotation.x = Math.PI / 2;
  coxa.add(ring);
  const femur = segment(m, seg[0], { shell: [0.075 * size, 0.058 * size], joint: 0.07 * size, piston: true, band: true });
  const tibia = segment(m, seg[1], { shell: [0.06 * size, 0.045 * size], joint: 0.062 * size });
  const tarsus = segment(m, seg[2], { shell: [0.04 * size, 0.016 * size], joint: 0.045 * size, dark: true, claw: true });
  group.add(coxa, femur, tibia, tarsus);
  return { seg, coxa, femur, tibia, tarsus, hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(), foot: new THREE.Vector3() };
}

// 脚を置く: 付け根 leg.hip と足 leg.foot(世界)、体の上の向き up、体の向き quat(付け根の玉)。
// 足首は足から上・付け根の側へ(先の節は下向きに斜め)、付け根〜足首は 2 本の骨の IK(膝は上へ)。
// ankleUp: 先の節の立ち具合(0 で寝る、1 で真上)
const lA = new THREE.Vector3(), lN = new THREE.Vector3();
export function poseLeg(leg, up, quat, ankleUp = 0.72) {
  const { seg } = leg;
  lA.subVectors(leg.hip, leg.foot);
  lA.addScaledVector(up, -lA.dot(up));
  if (lA.lengthSq() < 1e-8) lA.set(0, 0, 1);
  lA.normalize();
  const side = Math.sqrt(Math.max(0, 1 - ankleUp * ankleUp));
  leg.ankle.copy(leg.foot).addScaledVector(up, seg[2] * ankleUp).addScaledVector(lA, seg[2] * side);
  solve2(leg.hip, leg.ankle, seg[0], seg[1], up, leg.knee);
  lN.subVectors(leg.ankle, leg.hip).cross(up).normalize();
  leg.coxa.position.copy(leg.hip);
  leg.coxa.quaternion.copy(quat);
  place(leg.femur, leg.hip, leg.knee, lN);
  place(leg.tibia, leg.knee, leg.ankle, lN);
  place(leg.tarsus, leg.ankle, leg.foot, lN);
}
