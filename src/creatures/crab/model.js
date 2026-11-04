import * as THREE from 'three';
import { makeMaterials } from '../../materials.js';
import { buildLeg, poseLeg } from '../../core/limbs.js';
import { smoothstep } from '../../util.js';
import { LEGS, SEG, LEG_SIZE } from './layout.js';
import { bodyPoseAt, footAt, walkingAt, T } from './path.js';
import { shellAt, ventAt } from './timeline.js';
import { buildBody } from './shell.js';
import { buildEyes, buildMouth, MOUTH_IN } from './face.js';
import { buildClaw, poseClaw, clawTargetAt, grabLockAt, GRAB } from './claws.js';
import { buildFx } from './fx.js';

// カニのロボット(Benthos CR-10)。体の座標: 頭が +z、背中が +y、左が +x。
// 体の位置と向き・足の位置は path.js(時刻だけで決まる)。ここは形を作って、脚とはさみの関節を IK で解く。

export class Crab {
  constructor() {
    const m = (this.materials = makeMaterials());
    this.group = new THREE.Group();     // 回転台で回すのはこれ(砂の小物ごと)
    this.world = new THREE.Group();     // main.js がシーンに足す(使わない)
    this.focus = new THREE.Vector3();   // カメラが追う点(体の位置)

    // ---- 体(甲羅・胴・中の機械)
    const body = (this.body = new THREE.Group());
    this.group.add(body);
    this.shell = buildBody(m, { shellAt, walkingAt, ventAt, end: T.end });
    body.add(this.shell.group);
    this.eyes = buildEyes(m, this.shell.carapace.shell);
    this.mouth = buildMouth(m, body);

    // ---- 脚(8 本 × 3 節)と、はさみ 2 本。どれも this.group の座標で置く
    this.legs = LEGS.map((L) => ({ L, ...buildLeg(m, this.group, SEG, LEG_SIZE) }));
    this.claws = { R: buildClaw(m, this.group, 'R'), L: buildClaw(m, this.group, 'L') };
    this.target = { P: new THREE.Vector3(), D: new THREE.Vector3(), roll: 0, poleY: 0, open: 0 };

    // ---- 泡・砂・拾う物
    this.fx = buildFx(m);
    this.group.add(this.fx.group);

    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.material !== m.bubble && !o.material.transparent;
        o.receiveShadow = true;
      }
    });

    // 引き出し線の付け根
    const leg = this.legs[1];
    const femur = new THREE.Object3D();
    femur.position.set(0.08, SEG[0] * 0.5, 0);
    leg.femur.add(femur);
    const tip = new THREE.Object3D();
    tip.position.y = SEG[2];
    leg.tarsus.add(tip);
    const a = { ...this.shell.anchors, ...this.eyes.anchors, ...this.mouth.anchors, ...this.fx.anchors };
    const R = this.claws.R.anchors, L = this.claws.L.anchors;
    this.labelSets = {
      legs: [
        { title: 'WALKING LEG', sub: 'L2 · 3 JOINTS · HYDRAULIC', anchor: femur },
        { title: 'DACTYL TIP', sub: 'SAND GRIP', anchor: tip },
        { title: 'CARAPACE', sub: '17 PLATES · RIVETED', anchor: a.carapace },
      ],
      eyes: [
        { title: 'EYE STALK', sub: 'PERISCOPE · FOLDING', anchor: a.eyeStalk },
        { title: 'OPTIC POD', sub: '360° SWIVEL', anchor: a.eyePod },
      ],
      claws: [
        { title: 'CRUSHER CHELA', sub: 'R · MOLAR TEETH', anchor: R.palm },
        { title: 'CUTTER CHELA', sub: 'L · SERRATED', anchor: L.dactyl },
        { title: 'CARPUS JOINT', sub: 'WRIST · 2 DOF', anchor: R.carpus },
      ],
      grab: [
        { title: 'MN NODULE', sub: 'SAMPLE · 38 G', anchor: a.nodule },
        { title: 'CUTTER CHELA', sub: 'PINCH GRIP', anchor: L.palm },
        { title: 'MAXILLIPEDS', sub: 'FEEDING DOORS', anchor: a.mouth },
      ],
      open: [
        { title: 'REAR HINGE', sub: 'CARAPACE · 62°', anchor: a.hinge },
        { title: 'GEAR TRAIN', sub: '36 × 14 TEETH', anchor: a.gears },
        { title: 'GILL STACK', sub: '2 × 9 FINS', anchor: a.gill },
        { title: 'LIFT RAM', sub: 'TELESCOPIC', anchor: a.ram },
      ],
      vent: [
        { title: 'EXHALANT VENT', sub: 'GILL PUMP', anchor: a.vent },
        { title: 'BUBBLE TRAIL', sub: 'PURGE CYCLE', anchor: a.bubbles },
      ],
    };

    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3();
    this.inv = new THREE.Matrix4();
    this.tmp = { m: new THREE.Matrix4(), v: new THREE.Vector3(), w: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1) };
  }

  center(out) {
    return this.group.localToWorld(out.copy(this.pos));
  }

  // s: 台本の状態、d: 表示の切り替え(labels / bubbles / shell / turntable、spin)。draw: false のときは何もしない(助走)
  update(s, d, { draw = true } = {}) {
    if (!draw) return;
    const t = s.t;
    this.group.rotation.y = d.spin;
    // 体
    bodyPoseAt(t, this.pos, this.quat);
    this.body.position.copy(this.pos);
    this.body.quaternion.copy(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.shell.update(t, s.shell, d.shell);
    this.eyes.update(t, s.eyesUp, s.eyeTilt, [s.lookL, s.lookR]);
    this.mouth.update(t, s.mouth, s.chew, s.vent);
    this.materials.eyeRim.emissiveIntensity = s.scan * (0.55 + 0.45 * Math.sin(t * 8));
    this.body.updateMatrixWorld(true);

    // 脚: 足の位置(path.js)→ 3 節の関節を解く
    for (const leg of this.legs) {
      const i = LEGS.indexOf(leg.L);
      leg.hip.fromArray(leg.L.hip).applyQuaternion(this.quat).add(this.pos);
      footAt('floor', i, t, leg.foot);
      poseLeg(leg, this.up, this.quat, 0.8);
    }

    // はさみ。左は拾うあいだ、つまむ点を床の物に合わせる(体の座標へ直して)
    const { m, v, w, one } = this.tmp;
    this.inv.copy(m.compose(this.pos, this.quat, one)).invert();
    const nod = this.fx.NODULE_REST;
    for (const name of ['R', 'L']) {
      const tg = clawTargetAt(name, t, this.target);
      if (name === 'L') {
        const k = grabLockAt(t);
        if (k > 0) {
          v.copy(nod).applyMatrix4(this.inv);
          tg.P.lerp(v, k);
        }
      }
      poseClaw(this.claws[name], this.pos, this.quat, tg);
    }

    // 拾う物: 床 → はさみの中 → 口へ → なくなる
    let nodulePos;
    if (t < GRAB.pinch) nodulePos = undefined;
    else if (t < GRAB.eaten) {
      const c = this.claws.L;
      c.hand.updateMatrix();
      v.copy(c.pinchLocal).applyMatrix4(c.hand.matrix);
      if (t > GRAB.release) {
        w.copy(MOUTH_IN).applyQuaternion(this.quat).add(this.pos);
        v.lerp(w, smoothstep(GRAB.release, GRAB.eaten, t));
      }
      nodulePos = v;
    } else nodulePos = null;
    this.fx.update(t, d.bubbles, nodulePos);

    this.group.updateMatrixWorld(true);
    this.focus.copy(this.pos).applyMatrix4(this.group.matrixWorld);
  }
}
