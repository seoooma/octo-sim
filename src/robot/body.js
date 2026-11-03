import * as THREE from 'three';

// 座標: 胴の中心が原点、y が上、正面(目の向き)が +z。外套(頭)の半径が 1。
export const R = 1;
export const STRETCH = 1.04;   // 外套を縦に少し伸ばす
const PETALS = 8;              // 外套の花びら(縦の継ぎ目で分かれた板)の数
const OPEN_ROWS = [[0.15, 0.6], [0.6, 1.1], [1.1, 1.6]];   // 開く 3 段(上からの角度 θ)
const FIXED_ROW = [1.6, 2.05];                             // 開かない一番下の段(目が付く)
const HINGE = FIXED_ROW[0];    // 花びらの蝶番の高さ
const OPEN_ANGLE = 1.05;       // 開いたときの角度(ラジアン)
const SEAM = 0.006;            // 継ぎ目の幅(ラジアン)
const DPHI = (Math.PI * 2) / PETALS;

export const ARM_COUNT = 8;
export const ARM_BASE_Y = -0.62;   // 腕の付け根の高さ(首輪の真ん中)
export const ARM_BASE_R = 0.86;    // 腕の付け根の中心からの距離
export const BOTTOM_Y = Math.cos(FIXED_ROW[1]) * STRETCH;   // 外套の下の縁の高さ
export const BOTTOM_R = Math.sin(FIXED_ROW[1]);             // 外套の下の縁の半径
export const COLLAR_Y = BOTTOM_Y - 0.15 - 0.012;            // 首輪の中心の高さ
export const BELLY_Y = COLLAR_Y - 0.15;                     // 黒い腹(半球)の中心の高さ
export const BELLY_R = BOTTOM_R - 0.08;

// 腕 k の向き(正面から +x 側へ測った角度)。正面の左右に1本ずつ来るよう 22.5° ずらす
export const armAngle = (k) => Math.PI / 8 + (k * 2 * Math.PI) / ARM_COUNT;

// 外套の表面の点。φ は three の SphereGeometry と同じ(φ=π/2 が正面 +z)
export function surface(theta, phi, r = R) {
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

function rivetMesh(points, m) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0105, 8, 6), m.dark, points.length);
  const mat = new THREE.Matrix4();
  points.forEach((p, i) => mesh.setMatrixAt(i, mat.makeTranslation(p.x, p.y, p.z)));
  return mesh;
}

// 板の縁にリベットを並べる
function rivetsAlong(points, phi0, t0, t1) {
  for (let t = t0 + 0.07; t < t1 - 0.04; t += 0.14) {
    points.push(surface(t, phi0 + 0.04, 1.002), surface(t, phi0 + DPHI - 0.04, 1.002));
  }
}

function makeEye(m) {
  // 目の部品は +z が外向き
  const eye = new THREE.Group();
  // 筒は胴の中へ深く入れない(外套を開いたとき内側の壁から出ないように)
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.28, 48), m.shell);
  housing.rotation.x = Math.PI / 2;
  housing.position.z = 0.07;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.034, 20, 64), m.eyeRim);
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
  // 絞り(レンズの中の輪)。走査のとき回って縮む
  const iris = new THREE.Group();
  iris.position.z = 0.27;
  const irisRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.01, 8, 48), m.metal);
  const blades = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.11, 6, 1), m.irisBlade);
  blades.position.z = -0.01;
  iris.add(irisRing, blades);
  eye.add(housing, bezel, flange, well, ring, lens, iris);
  eye.userData = { iris, blades };
  return eye;
}

export function buildBody(m) {
  const body = new THREE.Group();
  const anchors = {};

  // 継ぎ目から見える内側(黒)。外套を開くと隠す(中の機械を見せる)
  const seam = new THREE.Mesh(slice(0.985, 0, Math.PI * 2, 0, Math.PI, 48, 24), m.seam);
  body.add(seam);

  // 外套の花びら 8 枚。上の 3 段が一緒に、一番下の段の上の縁を蝶番にして外へ開く
  const petals = [];
  const fixedRivets = [];
  for (let k = 0; k < PETALS; k++) {
    const phi0 = Math.PI / 2 + k * DPHI;
    const phiC = phi0 + DPHI / 2;
    const hinge = surface(HINGE, phiC);
    const axis = new THREE.Vector3(Math.sin(phiC), 0, Math.cos(phiC));   // 蝶番の向き(横の接線)
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    const petal = new THREE.Group();
    petal.position.copy(hinge).negate();   // 子の座標は胴と同じ
    pivot.add(petal);

    const rivets = [];
    for (const [t0, t1] of OPEN_ROWS) {
      petal.add(new THREE.Mesh(slice(R, phi0 + SEAM, DPHI - 2 * SEAM, t0 + SEAM, t1 - t0 - 2 * SEAM), m.petal));
      rivetsAlong(rivets, phi0, t0, t1);
    }
    // オレンジの差し色の板と、黒い通気口
    if (k % 3 === 1) petal.add(new THREE.Mesh(slice(1.006, phi0 + 0.2, 0.22, 0.78, 0.17, 6, 4), m.orange));
    if (k % 4 === 2) {
      petal.add(new THREE.Mesh(slice(1.006, phi0 + 0.16, 0.42, 0.34, 0.06, 8, 2), m.dark));
      petal.add(new THREE.Mesh(slice(1.006, phi0 + 0.16, 0.42, 0.44, 0.06, 8, 2), m.dark));
    }
    // 右前の花びらに覗き窓(黒いガラスの中にオレンジの部品)
    if (k === 0) {
      petal.add(new THREE.Mesh(slice(1.004, phi0 + 0.12, 0.44, 0.7, 0.28, 8, 6), m.glass));
      petal.add(new THREE.Mesh(slice(1.008, phi0 + 0.36, 0.12, 0.76, 0.12, 4, 3), m.orange));
      anchors.glassPort = new THREE.Object3D();
      anchors.glassPort.position.copy(surface(0.84, phi0 + 0.34, 1.01));
      petal.add(anchors.glassPort);
    }
    if (k === 7) {
      anchors.petal = new THREE.Object3D();
      anchors.petal.position.copy(surface(0.45, phiC, 1.01));
      petal.add(anchors.petal);
    }
    petal.add(rivetMesh(rivets, m));

    // 開く向き: 花びらの上の点が中心から離れる向きに回す
    const top = surface(0.5, phiC).sub(hinge);
    const test = top.clone().applyAxisAngle(axis, 0.1).add(hinge);
    const sign = Math.hypot(test.x, test.z) > Math.hypot(top.x + hinge.x, top.z + hinge.z) ? 1 : -1;
    petals.push({ pivot, axis, sign, out: new THREE.Vector3(Math.cos(phiC) * -1, 0, Math.sin(phiC)), home: hinge.clone() });
    body.add(pivot);

    // 一番下の段(開かない)
    body.add(new THREE.Mesh(slice(R, phi0 + SEAM, DPHI - 2 * SEAM, FIXED_ROW[0] + SEAM, FIXED_ROW[1] - FIXED_ROW[0] - 2 * SEAM), m.shell));
    rivetsAlong(fixedRivets, phi0, FIXED_ROW[0], FIXED_ROW[1]);
  }
  body.add(rivetMesh(fixedRivets, m));

  // 一番下の段の内側の壁と底、上の縁のふち(外套を開いたとき、目の裏や隙間が見えないように)
  const INNER = 0.845;
  body.add(new THREE.Mesh(slice(INNER, 0, Math.PI * 2, FIXED_ROW[0], FIXED_ROW[1] - FIXED_ROW[0], 48, 6), m.darkDS));
  const floorDisc = new THREE.Mesh(new THREE.CircleGeometry(INNER * Math.sin(FIXED_ROW[1]), 48), m.dark);
  floorDisc.rotation.x = -Math.PI / 2;
  floorDisc.position.y = INNER * Math.cos(FIXED_ROW[1]) * STRETCH;
  const lip = new THREE.Mesh(new THREE.RingGeometry(INNER, R * Math.sin(HINGE), 64, 1), m.shellDS);
  lip.rotation.x = -Math.PI / 2;
  lip.position.y = Math.cos(HINGE) * STRETCH - 0.004;
  body.add(floorDisc, lip);

  // てっぺんの蓋とつまみ(外套を開くと浮き上がる)
  const cap = new THREE.Group();
  cap.add(new THREE.Mesh(slice(R, 0, Math.PI * 2, 0, OPEN_ROWS[0][0] - SEAM, 32, 4), m.petal));
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.07, 32), m.shell);
  knob.position.y = R * STRETCH + 0.02;
  const knobRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), m.dark);
  knobRing.rotation.x = Math.PI / 2;
  knobRing.position.y = R * STRETCH;
  cap.add(knob, knobRing);
  body.add(cap);

  // 目 2 つ(正面から左右へ 32°、少し下)
  const eyes = [];
  for (const side of [-1, 1]) {
    const az = side * 0.56;
    const el = -0.1;
    const p = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el) * STRETCH, Math.cos(az) * Math.cos(el));
    const n = new THREE.Vector3(p.x, p.y / (STRETCH * STRETCH), p.z).normalize();
    const eye = makeEye(m);
    eye.position.copy(p).multiplyScalar(0.93);
    eye.lookAt(eye.position.clone().add(n));
    eye.userData.home = eye.position.clone();
    eye.userData.normal = n;
    eyes.push(eye);
    body.add(eye);
    const a = new THREE.Object3D();
    a.position.set(0, 0, 0.3);
    eye.add(a);
    anchors[side < 0 ? 'eyeL' : 'eyeR'] = a;
  }

  // 首輪(腕の付け根)と、その下の黒い腹
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(BOTTOM_R, BOTTOM_R - 0.08, 0.3, 64), m.shell);
  collar.position.y = COLLAR_Y;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(BOTTOM_R - 0.01, BOTTOM_R - 0.01, 0.024, 64), m.dark);
  band.position.y = BOTTOM_Y - 0.006;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(BELLY_R, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.dark);
  belly.scale.y = 0.5;
  belly.position.y = BELLY_Y;
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

  // mantle: 外套の開き(0〜1)、scan: 目の走査、exploded: 分解図
  function update(t, mantle, scan, exploded) {
    const open = Math.max(mantle, exploded * 0.35);
    seam.visible = open < 0.005;
    petals.forEach((p, k) => {
      // 1 枚ずつ少し遅れて開く
      const u = THREE.MathUtils.clamp(open * 1.15 - k * 0.02, 0, 1);
      p.pivot.quaternion.setFromAxisAngle(p.axis, p.sign * OPEN_ANGLE * u);
      p.pivot.position.copy(p.home).addScaledVector(p.out, exploded * 0.28);
    });
    cap.position.y = open * 1.2 + exploded * 0.3;
    cap.rotation.y = open * 0.6;
    for (const eye of eyes) {
      eye.position.copy(eye.userData.home).addScaledVector(eye.userData.normal, exploded * 0.35);
      eye.userData.iris.rotation.z = t * 0.4 + scan * t * 2.5;
      const z = 1 - 0.45 * scan * (0.5 + 0.5 * Math.sin(t * 5));
      eye.userData.iris.scale.set(z, z, 1);
    }
    m.eyeRim.emissiveIntensity = scan * (0.6 + 0.4 * Math.sin(t * 8));
  }

  return { group: body, anchors, update };
}
