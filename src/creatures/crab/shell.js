import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rivets } from '../../core/limbs.js';
import { mulberry32 } from '../../util.js';
import { gearGeometry } from '../octopus/core.js';
import {
  SHELL_POLY, SHELL_OUTLINE, SHELL_RR, HULL_OUTLINE, HULL_RR, HULL_SCALE, HULL_TOP, HULL_FLOOR, HULL_BOTTOM,
  HINGE, SHELL_OPEN, domeY, outlineAt, roundedOutline, LEGS,
} from './layout.js';

// 甲羅(白い板の継ぎ目とリベット、後ろの蝶番で開く)・胴(暗い箱)・中の機械(歯車・ポンプ・エラ・配線・持ち上げる筒)。
// 甲羅の面は「輪郭の上の点 B(u) を真ん中へ r 倍に縮めた場所、高さ domeY(r)」で表す(u: 輪郭をぐるりと 0〜1、r: 0 真ん中〜1 ふち)

const PER = SHELL_OUTLINE.perimeter;
const RAM_X = 0.12;   // 甲羅を持ち上げる筒の横の位置(歯車をよける)
const ob = [0, 0];
// 甲羅の面の点(体の座標)。lift: 面から外へ浮かせる量
export function domePoint(r, u, out = new THREE.Vector3(), lift = 0) {
  outlineAt(SHELL_OUTLINE, u, ob);
  return out.set(ob[0] * r, domeY(r) + lift, ob[1] * r);
}

// 甲羅の板 1 枚(r0〜r1、u0〜u1)。gap: 継ぎ目の幅の半分(長さ)。u0 = 0・u1 = 1 なら輪(継ぎ目なし)
function domePatch(r0, r1, u0, u1, gap, nr = 8, nu = 24, inset = 0) {
  const ring = u1 - u0 >= 1;
  const pos = [], idx = [];
  const p = new THREE.Vector3();
  // ふちの輪は外の端までほぼ白く(ふちは急に落ちるので、外ほど細かく刻む)
  const edge = r1 >= 1;
  const ra = r0 === 0 ? 0 : r0 + gap / 0.9, rb = edge ? (gap ? 0.997 : 1) : r1 - gap / 0.9;
  for (let i = 0; i <= nr; i++) {
    const x = i / nr;
    const r = ra + (rb - ra) * (edge ? 1 - (1 - x) ** 2 : x);
    const du = ring ? 0 : gap / (PER * Math.max(r, 0.05));
    for (let k = 0; k <= nu; k++) {
      const u = u0 + du + ((u1 - u0 - 2 * du) * k) / nu;
      domePoint(r * (1 - inset), u, p, -inset);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < nr; i++) {
    for (let k = 0; k < nu; k++) {
      const a = i * (nu + 1) + k, b = a + nu + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// xz の輪郭 → 押し出し(y0 〜 y1)。holes: 穴の輪郭
function extrudeOutline(pts, y0, y1, holes = [], bevel = 0) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const depth = y1 - y0 - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}

// 輪郭に沿った管(y の高さ、r 倍に縮めた輪郭)
function outlineTube(pts, y, scale, radius, mat) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x * scale, y, z * scale)), true);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 160, radius, 6, true), mat);
}

// ---- 甲羅
function buildCarapace(m) {
  const pivot = new THREE.Group();          // 蝶番の軸(体の座標の HINGE)
  pivot.position.fromArray(HINGE);
  const shell = new THREE.Group();          // 体の座標を蝶番からの相対へ
  shell.position.set(-HINGE[0], -HINGE[1], -HINGE[2]);
  pivot.add(shell);
  const anchors = {};
  const SEAM = 0.0065;

  // 下地(暗い。開くと裏が見えるので両面)と白い板
  const base = new THREE.Mesh(domePatch(0, 1, 0, 1, 0, 24, 120, 0.012), m.darkDS);
  shell.add(base);
  // 真ん中の板(1 枚)・中の輪(6 枚、継ぎ目は前後の真ん中にも)・ふちの輪(10 枚、前後は板の真ん中)
  shell.add(new THREE.Mesh(domePatch(0, 0.42, 0, 1, SEAM, 6, 96), m.shell));
  const plates = [];
  for (let k = 0; k < 6; k++) plates.push(new THREE.Mesh(domePatch(0.42, 0.76, k / 6, (k + 1) / 6, SEAM, 6, 18), m.shell));
  for (let k = 0; k < 10; k++) plates.push(new THREE.Mesh(domePatch(0.76, 1.0, k / 10 + 0.05, (k + 1) / 10 + 0.05, SEAM, 9, 20), m.shell));
  plates.forEach((p) => shell.add(p));

  // リベット: 中の輪の継ぎ目の両側と、ふちの輪の内側に沿って
  const pts = [];
  for (let k = 0; k < 6; k++) {
    for (const r of [0.5, 0.68]) for (const d of [-1, 1]) pts.push(domePoint(r, k / 6 + (d * 0.035) / r / 2, new THREE.Vector3(), 0.004));
  }
  for (let k = 0; k < 10; k++) for (const f of [0.3, 0.7]) pts.push(domePoint(0.82, (k + f) / 10 + 0.05, new THREE.Vector3(), 0.004));
  shell.add(rivets(pts, m, 0.011));

  // 背中の印: 真ん中の板の後ろに、オレンジの小さな札と暗い溝 2 本
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.05), m.orange);
  domePoint(0.24, 0, badge.position, 0.004);
  badge.rotation.x = -0.25;
  shell.add(badge);
  for (const s of [-1, 1]) {
    const groove = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.22, 4, 8), m.dark);
    groove.rotation.x = Math.PI / 2;
    groove.position.set(s * 0.12, domeY(0.15) + 0.002, 0.08);
    groove.rotation.z = s * 0.12;
    shell.add(groove);
  }

  // 前のふちの歯(左右 4 本ずつ、前の角から横の広いところまで)と、目のあいだの 2 本
  const toothGeo = new THREE.ConeGeometry(0.035, 0.11, 4);
  toothGeo.rotateX(Math.PI / 2);   // +z が先
  const tn = new THREE.Vector3();
  const addTooth = (u, size) => {
    const a = outlineAt(SHELL_OUTLINE, u, [0, 0]);
    const tooth = new THREE.Mesh(toothGeo, m.shell);
    tooth.position.set(a[0] * 0.985, domeY(0.985) + 0.005, a[1] * 0.985);
    const b = outlineAt(SHELL_OUTLINE, u + 0.004, [0, 0]);
    tn.set(b[1] - a[1], 0, -(b[0] - a[0])).normalize();   // 輪郭の外向き
    tooth.lookAt(tooth.position.clone().add(tn));
    tooth.scale.setScalar(size);
    shell.add(tooth);
  };
  for (const side of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      const u = 0.28 + k * 0.035;   // 左(+x)の前のふちは u ≈ 0.26〜0.41(横の広いところ → 前の角)
      addTooth(side > 0 ? u : 1 - u, 1 - k * 0.12);
    }
    addTooth(side > 0 ? 0.47 : 0.53, 0.7);
  }

  // 裏: ふちの枠(暗い金属)と、真ん中から外への骨 6 本
  shell.add(outlineTube(SHELL_OUTLINE, domeY(0.95) - 0.03, 0.95, 0.022, m.darkMetal));
  const ribs = [];
  for (let k = 0; k < 6; k++) {
    const u = k / 6 + 1 / 12;
    const c = new THREE.CatmullRomCurve3(Array.from({ length: 7 }, (_, i) => {
      const r = 0.12 + (0.8 * i) / 6;
      return domePoint(r, u, new THREE.Vector3(), -0.035);
    }));
    ribs.push(new THREE.TubeGeometry(c, 24, 0.016, 6, false));
  }
  shell.add(new THREE.Mesh(mergeGeometries(ribs), m.darkMetal));

  // 蝶番(甲羅の側の 2 つの節。胴の側は buildHull)
  for (const x of [-0.13, 0.13]) {
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 16), m.shell);
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.set(x, HINGE[1], HINGE[2]);
    shell.add(knuckle);
  }
  // 持ち上げる筒の上の留め具(甲羅の裏)
  const ramTop = new THREE.Object3D();
  ramTop.position.set(RAM_X, domeY(0.35) - 0.06, -0.12);
  shell.add(ramTop);
  const ramMount = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), m.darkMetal);
  ramMount.position.copy(ramTop.position).add(new THREE.Vector3(0, 0.02, 0));
  shell.add(ramMount);

  anchors.carapace = new THREE.Object3D();
  domePoint(0.62, 0.36, anchors.carapace.position, 0.01);
  shell.add(anchors.carapace);
  anchors.hinge = new THREE.Object3D();
  anchors.hinge.position.set(0.2, HINGE[1], HINGE[2]);
  shell.add(anchors.hinge);
  return { pivot, shell, anchors, ramTop };
}

// ---- 胴(上の開いた暗い箱)。脚の付け根の受け口と、蝶番の胴の側
function buildHull(m) {
  const g = new THREE.Group();
  const inner = roundedOutline(SHELL_POLY, HULL_RR - 0.05, 120, HULL_SCALE);
  const outerSmall = roundedOutline(SHELL_POLY, HULL_RR - 0.035, 120, HULL_SCALE);
  g.add(new THREE.Mesh(extrudeOutline(outerSmall, HULL_BOTTOM, HULL_FLOOR + 0.03, [], 0.035), m.dark));
  g.add(new THREE.Mesh(extrudeOutline(HULL_OUTLINE, HULL_FLOOR, HULL_TOP, [inner]), m.darkDS));
  // 中の床(少し明るい暗さ)と、壁の上のふち
  const floor = new THREE.Mesh(extrudeOutline(inner, HULL_FLOOR - 0.01, HULL_FLOOR, []), m.seam);
  g.add(floor);
  g.add(outlineTube(HULL_OUTLINE, HULL_TOP, 0.985, 0.016, m.metal));
  // 下の腹板(白)と、たたんだおなか(白い節 5 枚、後ろから前へ)
  const sternum = new THREE.Mesh(extrudeOutline(roundedOutline(SHELL_POLY, 0.08, 80, 0.62), HULL_BOTTOM - 0.02, HULL_BOTTOM + 0.01, [], 0.008), m.shell);
  g.add(sternum);
  for (let k = 0; k < 5; k++) {
    const w = 0.42 - k * 0.055, z = -0.4 + k * 0.13;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.115), k === 4 ? m.orange : m.shell);
    seg.position.set(0, HULL_BOTTOM - 0.035, z);
    g.add(seg);
  }
  const abdomen = new THREE.Object3D();
  abdomen.position.set(0.15, HULL_BOTTOM - 0.05, -0.2);
  g.add(abdomen);
  // 脚の受け口(暗い輪とオレンジの印)
  for (const L of LEGS) {
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 20), m.darkMetal);
    sock.rotation.z = Math.PI / 2;
    sock.position.set(L.hip[0] - L.side * 0.01, L.hip[1], L.hip[2]);
    g.add(sock);
  }
  // 蝶番の胴の側(3 つの節とオレンジの端)
  for (const x of [-0.26, 0, 0.26]) {
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 16), m.darkMetal);
    knuckle.rotation.z = Math.PI / 2;
    knuckle.position.set(x, HINGE[1], HINGE[2]);
    g.add(knuckle);
  }
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), m.orange);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(s * 0.335, HINGE[1], HINGE[2]);
    g.add(cap);
  }
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.66, 8), m.metal);
  pin.rotation.z = Math.PI / 2;
  pin.position.set(0, HINGE[1], HINGE[2]);
  g.add(pin);
  return { group: g, anchors: { abdomen } };
}

// ---- 中の機械(胴の床の上)
function cableBundle(m, seed) {
  const rnd = mulberry32(seed);
  const dark = [], plugs = [];
  const add = (pts, r) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    dark.push(new THREE.TubeGeometry(curve, 32, r, 5, false));
    return curve;
  };
  // ポンプから前(目と口)へ: 床をはう束
  for (let i = 0; i < 26; i++) {
    const a = (rnd() - 0.5) * 0.5, y = HULL_FLOOR + 0.03 + rnd() * 0.06;
    add([
      new THREE.Vector3(a * 0.4, y + 0.03, 0.08),
      new THREE.Vector3(a * 0.6 + (rnd() - 0.5) * 0.1, y + 0.05 + rnd() * 0.04, 0.24),
      new THREE.Vector3(a * 0.9 + (rnd() - 0.5) * 0.12, y + rnd() * 0.05, 0.38),
      new THREE.Vector3(Math.sign(a || 1) * (0.1 + rnd() * 0.2), y - 0.01, 0.5),
    ], 0.008 + rnd() * 0.006);
  }
  // ポンプから 8 本の脚の付け根へ
  for (const L of LEGS) {
    for (let k = 0; k < 3; k++) {
      const h = new THREE.Vector3(L.hip[0] * 0.92, HULL_FLOOR + 0.03 + k * 0.015, L.hip[2] + (k - 1) * 0.03);
      const c = add([
        new THREE.Vector3(L.side * 0.08, HULL_FLOOR + 0.06, 0.02 + (k - 1) * 0.03),
        new THREE.Vector3(L.side * 0.3, HULL_FLOOR + 0.07 + rnd() * 0.04, L.hip[2] * 0.6 + 0.02),
        h,
      ], 0.011);
      if (k === 1) {
        const p = c.getPoint(1), tan = c.getTangent(1);
        const plug = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 10);
        plug.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan));
        plug.translate(p.x, p.y, p.z);
        plugs.push(plug);
      }
    }
  }
  return { cables: new THREE.Mesh(mergeGeometries(dark), m.cable), plugs: new THREE.Mesh(mergeGeometries(plugs), m.orange) };
}

function buildInner(m) {
  const g = new THREE.Group();
  const anchors = {};
  const y0 = HULL_FLOOR;
  const { cables, plugs } = cableBundle(m, 11);
  g.add(cables, plugs);

  // ポンプ(真ん中、4 本のピストン)
  const pump = new THREE.Group();
  pump.position.set(0, y0, 0.04);
  const block = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.09, 32), m.darkMetal);
  block.position.y = 0.045;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 24), m.orange);
  cap.position.y = 0.1;
  pump.add(block, cap);
  const pistons = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = new THREE.Group();
    p.position.set(Math.sin(a) * 0.115, 0.09, Math.cos(a) * 0.115);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.1, 16), m.shell);
    sleeve.position.y = 0.04;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), m.metal);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 14), i % 2 ? m.orange : m.darkMetal);
    p.add(sleeve, rod, head);
    p.userData = { rod, head, phase: i * Math.PI * 0.5 };
    pistons.push(p);
    pump.add(p);
  }
  g.add(pump);
  anchors.pump = new THREE.Object3D();
  anchors.pump.position.set(0.1, y0 + 0.18, 0.12);
  g.add(anchors.pump);

  // 歯車(後ろ、床に寝かせる: 大 36 歯のオレンジ・小 14 歯の金属)
  const gears = new THREE.Group();
  gears.position.set(-0.3, y0 + 0.04, -0.24);
  const bigGeo = gearGeometry(36, 0.17, 0.152, 0.04, 0.035);
  bigGeo.rotateX(-Math.PI / 2);
  const smallGeo = gearGeometry(14, 0.075, 0.06, 0.05, 0.02);
  smallGeo.rotateX(-Math.PI / 2);
  const big = new THREE.Mesh(bigGeo, m.orange);
  const small = new THREE.Mesh(smallGeo, m.metal);
  small.position.set(0.224, 0.005, -0.08);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 16), m.darkMetal);
  const axle2 = axle.clone();
  axle2.position.copy(small.position);
  gears.add(big, small, axle, axle2);
  g.add(gears);
  anchors.gears = new THREE.Object3D();
  anchors.gears.position.set(-0.38, y0 + 0.08, -0.3);
  g.add(anchors.gears);

  // エラ(左右、白い薄い板を並べた放熱の束)
  const finGeo = new THREE.BoxGeometry(0.014, 0.12, 0.34);
  for (const s of [-1, 1]) {
    const gill = new THREE.Group();
    gill.position.set(s * 0.6, y0, 0.02);
    gill.rotation.y = -s * 0.18;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.38), m.darkMetal);
    rail.position.y = 0.015;
    gill.add(rail);
    for (let k = 0; k < 9; k++) {
      const fin = new THREE.Mesh(finGeo, k % 4 === 0 ? m.metal : m.shell);
      fin.position.set((k - 4) * 0.032, 0.09 - Math.abs(k - 4) * 0.008, 0);
      gill.add(fin);
    }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 10), m.orange);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, 0.05, -0.19);
    gill.add(tube);
    g.add(gill);
    if (s > 0) {
      anchors.gill = new THREE.Object3D();
      anchors.gill.position.set(0.02, 0.17, 0.1);
      gill.add(anchors.gill);
    }
  }

  // 電池(前の左右、暗い箱に白い板)
  for (const s of [-1, 1]) {
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), m.dark);
    cell.position.set(s * 0.3, y0 + 0.04, 0.34);
    cell.rotation.y = s * 0.35;
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.004, 0.07), m.shell);
    label.position.y = 0.042;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.07), m.orange);
    stripe.position.set(0.04, 0.043, 0);
    cell.add(label, stripe);
    g.add(cell);
  }

  // 甲羅を持ち上げる筒(胴の床の下から甲羅の裏へ。外筒と中の棒、長さは変えずに重なりで伸びる)
  const ramBase = new THREE.Vector3(RAM_X, y0 - 0.06, -0.3);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 14), m.darkMetal);
  sleeve.geometry.translate(0, 0.16, 0);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 10), m.metal);
  rod.geometry.translate(0, -0.25, 0);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 14), m.orange);
  collar.position.y = 0.32;
  sleeve.add(collar);
  g.add(sleeve, rod);
  anchors.ram = new THREE.Object3D();
  anchors.ram.position.set(0, 0.2, 0);
  sleeve.add(anchors.ram);

  return { group: g, anchors, pump, pistons, big, small, ramBase, sleeve, rod };
}

// 時刻 → 回った量(速さの形を足し合わせた表。時刻だけで決まる)
function integrate(t0, t1, rate, hz = 60) {
  const n = Math.ceil((t1 - t0) * hz);
  const tab = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) tab[i] = tab[i - 1] + rate(t0 + (i - 0.5) / hz) / hz;
  return (t) => {
    const f = Math.min(n, Math.max(0, (t - t0) * hz));
    const i = Math.min(n - 1, Math.floor(f));
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
  };
}

export function buildBody(m, { shellAt, walkingAt, ventAt, end }) {
  const carapace = buildCarapace(m);
  const hull = buildHull(m);
  const inner = buildInner(m);
  const group = new THREE.Group();
  group.add(carapace.pivot, hull.group, inner.group);
  const anchors = { ...carapace.anchors, ...hull.anchors, ...inner.anchors };

  // 歯車とポンプの回り方(ふだんはゆっくり、歩く・開ける・泡を吹くと速く)
  const gearTurn = integrate(0, end, (t) => 0.5 + 2.2 * walkingAt(t) + 2.6 * shellAt(t));
  const pumpTurn = integrate(0, end, (t) => 3 + 5 * shellAt(t) + 9 * ventAt(t) + 3 * walkingAt(t));
  const ramTop = new THREE.Vector3(), dir = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  // t: 時刻、open: 甲羅を開く量、show: 甲羅を見せるか
  function update(t, open, show) {
    carapace.pivot.rotation.x = -SHELL_OPEN * open;
    carapace.pivot.visible = show;
    const a = gearTurn(t);
    inner.big.rotation.y = a;
    inner.small.rotation.y = -a * (36 / 14) + 0.1;
    const ph = pumpTurn(t);
    for (const p of inner.pistons) {
      const y = 0.028 * Math.sin(ph + p.userData.phase);
      p.userData.rod.position.y = 0.1 + y;
      p.userData.head.position.y = 0.16 + y;
    }
    // 筒: 外筒は胴から、棒は甲羅の裏の留め具から。互いの向きへ
    carapace.pivot.updateMatrix();
    carapace.shell.updateMatrix();
    ramTop.copy(carapace.ramTop.position).applyMatrix4(carapace.shell.matrix).applyMatrix4(carapace.pivot.matrix);
    dir.subVectors(ramTop, inner.ramBase).normalize();
    inner.sleeve.position.copy(inner.ramBase);
    inner.sleeve.quaternion.setFromUnitVectors(Y, dir);
    inner.rod.position.copy(ramTop);
    inner.rod.quaternion.setFromUnitVectors(Y, dir);
  }

  return { group, carapace, anchors, update };
}
