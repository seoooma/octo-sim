import * as THREE from 'three';
import { BELLY_Y, BELLY_R } from './body.js';
import { hash, fract, smoothstep } from '../util.js';
import { pulseAt } from '../sim/timeline.js';

// 噴射口(サイフォン): 腹の後ろから下向きに出た 3 段の筒と、先の 6 枚のひれ。
// 噴射すると泡(ジェットの航跡)を出す。泡も時刻だけで決まる(どの時刻へ飛んでも同じ)。
const SLEEVES = 3;
const FLAPS = 6;
const BUBBLES = 280;
const LIFE = 1.3;   // 泡の寿命(秒)

export function buildSiphon(m) {
  const root = new THREE.Group();
  // 腹の後ろ下に付け、筒の向き(+y)を下やや後ろへ
  const y = BELLY_Y - 0.15;
  const rz = BELLY_R * Math.sqrt(1 - (0.15 / (BELLY_R * 0.5)) ** 2);
  root.position.set(0, y, -rz + 0.04);
  root.scale.setScalar(1.35);   // 遠くからも読めるよう少し大きく
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, -0.55).normalize());
  const anchors = {};

  const sleeves = [];
  for (let i = 0; i < SLEEVES; i++) {
    const r = 0.13 - i * 0.025;
    const s = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.17, 32, 1, true), m.shellDS);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 32), i === SLEEVES - 1 ? m.orange : m.dark);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.085;
    s.add(tube, lip);
    s.userData.home = 0.05 + i * 0.1;
    sleeves.push(s);
    root.add(s);
  }
  anchors.sleeves = new THREE.Object3D();
  sleeves[1].add(anchors.sleeves);
  anchors.sleeves.position.set(0.12, 0, 0);

  // 先の 6 枚のひれ(付け根を軸に外へ開く)
  const nozzle = new THREE.Group();
  sleeves[SLEEVES - 1].add(nozzle);
  nozzle.position.y = 0.09;
  const flaps = [];
  for (let i = 0; i < FLAPS; i++) {
    const a = (i / FLAPS) * Math.PI * 2;
    const hinge = new THREE.Group();
    hinge.position.set(Math.sin(a) * 0.075, 0, Math.cos(a) * 0.075);
    hinge.rotation.y = a;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.012), i % 2 ? m.orange : m.darkMetal);
    flap.position.y = 0.05;
    hinge.add(flap);
    flaps.push(hinge);
    nozzle.add(hinge);
  }
  anchors.nozzle = new THREE.Object3D();
  anchors.nozzle.position.set(0, 0.12, 0);
  nozzle.add(anchors.nozzle);

  // 泡(白い小さな球)。筒の先から +y へ流れて広がる
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), m.bubble, BUBBLES);
  bubbles.frustumCulled = false;
  bubbles.castShadow = false;
  root.add(bubbles);
  anchors.wake = new THREE.Object3D();
  anchors.wake.position.set(-0.2, 1.0, 0);
  root.add(anchors.wake);
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  // open: 筒を伸ばしてひれを開く量、jetFn: 時刻 → 噴射の強さ、wake: 泡を出すか
  function update(t, open, jetFn, wake) {
    const jet = jetFn(t);
    const ext = Math.max(open, jet);
    sleeves.forEach((s, i) => (s.position.y = s.userData.home + ext * i * 0.09));
    const pulse = jet * pulseAt(t);
    for (const f of flaps) f.rotation.x = 0.15 + 0.75 * open + 0.35 * pulse;
    const tipY = sleeves[SLEEVES - 1].position.y + 0.2;
    let n = 0;
    for (let i = 0; i < BUBBLES; i++) {
      const u = t / LIFE + hash(i);
      const cycle = Math.floor(u);
      const age = fract(u) * LIFE;
      const born = jetFn(t - age);
      const on = wake && born > hash(i * 7.3 + cycle * 1.7) * 0.9 + 0.05;
      if (!on) {
        mat.makeScale(0, 0, 0);
      } else {
        const h1 = hash(i * 3.1 + cycle), h2 = hash(i * 5.7 + cycle), h3 = hash(i * 11.3 + cycle);
        const d = tipY + age * (1.4 + 1.6 * h1);
        const spread = 0.05 + age * 0.55;
        pos.set((h2 - 0.5) * spread * 2, d, (h3 - 0.5) * spread * 2);
        const size = (0.006 + 0.016 * h1) * (1 + age * 1.8) * (1 - smoothstep(0.7, 1, age / LIFE));
        scl.set(size, size, size);
        mat.compose(pos, q, scl);
        n++;
      }
      bubbles.setMatrixAt(i, mat);
    }
    bubbles.instanceMatrix.needsUpdate = true;
    bubbles.visible = n > 0;
  }

  return { group: root, anchors, update };
}
