import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, smootherstep } from '../../util.js';
import { contractionAt, openAt, netAt } from './timeline.js';

// 傘(ベル): 楕円体の殻を、てっぺんの蓋・蝶番の輪・放射状の板 16 枚に分けたもの。
// 板は上の縁(蝶番)を軸に回るだけで、伸び縮みはしない(2026-11-04 ユーザー「伸縮はしなくていい」)。
// - 脈: 板を内へ閉じて水を押し出し、ゆっくり外へ開く(機械の傘・絞り)。隣の板は内と外の 2 段に重ねてあり、閉じると重なりが増える
// - 大きく開く(BELL OPEN): 板が花のように外へ開き、蓋が浮いて、中の暗いガラスのドーム・ポンプの輪・ジャイロが見える
// 座標: 傘の中心が原点、y が上(てっぺん)、正面が +z。φ は +z から +x へ測る
export const BELL_R = 1.15;     // 横の半径
export const BELL_H = 0.9;      // 縦の半径
export const PLATES = 16;
export const DPHI = (Math.PI * 2) / PLATES;
export const HINGE_T = 0.42;    // 蝶番の高さ(てっぺんからの角度 θ)
export const RIM_T = 1.86;      // 傘の縁(赤道より少し下で内へ巻く)
const CAP_T = 0.4;              // 蓋の下の縁
const OVER = 0.03;              // 隣の板と重ねる幅(ラジアン、片側)
const INNER_K = 0.972;          // 内の段の板の大きさ(外の段の下にもぐる)
const DOME = { r: 0.8, h: 0.7, t0: 0.5, t1: 1.8 };   // 中の暗いガラスのドーム
export const REST = 0.05;       // ふだんの開き(ラジアン、外へ)
export const CLOSE = 0.2;       // 1 打ちで閉じる角度
export const OPEN = 1.05;       // 大きく開いたときの角度
const NET_OPEN = 0.07;          // 網を広げるとき少し開く
const PUMP = { r: 0.6, y: 0.55 };   // ポンプの輪(ピストンの付け根)
const SLEEVE = 0.4, ROD = 0.48;     // ピストンの筒と棒の長さ(あいだの長さが 0.52〜0.83 で収まる)
export const HUB_Y = -0.62;         // 口の台(口腕の付け根)の高さ
export const ORAL_BASE_R = 0.1;

// 楕円体の表面の点
export function surf(theta, phi, k = 1, out = new THREE.Vector3(), r = BELL_R, h = BELL_H) {
  return out.set(k * r * Math.sin(theta) * Math.sin(phi), k * h * Math.cos(theta), k * r * Math.sin(theta) * Math.cos(phi));
}

// 楕円体の一部(θ0〜θ1、φ0〜φ1)の形。lumen があれば aLumen を付ける({ along(θ), around, kind })
function patch(th0, th1, ph0, ph1, k, nth, nph, { r = BELL_R, h = BELL_H, lumen = null } = {}) {
  const pos = [], nor = [], uv = [], idx = [], lum = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= nth; i++) {
    const th = th0 + ((th1 - th0) * i) / nth;
    for (let j = 0; j <= nph; j++) {
      const ph = ph0 + ((ph1 - ph0) * j) / nph;
      surf(th, ph, k, p, r, h);
      pos.push(p.x, p.y, p.z);
      n.set(Math.sin(th) * Math.sin(ph) / r, Math.cos(th) / h, Math.sin(th) * Math.cos(ph) / r).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(j / nph, i / nth);
      if (lumen) lum.push(lumen.along(th), lumen.around, lumen.kind);
    }
  }
  for (let i = 0; i < nth; i++) {
    for (let j = 0; j < nph; j++) {
      const a = i * (nph + 1) + j, b = a + nph + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (lumen) g.setAttribute('aLumen', new THREE.Float32BufferAttribute(lum, 3));
  g.setIndex(idx);
  return g;
}

// 形に同じ aLumen を付ける(縁の点など)
function withLumen(g, along, around, kind) {
  const n = g.attributes.position.count;
  g.setAttribute('aLumen', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [along, around, kind][i % 3]), 3));
  return g;
}

// 点 p に、向き dir(+y を合わせる)で置いた形
function placed(g, p, dir) {
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(p.x, p.y, p.z);
  return g;
}

// 楕円体の外向きの向き
function normalAt(theta, phi) {
  return new THREE.Vector3(Math.sin(theta) * Math.sin(phi) / BELL_R, Math.cos(theta) / BELL_H, Math.sin(theta) * Math.cos(phi) / BELL_R).normalize();
}

// 板 k の、時刻 t の角度(外へ開く向きが正)。tentacles.js も前の時刻の角度を読む
export function plateAngleAt(t, k) {
  // 閉じる時刻を板ごとにほんの少しずらす(全部が同時だと機械くさい)
  const c = contractionAt(t - 0.025 * (1 + Math.sin(k * 2.4)));
  const o = clamp(openAt(t) * 1.25 - 0.25 * (((k + 4) % PLATES) / PLATES));
  return REST - CLOSE * c + OPEN * smootherstep(0, 1, o) + NET_OPEN * netAt(t);
}

export function buildBell(m, lumenMat) {
  const bell = new THREE.Group();
  const anchors = {};
  const v = new THREE.Vector3();

  // ---- 蓋(てっぺん。開くと浮き上がる)と、てっぺんの光の目
  const cap = new THREE.Group();
  cap.add(new THREE.Mesh(patch(0, CAP_T, 0, Math.PI * 2, 1, 6, 48), m.shell));
  const capDark = [];
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * Math.PI * 2 + DPHI / 2;
    capDark.push(patch(0.13, CAP_T - 0.03, ph - 0.012, ph + 0.012, 1.003, 3, 1));   // 放射状の溝
    capDark.push(new THREE.SphereGeometry(0.011, 6, 4).translate(...surf(CAP_T - 0.05, ph + DPHI / 2, 1.004).toArray()));
  }
  cap.add(new THREE.Mesh(mergeGeometries(capDark), m.dark));
  const apexY = BELL_H;
  const eyeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.05, 40), m.shell);
  eyeBase.position.y = apexY + 0.005;
  const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 10, 40), m.eyeRim);
  eyeRing.rotation.x = Math.PI / 2;
  eyeRing.position.y = apexY + 0.032;
  const eyeLens = new THREE.Mesh(new THREE.SphereGeometry(0.085, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.glass);
  eyeLens.position.y = apexY + 0.02;
  eyeLens.scale.y = 0.7;
  cap.add(eyeBase, eyeRing, eyeLens);
  anchors.apical = new THREE.Object3D();
  anchors.apical.position.set(0, apexY + 0.08, 0);
  cap.add(anchors.apical);
  bell.add(cap);

  // ---- 蝶番の輪
  const hingeY = BELL_H * Math.cos(HINGE_T);
  const hingeR = BELL_R * Math.sin(HINGE_T);
  const hingeRing = new THREE.Mesh(new THREE.TorusGeometry(hingeR + 0.004, 0.034, 10, 80), m.darkMetal);
  hingeRing.rotation.x = Math.PI / 2;
  hingeRing.position.y = hingeY;
  bell.add(hingeRing);
  anchors.hinge = new THREE.Object3D();
  anchors.hinge.position.copy(surf(HINGE_T, 0.9, 1.03));
  bell.add(anchors.hinge);

  // ---- 放射状の板 16 枚(偶数は外の段、奇数は内の段)
  const plates = [];
  for (let k = 0; k < PLATES; k++) {
    const phi = k * DPHI;
    const layer = k % 2 ? INNER_K : 1;
    const hinge = surf(HINGE_T, phi, 1);
    const axis = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));   // 蝶番の向き(横の接線)
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    const plate = new THREE.Group();
    plate.position.copy(hinge).negate();   // 子の座標は傘と同じ
    pivot.add(plate);
    const ph0 = phi - DPHI / 2 - OVER, ph1 = phi + DPHI / 2 + OVER;

    // 白い殻と、縁の光る点の白い受け
    const sensorP = surf(RIM_T - 0.06, phi, layer * 1.004);
    const sensorN = normalAt(RIM_T - 0.06, phi);
    const shellGeo = mergeGeometries([
      patch(HINGE_T + 0.004, RIM_T, ph0, ph1, layer, 16, 7),
      placed(new THREE.CylinderGeometry(0.05, 0.056, 0.022, 20), sensorP, sensorN),
    ]);
    plate.add(new THREE.Mesh(shellGeo, m.petal));

    // 光る線(板の真ん中を頂から縁へ)と縁の光る点
    const a0 = HINGE_T + 0.09, a1 = RIM_T - 0.13;
    const strip = patch(a0, a1, phi - 0.02, phi + 0.02, layer * 1.004, 18, 1, { lumen: { along: (th) => (th - a0) / (a1 - a0), around: k / PLATES, kind: 0 } });
    const dot = withLumen(placed(new THREE.SphereGeometry(0.036, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sensorP.clone().addScaledVector(sensorN, 0.008), sensorN), 1, k / PLATES, 1);
    strip.deleteAttribute('uv');
    dot.deleteAttribute('uv');
    plate.add(new THREE.Mesh(mergeGeometries([strip, dot]), lumenMat));

    // 暗い部品: 縁の唇(太さを見せる)・蝶番の節・リベット
    const dark = [];
    const lip = [];
    for (let j = 0; j <= 12; j++) lip.push(surf(RIM_T, ph0 + ((ph1 - ph0) * j) / 12, layer * 0.995));
    dark.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lip), 16, 0.024, 6, false));
    const knuckle = new THREE.CylinderGeometry(0.032, 0.032, 0.12, 12);
    dark.push(placed(knuckle, surf(HINGE_T + 0.02, phi, layer * 1.01), axis));
    if (layer === 1) {
      for (let th = HINGE_T + 0.16; th < RIM_T - 0.12; th += 0.17) {
        for (const e of [-1, 1]) dark.push(new THREE.SphereGeometry(0.0105, 6, 4).translate(...surf(th, phi + e * (DPHI / 2 + OVER - 0.035), 1.003).toArray()));
      }
    }
    plate.add(new THREE.Mesh(mergeGeometries(dark), m.darkMetal));

    // オレンジの差し色(4 枚に 1 枚)と黒い通気口(別の 4 枚)
    if (k % 4 === 2) plate.add(new THREE.Mesh(patch(0.98, 1.14, phi + 0.045, phi + 0.13, 1.005, 3, 2), m.orange));
    if (k % 4 === 0) {
      plate.add(new THREE.Mesh(mergeGeometries([0.0, 0.07].map((d) => patch(1.38 + d, 1.42 + d, phi - 0.15, phi - 0.04, 1.005, 1, 3))), m.dark));
    }

    // 開く向き: 板の下の点が中心から離れる向きに回す
    const low = surf(1.4, phi).sub(hinge);
    const test = low.clone().applyAxisAngle(axis, 0.1).add(hinge);
    const sign = Math.hypot(test.x, test.z) > Math.hypot(low.x + hinge.x, low.z + hinge.z) ? 1 : -1;
    bell.add(pivot);
    plates.push({
      k, phi, layer, pivot, axis, sign, hinge,
      tip: surf(RIM_T + 0.03, phi, layer * 0.99).sub(hinge),            // 触手の付け根(蝶番から)
      down: new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(0.22).add(new THREE.Vector3(0, -1, 0)).normalize(),   // 触手の出る向き
      attach: surf(1.25, phi, layer * 0.985).sub(hinge),                // ピストンの先(蝶番から)
      plateObj: plate,
    });
  }
  anchors.plate = new THREE.Object3D();
  anchors.plate.position.copy(surf(1.05, 2 * DPHI + 0.09, 1.01));
  plates[2].plateObj.add(anchors.plate);
  anchors.lip = new THREE.Object3D();
  anchors.lip.position.copy(surf(RIM_T, 15 * DPHI, 1.01));
  plates[15].plateObj.add(anchors.lip);
  anchors.sensor = new THREE.Object3D();
  anchors.sensor.position.copy(surf(RIM_T - 0.06, 1 * DPHI, 1.02));
  plates[1].plateObj.add(anchors.sensor);
  anchors.strip = new THREE.Object3D();
  anchors.strip.position.copy(surf(0.95, 14 * DPHI, 1.01));
  plates[14].plateObj.add(anchors.strip);

  // ---- 中の暗いガラスのドーム(上に穴、下に底)
  const glassDS = Object.assign(m.glass.clone(), { side: THREE.DoubleSide });
  const dome = new THREE.Group();
  dome.add(new THREE.Mesh(patch(DOME.t0, DOME.t1, 0, Math.PI * 2, 1, 14, 64, { r: DOME.r, h: DOME.h }), glassDS));
  const floorY = DOME.h * Math.cos(DOME.t1), floorR = DOME.r * Math.sin(DOME.t1);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(floorR, 64), glassDS);
  floor.rotation.x = Math.PI / 2;
  floor.position.y = floorY;
  const topLip = new THREE.Mesh(new THREE.TorusGeometry(DOME.r * Math.sin(DOME.t0), 0.02, 8, 64), m.metal);
  topLip.rotation.x = Math.PI / 2;
  topLip.position.y = DOME.h * Math.cos(DOME.t0);
  const botLip = new THREE.Mesh(new THREE.TorusGeometry(floorR, 0.022, 8, 64), m.darkMetal);
  botLip.rotation.x = Math.PI / 2;
  botLip.position.y = floorY;
  dome.add(floor, topLip, botLip);
  bell.add(dome);
  anchors.dome = new THREE.Object3D();
  anchors.dome.position.copy(surf(1.15, -0.5, 1.01, new THREE.Vector3(), DOME.r, DOME.h));
  bell.add(anchors.dome);

  // ---- ポンプの輪(ドームのまわり)と、板を押すピストン 16 本
  const pump = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(PUMP.r - 0.06, 0.045, 10, 64), m.darkMetal);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = PUMP.y;
  pump.add(ring);
  const blockGeo = new THREE.BoxGeometry(0.1, 0.12, 0.07);
  const blocks = [[], []];
  for (let k = 0; k < PLATES; k++) {
    const g = blockGeo.clone().rotateY(k * DPHI).translate(Math.sin(k * DPHI) * (PUMP.r - 0.02), PUMP.y, Math.cos(k * DPHI) * (PUMP.r - 0.02));
    blocks[k % 3 === 0 ? 0 : 1].push(g);
  }
  pump.add(new THREE.Mesh(mergeGeometries(blocks[0]), m.orange), new THREE.Mesh(mergeGeometries(blocks[1]), m.shell));
  const pistonMeshes = [
    new THREE.InstancedMesh(new THREE.CylinderGeometry(0.032, 0.036, 1, 12), m.darkMetal, PLATES),   // 筒
    new THREE.InstancedMesh(new THREE.CylinderGeometry(0.017, 0.017, 1, 8), m.metal, PLATES),       // 棒
    new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 10, 6), m.orange, PLATES),                // 先の玉
  ];
  for (const mesh of pistonMeshes) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    pump.add(mesh);
  }
  bell.add(pump);
  anchors.pump = new THREE.Object3D();
  anchors.pump.position.set(Math.sin(-0.6) * PUMP.r, PUMP.y + 0.05, Math.cos(-0.6) * PUMP.r);
  bell.add(anchors.pump);

  // ---- ジャイロ(3 つの輪の中で円盤が回る)。ふだんはドームの中、開くとドームの穴から上がる
  const gyro = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 10, 64), m.orange);
  const middle = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.018, 10, 56), m.metal);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 10, 48), m.darkMetal);
  const rotor = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 40), m.shell);
  const discRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 8, 40), m.dark);
  discRim.rotation.x = Math.PI / 2;
  const discHub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 16), m.orange);
  const discMarks = new THREE.Mesh(mergeGeometries([0, 1, 2].map((i) => new THREE.BoxGeometry(0.02, 0.052, 0.1).translate(0, 0, 0.085).rotateY((i * Math.PI * 2) / 3))), m.dark);
  rotor.add(disc, discRim, discHub, discMarks);
  inner.add(rotor);
  rotor.rotation.x = Math.PI / 2;
  middle.add(inner);
  outer.add(middle);
  gyro.add(outer);
  bell.add(gyro);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.9, 10), m.metal);
  bell.add(post);
  anchors.gyro = new THREE.Object3D();
  anchors.gyro.position.set(0.3, 0, 0);
  gyro.add(anchors.gyro);

  // ---- 口の柱(ドームの底から下がる)と口の台。口腕 4 本はここに付く(oral.js)
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, -0.02 - HUB_Y, 24), m.darkMetal);
  column.position.y = (-0.02 + HUB_Y) / 2;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.022, 8, 32), m.orange);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.36;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.08, 32), m.dark);
  hub.position.y = HUB_Y;
  const lobes = new THREE.Mesh(mergeGeometries([0, 1, 2, 3].map((j) => {
    const a = Math.PI / 4 + (j * Math.PI) / 2;
    return new THREE.SphereGeometry(0.065, 16, 10).translate(Math.sin(a) * ORAL_BASE_R, HUB_Y - 0.04, Math.cos(a) * ORAL_BASE_R);
  })), m.shell);
  bell.add(column, collar, hub, lobes);
  anchors.hub = new THREE.Object3D();
  anchors.hub.position.set(0.16, HUB_Y, 0.05);
  bell.add(anchors.hub);

  // 作業用
  const q = new THREE.Quaternion();
  const mtx = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), mid = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const qq = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const setSeg = (mesh, i, from, d, len, r) => {
    mid.copy(from).addScaledVector(d, len / 2);
    qq.setFromUnitVectors(UP, d);
    mesh.setMatrixAt(i, mtx.compose(mid, qq, sc.set(1, len, 1)));
  };

  // 板 k の角度 ang のときの、傘の座標の点(蝶番からの位置 rel を回す)
  function plateQuat(p, ang, out) {
    return out.setFromAxisAngle(p.axis, p.sign * ang);
  }

  // t: 時刻、s: 台本の状態。板の角度・蓋・ジャイロ・ピストンを置く
  function update(t, s) {
    for (const p of plates) {
      plateQuat(p, plateAngleAt(t, p.k), p.pivot.quaternion);
      // ピストン: 輪の付け根 → 板の裏の点
      a.set(Math.sin(p.phi) * PUMP.r, PUMP.y, Math.cos(p.phi) * PUMP.r);
      b.copy(p.attach).applyQuaternion(p.pivot.quaternion).add(p.hinge);
      dir.subVectors(b, a);
      dir.normalize();
      setSeg(pistonMeshes[0], p.k, a, dir, SLEEVE);
      dir.negate();
      setSeg(pistonMeshes[1], p.k, b, dir, ROD);
      pistonMeshes[2].setMatrixAt(p.k, mtx.makeTranslation(b.x, b.y, b.z));
    }
    for (const mesh of pistonMeshes) mesh.instanceMatrix.needsUpdate = true;
    const open = s.open;
    cap.position.y = 1.15 * smootherstep(0, 0.6, open);
    cap.rotation.y = 0.5 * smootherstep(0, 0.8, open);
    const rise = smootherstep(0.3, 1, open);
    gyro.position.y = 0.3 + 0.85 * rise;
    post.position.y = gyro.position.y - 0.45;
    // ジャイロの輪はいつも回る(開いているときは速く)
    const sp = 1 + 1.5 * open;
    outer.rotation.set(Math.PI / 2, 0, 0);
    outer.rotation.z = t * 0.5 * sp;
    middle.rotation.x = t * 0.8 * sp;
    inner.rotation.y = t * 1.1 * sp;
    rotor.rotation.y = t * 9;
  }

  return { group: bell, anchors, plates, update, plateQuat };
}
