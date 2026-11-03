import * as THREE from 'three';
import { makeMaterials } from '../../materials.js';
import { onEllipsoid, plates, rivets, makeEye, segment, solve2, place, buildLeg, poseLeg } from '../../core/limbs.js';
import { LEGS, SEG, RIDE } from './layout.js';
import { bodyPoseAt, footAt, airAt, T, PEDICEL, RAISE_ANGLE, SPIN_LOCAL } from './path.js';
import { buildWeb } from './web.js';

// 蜘蛛のロボット(Benthos AX-8)。体の座標: 頭が +z、背中が +y、左が +x。
// 体の位置と向き・足の位置は path.js(時刻だけで決まる)。ここは形を作って、関節の角度を足の位置から解く(IK)。

const CEPH = { c: [0, 0.03, 0.22], r: [0.42, 0.26, 0.5] };          // 頭胸部(楕円体)
const ABDO = { c: [0, 0.1, -0.68], r: [0.5, 0.42, 0.66] };           // おなか(付け根 PEDICEL からの位置)
const PALP = [0.3, 0.28];                                             // 触肢の 2 節

export class Spider {
  constructor() {
    const m = (this.materials = makeMaterials());
    m.silk = new THREE.MeshStandardMaterial({ color: 0x6f7c86, roughness: 0.35, metalness: 0.3 });
    m.bead = new THREE.MeshPhysicalMaterial({ color: 0xa9bccb, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 });
    this.group = new THREE.Group();     // 回転台で回すのはこれ(輪ごと)
    this.world = new THREE.Group();     // main.js がシーンに足す(使わない)
    this.focus = new THREE.Vector3();   // カメラが追う点(体の位置)
    const anchors = {};

    // ---- 体
    const body = (this.body = new THREE.Group());
    this.group.add(body);
    body.add(plates(CEPH, m, { bands: 2, segs: 6, theta0: 0, theta1: 1.5 }));
    const sternum = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.darkMetal);
    sternum.scale.set(0.36, 0.14, 0.42);
    sternum.position.set(0, -0.06, 0.2);
    body.add(sternum);
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    // 背中のくぼみ(黒い溝)とオレンジの線
    const fovea = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 12), m.dark);
    fovea.rotation.x = Math.PI / 2;
    fovea.position.set(0, CEPH.c[1] + CEPH.r[1] + 0.005, 0.12);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.3), m.orange);
    stripe.position.set(0, CEPH.c[1] + CEPH.r[1] - 0.005, -0.05);
    stripe.rotation.x = -0.25;
    body.add(fovea, stripe);
    const cephRivets = [];
    for (let k = 0; k < 6; k++) for (const el of [0.35, 0.75]) cephRivets.push(onEllipsoid(CEPH, (k / 6) * Math.PI * 2 + 0.1, el, new THREE.Vector3(), N).multiplyScalar(1.003));
    body.add(rivets(cephRivets, m));

    // 目: 前の大きな 2 つ、横の 2 つ、上の 4 つ
    const eyes = [];
    const addEye = (az, el, r) => {
      for (const s of [-1, 1]) {
        onEllipsoid(CEPH, s * az, el, P, N);
        const e = makeEye(m, r);
        e.position.copy(P).addScaledVector(N, -r * 0.2);
        e.lookAt(e.position.clone().add(N));
        body.add(e);
        eyes.push(e);
      }
    };
    addEye(0.2, 0.32, 0.075);
    addEye(0.62, 0.22, 0.05);
    addEye(0.28, 0.78, 0.045);
    addEye(0.7, 0.62, 0.04);
    anchors.eyes = eyes[1];

    // 鋏角(牙): 目の下に 2 つ。付け根で開く
    this.fangs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.08, -0.08, 0.66);
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.11), m.darkMetal);
      block.position.y = -0.08;
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 12), m.dark);
      fang.position.set(-s * 0.02, -0.22, 0.02);
      fang.rotation.set(Math.PI, 0, s * 0.5);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), m.orange);
      tip.position.y = -0.16;
      pivot.add(block, fang, tip);
      pivot.userData.side = s;
      body.add(pivot);
      return pivot;
    });
    anchors.fang = new THREE.Object3D();
    anchors.fang.position.set(0.12, -0.3, 0.7);
    body.add(anchors.fang);

    // 腹柄(頭胸部とおなかのつなぎ): 暗い軸とばね
    const pedicel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 20), m.darkMetal);
    pedicel.rotation.x = Math.PI / 2;
    pedicel.position.set(0, 0.04, -0.3);
    body.add(pedicel);
    anchors.pedicel = new THREE.Object3D();
    anchors.pedicel.position.set(0, 0.12, -0.3);
    body.add(anchors.pedicel);

    // おなか: 付け根で持ち上がる。帯の板・オレンジの山形の模様・糸いぼ
    const abdo = (this.abdomen = new THREE.Group());
    abdo.position.copy(PEDICEL);
    body.add(abdo);
    abdo.add(plates(ABDO, m, { bands: 5, segs: 8, axis: 'z' }));
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        onEllipsoid(ABDO, Math.PI + s * (0.08 + i * 0.05), 0.95 - i * 0.12, P, N);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2 - i * 0.03, 0.018, 0.05), m.orange);
        bar.position.copy(P).addScaledVector(N, 0.006);
        bar.lookAt(bar.position.clone().add(N));
        bar.rotateZ(s * 0.6);
        abdo.add(bar);
      }
    }
    anchors.abdomen = new THREE.Object3D();
    onEllipsoid(ABDO, Math.PI * 0.75, 0.5, anchors.abdomen.position, N);
    abdo.add(anchors.abdomen);
    // 糸いぼ: 3 対の小さな筒(おしりの先から後ろ下へ)。糸を出すとき伸びて先が光る
    const spin = (this.spinnerets = new THREE.Group());
    spin.position.copy(SPIN_LOCAL).sub(PEDICEL);
    spin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -0.55, -1).normalize());
    abdo.add(spin);
    const spinBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 24), m.darkMetal);
    spinBase.position.y = -0.05;
    spin.add(spinBase);
    this.nozzles = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = i % 2 ? 0.075 : 0.05;
      const n = new THREE.Group();
      n.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.1, 12), m.shell);
      tube.position.y = 0.05;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), m.eyeRim);
      tip.position.y = 0.11;
      n.add(tube, tip);
      spin.add(n);
      this.nozzles.push(n);
    }
    anchors.spinnerets = new THREE.Object3D();
    anchors.spinnerets.position.set(0, 0.15, 0);
    spin.add(anchors.spinnerets);

    // ---- 脚(8 本 × 3 節)と触肢(2 本 × 2 節)。脚は this.group の座標で置く
    this.legs = LEGS.map((L) => ({ L, ...buildLeg(m, this.group, SEG) }));
    const leg = this.legs[0];
    anchors.femur = new THREE.Object3D();
    anchors.femur.position.set(0.09, SEG[0] * 0.5, 0);
    leg.femur.add(anchors.femur);
    anchors.knee = new THREE.Object3D();
    leg.tibia.add(anchors.knee);
    anchors.claw = new THREE.Object3D();
    anchors.claw.position.y = SEG[2];
    leg.tarsus.add(anchors.claw);
    this.palps = [-1, 1].map((s) => {
      const a = segment(m, PALP[0], { shell: [0.04, 0.034], joint: 0.04 });
      const b = segment(m, PALP[1], { shell: [0.034, 0.026], joint: 0.035, claw: true });
      this.group.add(a, b);
      return { s, a, b };
    });

    // ---- 巣を張る輪と糸
    this.web = buildWeb(m);
    this.group.add(this.web.group);

    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.material !== m.silk && o.material !== m.bead;
        o.receiveShadow = true;
      }
    });

    const a = { ...anchors, ...this.web.anchors };
    this.labelSets = {
      legs: [
        { title: 'FEMUR DRIVE', sub: 'LEG L1 · HYDRAULIC', anchor: a.femur },
        { title: 'KNEE JOINT', sub: 'PATELLA · 2 DOF', anchor: a.knee },
        { title: 'TARSAL CLAW', sub: 'GRIP · FLOOR / SILK', anchor: a.claw },
      ],
      optics: [
        { title: 'EYE ARRAY', sub: '8 LENSES · 2 MAIN', anchor: a.eyes },
        { title: 'CHELICERAE', sub: 'TWIN FANG', anchor: a.fang },
      ],
      spin: [
        { title: 'SPINNERETS', sub: '3 PAIRS · VARIABLE GAUGE', anchor: a.spinnerets },
        { title: 'SILK RESERVOIR', sub: 'ABDOMEN TANK', anchor: a.abdomen },
        { title: 'PEDICEL', sub: 'DRIVE COUPLING', anchor: a.pedicel },
      ],
      climb: [
        { title: 'DRAGLINE', sub: 'ANCHOR · HOOP TOP', anchor: a.top },
        { title: 'SPINNERETS', sub: 'REEL IN', anchor: a.spinnerets },
      ],
      radial: [
        { title: 'HUB', sub: 'RADIAL ORIGIN', anchor: a.hub },
        { title: 'FRAME ANCHOR', sub: '12 CLAMPS', anchor: a.rim },
      ],
      spiral: [
        { title: 'CAPTURE SPIRAL', sub: 'LAID BEHIND', anchor: a.spiral },
        { title: 'GLUE BEADS', sub: 'STICKY DROPLETS', anchor: a.bead },
        { title: 'TARSAL CLAW', sub: 'SILK GRIP', anchor: a.claw },
      ],
    };
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3();
    this.tmp = { tuck: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), N: new THREE.Vector3(), pole: new THREE.Vector3() };
  }

  center(out) {
    return this.group.localToWorld(out.copy(this.pos));
  }

  // s: 台本の状態、d: 表示の切り替え(labels / silk / turntable、spin)、draw: false のときは何もしない(助走)
  update(s, d, { draw = true } = {}) {
    if (!draw) return;
    const t = s.t;
    this.group.rotation.y = d.spin;
    // 体
    const surface = bodyPoseAt(t, this.pos, this.quat);
    this.body.position.copy(this.pos);
    this.body.quaternion.copy(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.abdomen.rotation.x = s.raise * RAISE_ANGLE;
    this.spinnerets.scale.set(1, 0.6 + 0.8 * s.spin, 1);
    this.nozzles.forEach((n, i) => (n.rotation.x = n.rotation.z = 0.25 * s.spin * Math.sin(i * 1.1)));
    this.materials.eyeRim.emissiveIntensity = Math.max(s.scan * (0.6 + 0.4 * Math.sin(t * 9)), s.spin * 0.5);
    for (const f of this.fangs) f.rotation.z = f.userData.side * 0.35 * s.fang;
    this.body.updateMatrixWorld(true);

    // 脚: 足の位置(path.js)→ 3 節の関節を解く
    const { tuck, a, b, N, pole } = this.tmp;
    const air = airAt(t);
    for (const leg of this.legs) {
      const { L } = leg;
      const i = LEGS.indexOf(L);
      leg.hip.fromArray(L.hip).applyQuaternion(this.quat).add(this.pos);
      if (air < 1) {
        if (t < (T.air0 + T.air1) / 2) footAt('floor', i, Math.min(t, T.air0 - 1e-6), leg.foot);
        else footAt('web', i, Math.max(t, T.air1), leg.foot);
      }
      if (air > 0) {
        // 登るあいだは脚を体に寄せてたたむ(糸にぶら下がる)
        tuck.set(L.rest[0] * 0.62, -0.16 + 0.05 * Math.sin(t * 2 + i), L.rest[1] * 0.62 + 0.12).applyQuaternion(this.quat).add(this.pos);
        leg.foot.lerp(tuck, air);
      }
      poseLeg(leg, this.up, this.quat);
    }
    // 触肢: 前の床(面)を軽くたたく
    for (const p of this.palps) {
      const tap = Math.max(0, Math.sin(t * 3.3 + p.s)) * 0.12;
      a.set(p.s * 0.14, -0.08, 0.6).applyQuaternion(this.quat).add(this.pos);
      b.set(p.s * 0.26, -RIDE + 0.14 + tap, 1.02).applyQuaternion(this.quat).add(this.pos);
      pole.copy(this.up);
      const knee = solve2(a, b, PALP[0], PALP[1], pole, tuck);
      N.subVectors(b, a).cross(this.up).normalize();
      place(p.a, a, knee, N);
      place(p.b, knee, b, N);
    }
    // 糸
    this.web.update(t, s.raise, d.silk);
    this.group.updateMatrixWorld(true);
    this.focus.copy(this.pos).applyMatrix4(this.group.matrixWorld);
  }
}
