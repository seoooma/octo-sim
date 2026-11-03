import * as THREE from 'three';

// 座標: 胴の中心が原点、y が上、正面(目の向き)が +z。外套(頭)の半径が 1。
const R = 1;
const STRETCH = 1.04;   // 外套を縦に少し伸ばす
const PETALS = 8;       // 外套の花びら(縦の継ぎ目で分かれた板)の数。あとで開く
const ROWS = [[0.15, 0.6], [0.6, 1.1], [1.1, 1.6], [1.6, 2.05]];  // 横の継ぎ目(上からの角度 θ)。下は赤道より下まで包む
const SEAM = 0.006;     // 継ぎ目の幅(ラジアン)
const BOTTOM = ROWS[ROWS.length - 1][1];

export const ARM_COUNT = 8;
export const ARM_BASE_Y = -0.62;   // 腕の付け根の高さ(首輪の真ん中)
export const ARM_BASE_R = 0.86;    // 腕の付け根の中心からの距離

// 腕 k の向き(正面から +x 側へ測った角度)。正面の左右に1本ずつ来るよう 22.5° ずらす
export const armAngle = (k) => Math.PI / 8 + (k * 2 * Math.PI) / ARM_COUNT;

// 外套の表面の点。φ は three の SphereGeometry と同じ(φ=π/2 が正面 +z)
function surface(theta, phi, r = R) {
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta) * STRETCH,
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function slice(r, phi0, phiLen, theta0, thetaLen, w = 24, h = 12) {
  const g = new THREE.SphereGeometry(r, w, h, phi0, phiLen, theta0, thetaLen);
  g.scale(1, STRETCH, 1);
  return g;
}

function makeEye(m) {
  // 目の部品は +z が外向き
  const eye = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.42, 48), m.shell);
  housing.rotation.x = Math.PI / 2;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.034, 20, 64), m.orange);
  bezel.position.z = 0.215;
  const flange = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 16, 64), m.shell);
  flange.position.z = 0.222;
  const well = new THREE.Mesh(new THREE.CircleGeometry(0.27, 48), m.dark);
  well.position.z = 0.212;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.014, 12, 64), m.metal);
  ring.position.z = 0.216;
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.24, 48, 16, 0, Math.PI * 2, 0, 0.8), m.glass);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.214 - 0.24 * Math.cos(0.8);
  const iris = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.01, 8, 48), m.metal);
  iris.position.z = 0.27;
  eye.add(housing, bezel, flange, well, ring, lens, iris);
  return eye;
}

export function buildBody(m) {
  const body = new THREE.Group();

  // 継ぎ目から見える内側(黒)
  body.add(new THREE.Mesh(slice(0.985, 0, Math.PI * 2, 0, Math.PI, 48, 24), m.seam));

  // 外套の花びら 8 枚 × 横 3 段
  const petals = [];
  const rivets = [];
  const dphi = (Math.PI * 2) / PETALS;
  for (let k = 0; k < PETALS; k++) {
    const petal = new THREE.Group();
    const phi0 = Math.PI / 2 + k * dphi;
    for (const [t0, t1] of ROWS) {
      petal.add(new THREE.Mesh(slice(R, phi0 + SEAM, dphi - 2 * SEAM, t0 + SEAM, t1 - t0 - 2 * SEAM), m.shell));
      // 板の四隅と縦の縁にリベット
      for (let t = t0 + 0.07; t < t1 - 0.04; t += 0.14) {
        rivets.push(surface(t, phi0 + 0.04, 1.002), surface(t, phi0 + dphi - 0.04, 1.002));
      }
    }
    // オレンジの差し色の板と、黒い通気口
    if (k % 3 === 1) {
      petal.add(new THREE.Mesh(slice(1.006, phi0 + 0.2, 0.22, 0.78, 0.17, 6, 4), m.orange));
    }
    if (k % 4 === 2) {
      petal.add(new THREE.Mesh(slice(1.006, phi0 + 0.16, 0.42, 0.34, 0.06, 8, 2), m.dark));
      petal.add(new THREE.Mesh(slice(1.006, phi0 + 0.16, 0.42, 0.44, 0.06, 8, 2), m.dark));
    }
    petals.push(petal);
    body.add(petal);
  }

  // てっぺんの蓋とつまみ
  body.add(new THREE.Mesh(slice(R, 0, Math.PI * 2, 0, ROWS[0][0] - SEAM, 32, 4), m.shell));
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.07, 32), m.shell);
  knob.position.y = R * STRETCH + 0.02;
  const knobRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), m.dark);
  knobRing.rotation.x = Math.PI / 2;
  knobRing.position.y = R * STRETCH;
  body.add(knob, knobRing);

  const rivetMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0105, 8, 6), m.dark, rivets.length);
  const mat = new THREE.Matrix4();
  rivets.forEach((p, i) => rivetMesh.setMatrixAt(i, mat.makeTranslation(p.x, p.y, p.z)));
  body.add(rivetMesh);

  // 目 2 つ(正面から左右へ 34°、少し下)
  for (const side of [-1, 1]) {
    const az = side * 0.56;
    const el = -0.1;
    const p = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el) * STRETCH, Math.cos(az) * Math.cos(el));
    const n = new THREE.Vector3(p.x, p.y / (STRETCH * STRETCH), p.z).normalize();
    const eye = makeEye(m);
    eye.position.copy(p).multiplyScalar(0.93);
    eye.lookAt(eye.position.clone().add(n));
    body.add(eye);
  }

  // 首輪(腕の付け根)と、その下の黒い腹
  const bottomY = Math.cos(BOTTOM) * STRETCH;
  const bottomR = Math.sin(BOTTOM);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(bottomR, bottomR - 0.08, 0.3, 64), m.shell);
  collar.position.y = bottomY - 0.15 - 0.012;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(bottomR - 0.01, bottomR - 0.01, 0.024, 64), m.dark);
  band.position.y = bottomY - 0.006;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(bottomR - 0.08, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.dark);
  belly.scale.y = 0.5;
  belly.position.y = collar.position.y - 0.15;
  body.add(collar, band, belly);

  // 腕の付け根の玉(白)とオレンジの輪
  for (let k = 0; k < ARM_COUNT; k++) {
    const a = armAngle(k);
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 16), m.shell);
    ball.position.copy(dir).multiplyScalar(ARM_BASE_R).setY(ARM_BASE_Y);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 12, 40), m.orange);
    ring.position.copy(dir).multiplyScalar(ARM_BASE_R + 0.09).setY(ARM_BASE_Y);
    ring.lookAt(ring.position.clone().add(dir));
    body.add(ball, ring);
  }

  // 後ろの噴射口(サイフォン)と、下の口(くちばし)
  const siphon = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.4, 32), m.shell);
  const nozzle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 12, 32), m.orange);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.y = 0.2;
  siphon.add(tube, nozzle);
  siphon.position.set(0, -0.86, -0.62);
  siphon.rotation.x = -2.1;
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 24), m.dark);
  beak.rotation.x = Math.PI;
  beak.position.y = belly.position.y - 0.46;
  body.add(siphon, beak);

  return { group: body, petals };
}
