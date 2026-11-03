import * as THREE from 'three';
import { BELLY_Y, BELLY_R, ARM_COUNT, armAngle } from './body.js';
import { gearGeometry } from './core.js';

// 腹の下: 放射状の黒い板、オレンジの歯車(歯舌の輪)、2 枚のあご(くちばし)。
const HUB_Y = BELLY_Y - BELLY_R * 0.5 + 0.02;   // 腹の一番下

export function buildBeak(m) {
  const g = new THREE.Group();
  const anchors = {};

  // 腹に沿った放射状の黒い板(腕の付け根の間)
  for (let k = 0; k < ARM_COUNT; k++) {
    const a = armAngle(k) + Math.PI / 8;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.42), m.darkMetal);
    fin.position.set(Math.sin(a) * 0.45, BELLY_Y - 0.28, Math.cos(a) * 0.45);
    fin.rotation.y = a;
    fin.rotation.x = 0.55;
    g.add(fin);
  }

  // 台座と歯舌の輪(オレンジの歯車)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 48), m.darkMetal);
  hub.position.y = HUB_Y;
  const radula = new THREE.Mesh(gearGeometry(16, 0.27, 0.23, 0.07, 0.12), m.orange);
  radula.rotation.x = Math.PI / 2;
  radula.position.y = HUB_Y - 0.08;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 24), m.dark);
  collar.position.y = HUB_Y - 0.12;
  g.add(hub, radula, collar);
  anchors.radula = new THREE.Object3D();
  anchors.radula.position.set(0.27, 0, 0);
  radula.add(anchors.radula);
  anchors.hub = new THREE.Object3D();
  anchors.hub.position.set(-0.33, HUB_Y, 0.05);
  g.add(anchors.hub);

  // 2 枚のあご: 円錐を縦に割った半分ずつ。付け根(上)を軸に外へ開く
  const jaws = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, HUB_Y - 0.16, 0);
    // θ が 0〜π の半分は x≥0 側、π〜2π は x≤0 側
    const geo = new THREE.ConeGeometry(0.1, 0.22, 20, 1, false, side > 0 ? 0 : Math.PI, Math.PI);
    geo.rotateX(Math.PI);          // 先を下へ
    geo.translate(0, -0.11, 0);
    const jaw = new THREE.Mesh(geo, m.darkMetal);
    // 先を少し曲げた鉤(かぎ)
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 10), m.darkMetal);
    hook.position.set(side * 0.02, -0.24, 0);
    hook.rotation.set(Math.PI, 0, -side * 0.6);
    pivot.add(jaw, hook);
    pivot.userData.side = side;
    jaws.push(pivot);
    g.add(pivot);
  }
  anchors.jaw = new THREE.Object3D();
  anchors.jaw.position.set(0, HUB_Y - 0.32, 0);
  g.add(anchors.jaw);

  function update(t, open) {
    radula.rotation.z = t * (0.3 + open * 2.2);
    for (const j of jaws) j.rotation.z = j.userData.side * 0.55 * open;   // 蝶番は z 向き。外(±x)へ開く
  }

  return { group: g, anchors, update };
}
