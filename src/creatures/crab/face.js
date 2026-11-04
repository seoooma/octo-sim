import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeEye, rivets } from '../../core/limbs.js';
import { domeY } from './layout.js';

// 顔: 目の柄 2 本(甲羅の前のふち。たたむ・立てる・見回す)、触角 2 本、口(第 3 顎脚の扉 2 枚・大顎・泡を出す口)。

const STALK = { base: 0.16, rod: 0.13, eye: 0.05 };
// 目の柄の向き(体の座標、x は外向きが正): たたむ(前のふちに沿って外へ寝かせる)・立てる・前へ倒す
const FOLD = new THREE.Vector3(0.95, 0.16, -0.22).normalize();
const UP = new THREE.Vector3(0.1, 1, 0.06).normalize();
const TILT = new THREE.Vector3(0.12, 0.75, 0.62).normalize();

// 目の柄(parent は甲羅。甲羅を開くと一緒に持ち上がる)
export function buildEyes(m, parent) {
  const stalks = [-1, 1].map((s) => {
    const root = new THREE.Group();
    root.position.set(s * 0.29, domeY(0.91) + 0.02, 0.62);
    parent.add(root);
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), m.darkMetal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20), m.shell);
    ring.rotation.x = Math.PI / 2;
    root.add(socket, ring);
    const stalk = new THREE.Group();
    root.add(stalk);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, STALK.base, 16), m.shell);
    sleeve.position.y = STALK.base / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.018, 16), m.orange);
    band.position.y = STALK.base * 0.7;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, STALK.rod, 12), m.darkMetal);
    rod.position.y = STALK.base + STALK.rod / 2;
    // 目の玉(白い筒に暗いレンズ、+z が見る向き)
    const pod = new THREE.Group();
    pod.position.y = STALK.base + STALK.rod + 0.02;
    const housing = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), m.shell);
    housing.scale.set(1, 0.92, 1.05);
    const eye = makeEye(m, STALK.eye * 0.72);
    eye.position.z = 0.03;
    pod.add(housing, eye);
    stalk.add(sleeve, band, rod, pod);
    return { s, root, stalk, pod };
  });

  // 触角(目のあいだから前へ、細い暗い線にオレンジの先)
  const antennae = [-1, 1].map((s) => {
    const root = new THREE.Group();
    root.position.set(s * 0.09, domeY(0.92) - 0.01, 0.64);
    parent.add(root);
    // 短い節の触角: 前へ出て、先は外へ少し曲がる(白い付け根の輪・暗い線・オレンジの先)
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.01, 0.03, 0.07), new THREE.Vector3(s * 0.04, 0.06, 0.15), new THREE.Vector3(s * 0.1, 0.07, 0.21)]);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 5, false), m.darkMetal);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 6), m.orange);
    tip.position.copy(curve.getPoint(1));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 12), m.shell);
    base.rotation.x = Math.PI / 2 - 0.4;
    root.add(wire, tip, base);
    return { s, root };
  });

  const anchors = { eyeStalk: new THREE.Object3D(), eyePod: new THREE.Object3D() };
  stalks[1].stalk.add(anchors.eyeStalk);
  anchors.eyeStalk.position.set(0.04, STALK.base * 0.5, 0);
  stalks[0].pod.add(anchors.eyePod);
  anchors.eyePod.position.set(0, 0, 0.07);

  const dir = new THREE.Vector3(), fwd = new THREE.Vector3(), side = new THREE.Vector3(), mB = new THREE.Matrix4();
  // up: 立てる量、tilt: 前へ倒す量、look: [左, 右] の見回す角度(外へ回すのが正)
  function update(t, up, tilt, look) {
    for (const e of stalks) {
      dir.copy(FOLD).lerp(UP, up).lerp(TILT, tilt * up).normalize();
      dir.x *= e.s;
      fwd.set(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
      side.crossVectors(dir, fwd);
      e.stalk.quaternion.setFromRotationMatrix(mB.makeBasis(side, dir, fwd));
      // 見回す(柄のまわりに回す)。立てているときだけ
      e.stalk.rotateY(e.s * (e.s > 0 ? look[0] : look[1]) * up + 0.05 * Math.sin(t * 0.9 + e.s) * up);
    }
    for (const a of antennae) {
      a.root.rotation.set(0.18 * Math.sin(t * 2.1 + a.s) - 0.05, a.s * 0.25 * Math.sin(t * 1.6 + a.s * 2), 0);
    }
  }
  return { stalks, anchors, update };
}

// 口(parent は体。胴の前の面)
const MOUTH = { y: -0.15, z: 0.555 };
export const VENTS = [-1, 1].map((s) => ({ s, pos: new THREE.Vector3(s * 0.2, -0.015, 0.625), dir: new THREE.Vector3(s * 0.25, 0.45, 1).normalize() }));
export const MOUTH_IN = new THREE.Vector3(0, MOUTH.y + 0.01, MOUTH.z - 0.02);   // 拾った物が入っていく所

export function buildMouth(m, parent) {
  const g = new THREE.Group();
  parent.add(g);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.24, 0.04, 2, 0.015), m.darkMetal);
  frame.position.set(0, MOUTH.y, MOUTH.z);
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.02), m.glass);
  cavity.position.set(0, MOUTH.y, MOUTH.z + 0.012);
  g.add(frame, cavity);
  // 大顎(左右に開き閉じする暗い塊、内側はオレンジ)
  const mandibles = [-1, 1].map((s) => {
    const md = new THREE.Group();
    md.position.set(s * 0.05, MOUTH.y, MOUTH.z + 0.025);
    const blk = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.11, 0.035, 2, 0.01), m.dark);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.03), m.orange);
    pad.position.x = -s * 0.03;
    md.add(blk, pad);
    g.add(md);
    return md;
  });
  // 扉(第 3 顎脚): 外の縦の蝶番で開く白い板
  const doors = [-1, 1].map((s) => {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.19, MOUTH.y, MOUTH.z + 0.045);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.21, 0.026, 2, 0.01), m.shell);
    plate.position.x = -s * 0.092;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.008, 0.028), m.dark);
    seam.position.set(-s * 0.092, 0.02, 0.001);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), m.orange);
    tip.position.set(-s * 0.15, -0.085, 0.002);
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 10), m.darkMetal);
    hinge.add(plate, seam, tip, knuckle);
    hinge.add(rivets([new THREE.Vector3(-s * 0.04, 0.07, 0.014), new THREE.Vector3(-s * 0.13, 0.07, 0.014), new THREE.Vector3(-s * 0.04, -0.04, 0.014)], m, 0.008));
    g.add(hinge);
    return { s, hinge };
  });
  // 泡を出す口(扉の上の左右、前上へ向いた短い筒)
  const Y = new THREE.Vector3(0, 1, 0);
  for (const v of VENTS) {
    const tube = new THREE.Group();
    tube.position.copy(v.pos).addScaledVector(v.dir, -0.04);
    tube.quaternion.setFromUnitVectors(Y, v.dir);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.08, 16), m.shell);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 18), m.orange);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.04;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 14), m.glass);
    hole.position.y = 0.037;
    tube.add(body, lip, hole);
    g.add(tube);
  }
  const anchors = { mouth: new THREE.Object3D(), vent: new THREE.Object3D() };
  anchors.mouth.position.set(0.12, MOUTH.y - 0.06, MOUTH.z + 0.06);
  anchors.vent.position.copy(VENTS[1].pos);
  g.add(anchors.mouth, anchors.vent);

  // open: 扉の開き、chew: 大顎を動かす量
  function update(t, open, chew, flutter) {
    for (const d of doors) d.hinge.rotation.y = d.s * (open * 1.15 + flutter * 0.12 * (0.5 + 0.5 * Math.sin(t * 17 + d.s)));
    mandibles.forEach((md, i) => {
      const s = i ? 1 : -1;
      md.position.x = s * (0.05 + 0.025 * chew * (0.5 + 0.5 * Math.sin(t * 9)));
      md.rotation.z = s * 0.15 * chew * Math.sin(t * 9 + 0.6);
    });
  }
  return { anchors, update };
}
